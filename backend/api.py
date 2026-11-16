
"""WeatherPulse API with Elastic Observability logging."""

from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from opentelemetry import trace

from weather_client import DEFAULT_CITY, fetch_weather, geocode
from elastic_logging import configure_elastic_logging


# --------------------------------------------------
# APPLICATION SETUP
# --------------------------------------------------

app = FastAPI(
    title="WeatherPulse API",
    version="1.0.0"
)

logger = configure_elastic_logging()

origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET"],
    allow_headers=["*"]
)


# --------------------------------------------------
# API REQUEST LOGGING
# --------------------------------------------------

@app.middleware("http")
async def log_api_requests(request: Request, call_next):
    if not request.url.path.startswith("/api/"):
        return await call_next(request)

    start_time = time.perf_counter()

    try:
        response = await call_next(request)

        duration_ms = round(
            (time.perf_counter() - start_time) * 1000,
            2
        )

        span_context = trace.get_current_span().get_span_context()

        log_fields = {
            "http.request.method": request.method,
            "url.path": request.url.path,
            "http.response.status_code": response.status_code,
            "duration_ms": duration_ms,
        }

        if span_context.is_valid:
            log_fields["trace.id"] = format(
                span_context.trace_id, "032x"
            )

        log_method = (
            logger.error
            if response.status_code >= 500
            else logger.warning
            if response.status_code >= 400
            else logger.info
        )

        log_method(
            "HTTP request completed",
            extra=log_fields
        )

        return response

    except Exception:
        duration_ms = round(
            (time.perf_counter() - start_time) * 1000,
            2
        )

        logger.exception(
            "Unhandled HTTP request error",
            extra={
                "http.request.method": request.method,
                "url.path": request.url.path,
                "duration_ms": duration_ms,
            }
        )

        raise


# --------------------------------------------------
# CACHE CONFIGURATION
# --------------------------------------------------

_cache: dict[str, tuple[float, object]] = {}

TTL_WEATHER = 300
TTL_SEARCH = 3600


def cached(key: str, ttl: int, fetcher):
    now = time.monotonic()

    if key in _cache:
        cached_time, cached_value = _cache[key]

        if now - cached_time < ttl:
            return cached_value

    result = fetcher()

    _cache[key] = (now, result)

    return result


# --------------------------------------------------
# WEATHER DATA NORMALIZATION
# --------------------------------------------------

def normalize(payload: dict, city: dict) -> dict:
    current = payload["current"]
    hourly = payload["hourly"]
    daily = payload["daily"]

    return {
        "city": city,

        "timezone": payload.get(
            "timezone",
            city.get("timezone", "UTC")
        ),

        "ingested_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),

        "current": {
            "observed_at_local": current["time"],
            "temperature_c": current.get("temperature_2m"),
            "feels_like_c": current.get("apparent_temperature"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "weather_code": current.get("weather_code"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
            "wind_direction_degrees": current.get(
                "wind_direction_10m"
            ),
            "pressure_hpa": current.get("pressure_msl"),
            "is_day": (
                bool(current["is_day"])
                if current.get("is_day") is not None
                else None
            ),
        },

        "hourly": [
            {
                "forecast_for_local": timestamp,
                "temperature_c": hourly["temperature_2m"][i],
                "feels_like_c": hourly["apparent_temperature"][i],
                "humidity_pct": hourly["relative_humidity_2m"][i],
                "precip_probability_pct": hourly[
                    "precipitation_probability"
                ][i],
                "weather_code": hourly["weather_code"][i],
                "wind_speed_kmh": hourly["wind_speed_10m"][i],
                "visibility_m": hourly["visibility"][i],
            }
            for i, timestamp in enumerate(hourly["time"])
        ],

        "daily": [
            {
                "forecast_date": date,
                "temp_max_c": daily["temperature_2m_max"][i],
                "temp_min_c": daily["temperature_2m_min"][i],
                "weather_code": daily["weather_code"][i],
                "precip_prob_pct": daily[
                    "precipitation_probability_max"
                ][i],
                "uv_index_max": daily["uv_index_max"][i],
                "sunrise_local": daily["sunrise"][i],
                "sunset_local": daily["sunset"][i],
            }
            for i, date in enumerate(daily["time"])
        ],
    }


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "WeatherPulse API"
    }


# --------------------------------------------------
# CITY SEARCH
# --------------------------------------------------

@app.get("/api/cities/search")
def cities_search(
    q: str = Query(min_length=2, max_length=80)
):
    try:
        return cached(
            f"search:{q.casefold().strip()}",
            TTL_SEARCH,
            lambda: geocode(q.strip())
        )

    except Exception as exc:
        error_code = getattr(exc, "code", None)

        logger.exception(
            "Geocoding failed",
            extra={
                "error.code": error_code,
                "error.type": type(exc).__name__,
            }
        )

        raise HTTPException(
            status_code=502,
            detail="City search is temporarily unavailable"
        ) from exc


# --------------------------------------------------
# WEATHER API
# --------------------------------------------------

@app.get("/api/weather")
def weather(
    lat: float = Query(
        DEFAULT_CITY["latitude"],
        ge=-90,
        le=90
    ),
    lon: float = Query(
        DEFAULT_CITY["longitude"],
        ge=-180,
        le=180
    ),
    name: str = Query(
        DEFAULT_CITY["name"],
        max_length=100
    ),
    country: str = Query(
        DEFAULT_CITY["country"],
        max_length=100
    ),
    admin1: str = Query(
        DEFAULT_CITY["admin1"],
        max_length=100
    )
):
    key = f"weather:{lat:.4f}:{lon:.4f}"

    city = {
        "name": name,
        "country": country,
        "admin1": admin1,
        "latitude": lat,
        "longitude": lon
    }

    try:
        # Cache raw weather data, allowing each visitor
        # to have their own city label.

        raw = cached(
            key,
            TTL_WEATHER,
            lambda: fetch_weather(lat, lon)
        )

        return normalize(raw, city)

    except HTTPError as exc:
        logger.exception(
            "Weather provider HTTP error",
            extra={
                "error.code": exc.code,
                "error.type": "HTTPError",
                "weather.city": name,
                "weather.latitude": lat,
                "weather.longitude": lon,
            }
        )

        raise HTTPException(
            status_code=502,
            detail="Weather data is temporarily unavailable"
        ) from exc

    except Exception as exc:
        logger.exception(
            "Weather lookup failed",
            extra={
                "error.code": getattr(exc, "code", None),
                "error.type": type(exc).__name__,
                "weather.city": name,
            }
        )

        raise HTTPException(
            status_code=502,
            detail="Weather data is temporarily unavailable"
        ) from exc


# --------------------------------------------------
# SERVE REACT FRONTEND
# --------------------------------------------------

FRONTEND_DIST = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "dist"
)

if FRONTEND_DIST.joinpath("index.html").is_file():

    app.mount(
        "/",
        StaticFiles(
            directory=str(FRONTEND_DIST),
            html=True
        ),
        name="frontend"
    )

else:

    @app.get("/")
    def local_backend_info():
        return {
            "message": (
                "WeatherPulse API is running. "
                "Start the React dev server or build "
                "the frontend to serve the dashboard here."
            )
        }
