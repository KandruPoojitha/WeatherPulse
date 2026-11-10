"""WeatherPulse public API. Small in-process TTL cache reduces provider requests."""
from datetime import datetime, timezone
from pathlib import Path
import logging
import os
import time
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from weather_client import DEFAULT_CITY, fetch_weather, geocode

app = FastAPI(title='WeatherPulse API', version='1.0.0')
origins = [s.strip() for s in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET'], allow_headers=['*'])

_cache: dict[str, tuple[float, object]] = {}
TTL_WEATHER = 300
TTL_SEARCH = 3600


def cached(key: str, ttl: int, fetcher):
    now = time.monotonic()
    if key in _cache and now - _cache[key][0] < ttl:
        return _cache[key][1]
    result = fetcher()
    _cache[key] = (now, result)
    return result


def normalize(payload: dict, city: dict) -> dict:
    c, h, d = payload['current'], payload['hourly'], payload['daily']
    return {
        'city': city,
        'timezone': payload.get('timezone', city.get('timezone', 'UTC')),
        'ingested_at_utc': datetime.now(timezone.utc).isoformat(),
        'current': {
            'observed_at_local': c['time'], 'temperature_c': c.get('temperature_2m'), 'feels_like_c': c.get('apparent_temperature'),
            'humidity_pct': c.get('relative_humidity_2m'), 'weather_code': c.get('weather_code'),
            'wind_speed_kmh': c.get('wind_speed_10m'), 'wind_direction_degrees': c.get('wind_direction_10m'),
            'pressure_hpa': c.get('pressure_msl'), 'is_day': bool(c['is_day']) if c.get('is_day') is not None else None,
        },
        'hourly': [{
            'forecast_for_local': t, 'temperature_c': h['temperature_2m'][i],
            'feels_like_c': h['apparent_temperature'][i], 'humidity_pct': h['relative_humidity_2m'][i],
            'precip_probability_pct': h['precipitation_probability'][i], 'weather_code': h['weather_code'][i],
            'wind_speed_kmh': h['wind_speed_10m'][i], 'visibility_m': h['visibility'][i],
        } for i, t in enumerate(h['time'])],
        'daily': [{
            'forecast_date': date, 'temp_max_c': d['temperature_2m_max'][i], 'temp_min_c': d['temperature_2m_min'][i],
            'weather_code': d['weather_code'][i], 'precip_prob_pct': d['precipitation_probability_max'][i],
            'uv_index_max': d['uv_index_max'][i], 'sunrise_local': d['sunrise'][i], 'sunset_local': d['sunset'][i],
        } for i, date in enumerate(d['time'])]
    }


@app.get('/api/health')
def health():
    return {'status': 'ok', 'service': 'WeatherPulse API'}


@app.get('/api/cities/search')
def cities_search(q: str = Query(min_length=2, max_length=80)):
    try:
        return cached(f'search:{q.casefold().strip()}', TTL_SEARCH, lambda: geocode(q.strip()))
    except Exception as exc:
        logging.exception('Geocoding failed')
        raise HTTPException(502, 'City search is temporarily unavailable') from exc


@app.get('/api/weather')
def weather(lat: float = Query(DEFAULT_CITY['latitude'], ge=-90, le=90),
            lon: float = Query(DEFAULT_CITY['longitude'], ge=-180, le=180),
            name: str = Query(DEFAULT_CITY['name'], max_length=100),
            country: str = Query(DEFAULT_CITY['country'], max_length=100),
            admin1: str = Query(DEFAULT_CITY['admin1'], max_length=100)):
    key = f'weather:{lat:.4f}:{lon:.4f}'
    city = {'name': name, 'country': country, 'admin1': admin1, 'latitude': lat, 'longitude': lon}
    try:
        # Cache raw provider results, so each visitor can have their own city label.
        raw = cached(key, TTL_WEATHER, lambda: fetch_weather(lat, lon))
        return normalize(raw, city)
    except Exception as exc:
        logging.exception('Weather lookup failed')
        raise HTTPException(502, 'Weather data is temporarily unavailable') from exc


# Serve the production React build from the SAME FastAPI web service.
# The API routes above are registered first and remain available at /api/*.
# In local development, Vite still serves the React app on port 5173.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / 'frontend' / 'dist'
if FRONTEND_DIST.joinpath('index.html').is_file():
    app.mount('/', StaticFiles(directory=str(FRONTEND_DIST), html=True), name='frontend')
else:
    @app.get('/')
    def local_backend_info():
        return {'message': 'WeatherPulse API is running. Start the React dev server or build the frontend to serve the dashboard here.'}
