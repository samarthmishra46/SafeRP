from datetime import timedelta

import pytest

from core.domain.checkpoints import Checkpoint
from core.domain.evaluate import (
    RouteInput,
    evaluate_plan,
    evaluate_route,
    weather_key,
)
from core.domain.risk import RiskLevel
from tests.helpers import T0, make_series


def route(name, lon, minutes, n=3, miles=50):
    """A route with n checkpoints at a single longitude (one forecast location)."""
    step_m = miles * 1609.344 / (n - 1)
    step_s = minutes * 60 / (n - 1)
    cps = [
        Checkpoint(i, lon, 40.0, i * step_m, i * step_s, T0 + timedelta(seconds=i * step_s))
        for i in range(n)
    ]
    return RouteInput(name, cps, miles * 1609.344, minutes * 60)


def test_evaluate_route_classifies_and_attributes_miles():
    r = route("Route A", -100.0, 60)
    forecasts = {weather_key(-100.0, 40.0): make_series(gust=36, rain=0.3)}
    ev = evaluate_route(r, forecasts, load_lb=20_000, wind_metric="gust")
    assert [c.risk.level for c in ev.checkpoints] == [RiskLevel.HIGH] * 3
    assert ev.summary.miles(RiskLevel.HIGH) == pytest.approx(50.0)
    owned_miles = [c.owned_m / 1609.344 for c in ev.checkpoints]
    assert owned_miles == pytest.approx([12.5, 25, 12.5])


def test_wind_metric_switch_changes_level():
    r = route("Route A", -100.0, 60)
    forecasts = {weather_key(-100.0, 40.0): make_series(gust=40, speed=20)}
    gust = evaluate_route(r, forecasts, 20_000, "gust")
    sustained = evaluate_route(r, forecasts, 20_000, "sustained")
    assert gust.checkpoints[0].risk.level == RiskLevel.HIGH
    assert sustained.checkpoints[0].risk.level == RiskLevel.LOW


def test_plan_recommends_safer_route():
    a = route("Route A", -100.0, 60)
    b = route("Route B", -101.0, 80)
    forecasts = {
        weather_key(-100.0, 40.0): make_series(gust=47),  # Severe
        weather_key(-101.0, 40.0): make_series(gust=10),
    }
    plan = evaluate_plan([a, b], forecasts, 20_000, "gust", T0)
    assert plan.best_index == 1
    assert not plan.not_recommended
    assert plan.suggestion is None
    assert plan.reason == "Route B has 0 Severe miles vs 50 on Route A, and is 20 minutes longer."


def test_heavy_load_turns_severe_wind_into_no_travel():
    a = route("Route A", -100.0, 60)
    forecasts = {weather_key(-100.0, 40.0): make_series(gust=47)}
    light = evaluate_plan([a], forecasts, 30_000, "gust", T0)
    heavy = evaluate_plan([a], forecasts, 30_001, "gust", T0)
    assert light.routes[0].summary.max_level == RiskLevel.SEVERE
    assert heavy.routes[0].summary.max_level == RiskLevel.NO_TRAVEL
    assert heavy.not_recommended


def test_suggests_nearest_later_departure_that_clears_no_travel():
    a = route("Route A", -100.0, 60)
    # 60 mph gusts in hourly buckets 0..4 (the hours ending 00:00..04:00), calm afterwards.
    storm = make_series(gust=lambda i: 60 if i <= 4 else 10)
    plan = evaluate_plan([a], {weather_key(-100.0, 40.0): storm}, 20_000, "gust", T0)
    assert plan.not_recommended
    # Leaving at 04:00 still reads bucket 4 at the origin; leaving at 05:00 is clear.
    assert plan.suggestion is not None
    assert plan.suggestion.shift_hours == 5
    assert plan.suggestion.departure == T0 + timedelta(hours=5)


def test_no_suggestion_when_storm_outlasts_search_window():
    a = route("Route A", -100.0, 60)
    storm = make_series(gust=60)
    plan = evaluate_plan([a], {weather_key(-100.0, 40.0): storm}, 20_000, "gust", T0)
    assert plan.not_recommended
    assert plan.suggestion is None


def test_no_suggestion_beyond_fetched_forecast():
    a = route("Route A", -100.0, 60)
    storm = make_series(hours=4, gust=60)
    plan = evaluate_plan([a], {weather_key(-100.0, 40.0): storm}, 20_000, "gust", T0)
    assert plan.suggestion is None
