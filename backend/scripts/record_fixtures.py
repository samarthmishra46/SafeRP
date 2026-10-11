"""Record real upstream responses into tests/fixtures (needs MAPBOX_ACCESS_TOKEN).

Usage: uv run python scripts/record_fixtures.py
Route steps are dropped to keep fixtures small; nothing else is altered.
"""

import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "saferp.settings")

import django  # noqa: E402

django.setup()
from django.conf import settings  # noqa: E402

OUT = ROOT / "tests" / "fixtures"
TOKEN = settings.MAPBOX_ACCESS_TOKEN
FORT_WORTH = (-97.3308, 32.7555)
DALLAS = (-96.7970, 32.7767)
ROUTE_PARAMS = {
    "alternatives": "true",
    "geometries": "geojson",
    "overview": "full",
    "steps": "true",
    "annotations": "duration,distance",
    "max_weight": 16.33,
    "access_token": TOKEN,
}


def directions(coords, **extra):
    path = ";".join(f"{lon},{lat}" for lon, lat in coords)
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{path}"
    body = requests.get(url, params={**ROUTE_PARAMS, **extra}, timeout=30).json()
    for route in body.get("routes", []):
        for leg in route["legs"]:
            leg["steps"] = []
    return body


def save(name, body):
    (OUT / name).write_text(json.dumps(body, separators=(",", ":")))
    print("wrote", name)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    save("mapbox_directions.json", directions([FORT_WORTH, DALLAS]))
    save(
        "mapbox_directions_via.json",
        directions([FORT_WORTH, (-97.05, 32.9), DALLAS], alternatives="false", waypoints="0;2"),
    )
    geo = requests.get(
        "https://api.mapbox.com/search/geocode/v6/forward",
        params={"q": "fort worth", "autocomplete": "true", "limit": 3, "access_token": TOKEN},
        timeout=30,
    ).json()
    save("mapbox_geocode.json", geo)
    weather = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": 32.76,
            "longitude": -97.33,
            "hourly": "wind_speed_10m,wind_gusts_10m,wind_direction_10m,rain,showers,"
            "snowfall,temperature_2m",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "past_hours": 2,
            "forecast_hours": 170,
        },
        timeout=30,
    ).json()
    save("open_meteo_location.json", weather)


if __name__ == "__main__":
    main()
