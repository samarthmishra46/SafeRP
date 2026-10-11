import gzip
import json

import pytest
import responses
from django.test import Client
from rest_framework.throttling import ScopedRateThrottle

from tests.conftest import (
    DALLAS,
    DIRECTIONS_URL,
    FORT_WORTH,
    GEOCODE_URL,
    OPEN_METEO_URL,
    iso_in,
)

client = Client()


def plan(**overrides):
    body = {
        "origin": FORT_WORTH,
        "destination": DALLAS,
        "departure": iso_in(1),
        "weightLb": 36_000,
        "intervalMi": 10,
        **overrides,
    }
    return client.post("/api/plan", json.dumps(body), content_type="application/json")


def assert_error(response, status, code=None, text=None):
    assert response.status_code == status, response.content
    err = response.json()["error"]
    assert set(err) >= {"code", "message"}
    if code:
        assert err["code"] == code
    if text:
        assert text.lower() in err["message"].lower()
    assert "Traceback" not in response.content.decode()


# --- /api/plan ---------------------------------------------------------------


def test_plan_happy_path(upstreams):
    r = plan()
    assert r.status_code == 200, r.content
    data = r.json()
    assert 1 <= len(data["routes"]) <= 3
    ids = [route["id"] for route in data["routes"]]
    assert data["recommendation"]["routeId"] in ids
    assert data["recommendation"]["reason"]
    assert [x["rank"] for x in data["recommendation"]["ranking"]] == list(range(1, len(ids) + 1))
    for route in data["routes"]:
        cps = route["checkpoints"]
        assert cps[0]["distanceMi"] == 0
        assert cps[-1]["distanceMi"] == pytest.approx(route["distanceMi"], abs=0.05)
        assert len(route["segments"]) == len(cps)
        assert len(route["geometry"]) == len(route["cumDurationS"])
        etas = [c["eta"] for c in cps]
        assert etas == sorted(etas)
        owned = sum(c["spanMi"][1] - c["spanMi"][0] for c in cps)
        assert owned == pytest.approx(route["distanceMi"], abs=0.1)
        miles = route["summary"]["miles"]
        assert sum(miles.values()) == pytest.approx(route["distanceMi"], abs=0.3)
        for cp in cps:
            assert {"windSpeedMph", "windGustMph", "rainIn", "snowIn"} <= set(cp["weather"])
            assert cp["weather"]["windUsedMph"] == cp["weather"]["windGustMph"]


def test_plan_sends_truck_weight_and_required_params(upstreams):
    plan(weightLb=36_000)
    url = upstreams.calls_to(DIRECTIONS_URL)[0].request.url
    for part in (
        "max_weight=16.33",
        "alternatives=true",
        "geometries=geojson",
        "overview=full",
        "steps=true",
        "annotations=duration%2Cdistance",
    ):
        assert part in url


def test_plan_batches_weather_in_one_call_and_caches(upstreams):
    assert plan().status_code == 200
    weather_calls = len(upstreams.calls_to(OPEN_METEO_URL))
    route_calls = len(upstreams.calls_to(DIRECTIONS_URL))
    assert weather_calls == 1  # < 100 distinct points -> one batched request
    assert plan().status_code == 200
    assert len(upstreams.calls_to(OPEN_METEO_URL)) == weather_calls
    assert len(upstreams.calls_to(DIRECTIONS_URL)) == route_calls


def test_plan_requests_alternatives_when_fewer_than_three(upstreams):
    plan()
    urls = [c.request.url for c in upstreams.calls_to(DIRECTIONS_URL)]
    assert any("exclude=motorway" in u for u in urls)
    assert any("exclude=toll" in u for u in urls)
    assert sum("waypoints=0%3B2" in u for u in urls) == 2


def test_plan_storm_marks_not_recommended_and_suggests_departure(upstreams):
    # 60 mph gusts for the next few hours, calm afterwards.
    def storm(i, field, value):
        if field == "wind_gusts_10m":
            return 60.0 if i <= 6 else 10.0
        return value

    upstreams.weather_override = storm
    data = plan(departure=iso_in(0.1)).json()
    rec = data["recommendation"]
    assert rec["notRecommended"] is True
    assert rec["suggestion"] is not None
    assert 1 <= rec["suggestion"]["shiftHours"] <= 12
    best = next(r for r in data["routes"] if r["id"] == rec["routeId"])
    assert best["summary"]["miles"]["noTravel"] > 0
    cp = best["checkpoints"][0]
    assert cp["levelLabel"] == "No Travel"
    assert cp["drivers"] == ["wind"]


def test_plan_heavy_load_rule_applied(upstreams):
    def gusty(i, field, value):
        return 47.0 if field == "wind_gusts_10m" else value

    upstreams.weather_override = gusty
    light = plan(weightLb=30_000).json()["routes"][0]["checkpoints"][0]
    heavy = plan(weightLb=30_001).json()["routes"][0]["checkpoints"][0]
    assert light["levelLabel"] == "Severe"
    assert heavy["levelLabel"] == "No Travel"
    assert heavy["loadRule"]


@pytest.mark.parametrize(
    ("overrides", "text"),
    [
        ({"weightLb": 999}, "between 1,000 and 80,000"),
        ({"weightLb": 80_001}, "between 1,000 and 80,000"),
        ({"intervalMi": 30}, "10, 25 or 50"),
        ({"departure": iso_in(-1)}, "in the past"),
        ({"departure": iso_in(24 * 30)}, "forecast window"),
        ({"destination": FORT_WORTH}, "must be different"),
        ({"origin": {"lon": 500, "lat": 0}}, "origin"),
    ],
)
def test_plan_validation_errors(overrides, text):
    assert_error(plan(**overrides), 400, "invalid_request", text)


def test_plan_departure_slack_allows_a_few_minutes_ago(upstreams):
    assert plan(departure=iso_in(-0.05)).status_code == 200


def test_plan_beyond_forecast_horizon(upstreams, settings):
    settings.FORECAST_HORIZON_HOURS = 2
    assert_error(plan(departure=iso_in(1.9)), 422, "beyond_forecast_horizon", "forecast ends")


def test_plan_too_many_points(upstreams, settings):
    settings.MAX_WEATHER_POINTS = 3
    assert_error(plan(), 422, "too_many_checkpoints", "wider checkpoint interval")


def test_plan_no_route(upstreams):
    upstreams.rsps.replace(
        responses.GET, DIRECTIONS_URL, json={"code": "NoRoute", "message": "No route found"}
    )
    assert_error(plan(), 422, "no_route")


def test_plan_mapbox_failure_is_502(upstreams):
    upstreams.rsps.replace(responses.GET, DIRECTIONS_URL, json={"message": "boom"}, status=500)
    assert_error(plan(), 502, "upstream_error", "Mapbox Directions")


def test_plan_mapbox_bad_token_is_502(upstreams):
    upstreams.rsps.replace(
        responses.GET, DIRECTIONS_URL, json={"message": "Not Authorized"}, status=401
    )
    assert_error(plan(), 502, "upstream_error", "token was rejected")


def test_plan_open_meteo_rate_limit_is_502(upstreams):
    upstreams.rsps.replace(
        responses.GET, OPEN_METEO_URL, json={"error": True, "reason": "limit"}, status=429
    )
    assert_error(plan(), 502, "upstream_error", "rate limit")


def test_plan_network_error_is_502(upstreams):
    import requests

    upstreams.rsps.replace(
        responses.GET, OPEN_METEO_URL, body=requests.ConnectionError("network down")
    )
    assert_error(plan(), 502, "upstream_error", "could not be reached")


def test_plan_response_is_gzipped(upstreams):
    body = {
        "origin": FORT_WORTH,
        "destination": DALLAS,
        "departure": iso_in(1),
        "weightLb": 20_000,
    }
    r = client.post(
        "/api/plan", json.dumps(body), content_type="application/json", HTTP_ACCEPT_ENCODING="gzip"
    )
    assert r.status_code == 200
    assert r["Content-Encoding"] == "gzip"
    assert json.loads(gzip.decompress(r.content))["meta"]["intervalMi"] == 25


def test_plan_malformed_json():
    r = client.post("/api/plan", "{not json", content_type="application/json")
    assert_error(r, 400)


# --- /api/geocode ------------------------------------------------------------


def test_geocode_returns_places(upstreams):
    r = client.get("/api/geocode", {"q": "fort worth"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert results and {"id", "name", "label", "lon", "lat"} <= set(results[0])
    url = upstreams.calls_to(GEOCODE_URL)[0].request.url
    assert "autocomplete=true" in url and "country=us" in url
    # Cached: a second identical query does not call Mapbox again.
    client.get("/api/geocode", {"q": "Fort  Worth"})
    assert len(upstreams.calls_to(GEOCODE_URL)) == 1


def test_geocode_query_too_short():
    assert_error(client.get("/api/geocode", {"q": "a"}), 400, "invalid_request")


def test_geocode_upstream_error(upstreams):
    upstreams.rsps.replace(responses.GET, GEOCODE_URL, json={}, status=401)
    assert_error(client.get("/api/geocode", {"q": "dallas"}), 502, "upstream_error")


def test_missing_token_is_reported(settings):
    settings.MAPBOX_ACCESS_TOKEN = ""
    assert_error(client.get("/api/geocode", {"q": "dallas"}), 502, text="no Mapbox access token")


def test_throttling(upstreams, monkeypatch):
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"geocode": "2/min"})
    for _ in range(2):
        assert client.get("/api/geocode", {"q": "dallas"}).status_code == 200
    assert_error(client.get("/api/geocode", {"q": "dallas"}), 429, "rate_limited")


# --- /api/heatmap ------------------------------------------------------------


def test_heatmap_payload_shape(upstreams):
    r = client.get("/api/heatmap", {"bbox": "-97.4,32.7,-96.7,32.9"})
    assert r.status_code == 200
    data = r.json()
    n = len(data["points"])
    assert 0 < n <= 400
    assert data["hours"] == 48 and len(data["times"]) == 49
    for field in ("wind", "rain", "snow"):
        assert len(data[field]) == 49
        assert all(len(frame) == n for frame in data[field])
    assert len(upstreams.calls_to(OPEN_METEO_URL)) == -(-n // 100)


def test_heatmap_scales_grid_for_big_corridor(upstreams):
    r = client.get("/api/heatmap", {"bbox": "-118,33,-74,41"})
    assert r.status_code == 200
    assert len(r.json()["points"]) <= 400


@pytest.mark.parametrize("bbox", ["1,2,3", "-90,40,-100,30", "-170,0,170,80", "a,b,c,d"])
def test_heatmap_bad_bbox(bbox):
    assert_error(client.get("/api/heatmap", {"bbox": bbox}), 400, "invalid_request")


def test_unknown_method_is_json_error():
    r = client.delete("/api/plan")
    assert_error(r, 405)
