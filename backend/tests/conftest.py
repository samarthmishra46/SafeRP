import copy
import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
import responses
from django.core.cache import cache

FIXTURES = Path(__file__).parent / "fixtures"
DIRECTIONS_URL = re.compile(r"https://api\.mapbox\.com/directions/v5/mapbox/driving/.*")
GEOCODE_URL = re.compile(r"https://api\.mapbox\.com/search/geocode/v6/forward.*")
OPEN_METEO_URL = re.compile(r"https://api\.open-meteo\.com/v1/forecast.*")

FORT_WORTH = {"lon": -97.3308, "lat": 32.7555, "label": "Fort Worth, Texas"}
DALLAS = {"lon": -96.7970, "lat": 32.7767, "label": "Dallas, Texas"}


def load(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture(autouse=True)
def _settings_and_cache(settings):
    settings.MAPBOX_ACCESS_TOKEN = "pk.test-token"
    cache.clear()
    yield
    cache.clear()


class Upstreams:
    """Mocked Mapbox and Open-Meteo, driven by recorded fixtures."""

    def __init__(self, rsps):
        self.rsps = rsps
        self.weather_override = None  # callable(hour_index, field, value) -> value
        rsps.add_callback(responses.GET, DIRECTIONS_URL, callback=self._directions)
        rsps.add_callback(responses.GET, OPEN_METEO_URL, callback=self._weather)
        rsps.add(responses.GET, GEOCODE_URL, json=load("mapbox_geocode.json"))

    def calls_to(self, pattern):
        return [c for c in self.rsps.calls if pattern.match(c.request.url)]

    def _directions(self, request):
        params = parse_qs(urlparse(request.url).query)
        if "waypoints" in params:
            return 200, {}, json.dumps(load("mapbox_directions_via.json"))
        return 200, {}, json.dumps(load("mapbox_directions.json"))

    def _weather(self, request):
        params = parse_qs(urlparse(request.url).query)
        lats = params["latitude"][0].split(",")
        lons = params["longitude"][0].split(",")
        template = load("open_meteo_location.json")
        start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
        n = len(template["hourly"]["time"])
        template["hourly"]["time"] = [
            (start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(n)
        ]
        if self.weather_override:
            for field, values in template["hourly"].items():
                if field != "time":
                    template["hourly"][field] = [
                        self.weather_override(i, field, v) for i, v in enumerate(values)
                    ]
        out = []
        for lat, lon in zip(lats, lons, strict=True):
            loc = copy.deepcopy(template)
            loc["latitude"], loc["longitude"] = float(lat), float(lon)
            out.append(loc)
        return 200, {}, json.dumps(out if len(out) > 1 else out[0])


@pytest.fixture
def upstreams():
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield Upstreams(rsps)


def iso_in(hours=1.0):
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")
