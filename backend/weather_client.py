"""Open-Meteo weather and geocoding client. No credentials required for non-commercial demos."""
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
DEFAULT_CITY = {'id': 6167865, 'name': 'Toronto', 'admin1': 'Ontario', 'country': 'Canada', 'latitude': 43.6532, 'longitude': -79.3832, 'timezone': 'America/Toronto'}


def get_json(url: str, params: dict) -> dict:
    request = Request(url + '?' + urlencode(params), headers={'User-Agent': 'WeatherPulse/1.0 (portfolio demo)'})
    with urlopen(request, timeout=18) as response:
        return json.load(response)


def geocode(query: str) -> list:
    payload = get_json(GEOCODE_URL, {'name': query, 'count': 8, 'language': 'en', 'format': 'json'})
    return [{'id': c.get('id'), 'name': c['name'], 'admin1': c.get('admin1', ''), 'country': c.get('country', ''),
             'latitude': c['latitude'], 'longitude': c['longitude'], 'timezone': c.get('timezone', 'UTC')}
            for c in payload.get('results', [])]


def fetch_weather(latitude: float, longitude: float, timezone: str = 'auto') -> dict:
    return get_json(FORECAST_URL, {
        'latitude': latitude, 'longitude': longitude, 'timezone': timezone,
        'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day',
        'hourly': 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,visibility',
        'daily': 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,uv_index_max,sunrise,sunset',
        'forecast_days': 7,
    })
