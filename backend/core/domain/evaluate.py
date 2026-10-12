"""Evaluate routes against forecasts: classify checkpoints, summarise, rank, recommend.

Everything here is pure: forecasts arrive as already-fetched `HourlySeries` keyed by
`weather_key`, so re-evaluating at a later departure costs no network calls.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from .checkpoints import Checkpoint, owned_spans, shift_checkpoints
from .ranking import RouteSummary, explain, rank, summarize
from .risk import RiskAssessment, RiskLevel, classify
from .weather import HourlySeries, WeatherSample

MAX_DEPARTURE_SHIFT_HOURS = 12

WeatherKey = tuple[float, float]


def weather_key(lon: float, lat: float) -> WeatherKey:
    """Forecast lookup key: coordinates rounded to 2 decimals (~1 km)."""
    return (round(lat, 2), round(lon, 2))


class ForecastUnavailable(Exception):
    """A checkpoint's ETA falls outside the fetched forecast."""


@dataclass(frozen=True)
class EvaluatedCheckpoint:
    checkpoint: Checkpoint
    weather: WeatherSample
    risk: RiskAssessment
    wind_used_mph: float | None
    span_m: tuple[float, float]

    @property
    def owned_m(self) -> float:
        return self.span_m[1] - self.span_m[0]


@dataclass(frozen=True)
class RouteInput:
    name: str
    checkpoints: list[Checkpoint]
    distance_m: float
    duration_s: float


@dataclass(frozen=True)
class RouteEvaluation:
    name: str
    checkpoints: list[EvaluatedCheckpoint]
    summary: RouteSummary


@dataclass(frozen=True)
class DepartureSuggestion:
    shift_hours: int
    departure: datetime
    route_index: int


@dataclass(frozen=True)
class PlanEvaluation:
    routes: list[RouteEvaluation]
    order: list[int]
    reason: str
    # The best route still crosses No Travel conditions at this departure time.
    not_recommended: bool
    suggestion: DepartureSuggestion | None

    @property
    def best_index(self) -> int:
        return self.order[0]


def evaluate_route(
    route: RouteInput,
    forecasts: Mapping[WeatherKey, HourlySeries],
    load_lb: float,
    wind_metric: str,
) -> RouteEvaluation:
    spans = owned_spans([c.distance_m for c in route.checkpoints])
    evaluated = []
    for cp, span in zip(route.checkpoints, spans, strict=True):
        series = forecasts.get(weather_key(cp.lon, cp.lat))
        sample = series.sample(cp.eta) if series else None
        if sample is None:
            raise ForecastUnavailable(f"No forecast for checkpoint {cp.index} at {cp.eta}")
        wind = sample.wind_for_metric(wind_metric)
        risk = classify(wind, sample.rain_in, sample.snow_in, load_lb)
        evaluated.append(EvaluatedCheckpoint(cp, sample, risk, wind, span))
    summary = summarize(
        [e.owned_m for e in evaluated],
        [e.risk.level for e in evaluated],
        route.distance_m,
        route.duration_s,
    )
    return RouteEvaluation(route.name, evaluated, summary)


def _rank_routes(
    routes: Sequence[RouteInput],
    forecasts: Mapping[WeatherKey, HourlySeries],
    load_lb: float,
    wind_metric: str,
) -> tuple[list[RouteEvaluation], list[int]]:
    evaluations = [evaluate_route(r, forecasts, load_lb, wind_metric) for r in routes]
    return evaluations, rank([e.summary for e in evaluations])


def find_safer_departure(
    routes: Sequence[RouteInput],
    forecasts: Mapping[WeatherKey, HourlySeries],
    load_lb: float,
    wind_metric: str,
    departure: datetime,
    max_shift_hours: int = MAX_DEPARTURE_SHIFT_HOURS,
) -> DepartureSuggestion | None:
    """Nearest later departure (+1 h steps) whose best route has no No Travel miles."""
    for hours in range(1, max_shift_hours + 1):
        delta = timedelta(hours=hours)
        shifted = [
            RouteInput(r.name, shift_checkpoints(r.checkpoints, delta), r.distance_m, r.duration_s)
            for r in routes
        ]
        try:
            evaluations, order = _rank_routes(shifted, forecasts, load_lb, wind_metric)
        except ForecastUnavailable:
            return None  # ran past the forecast we already have
        if evaluations[order[0]].summary.miles(RiskLevel.NO_TRAVEL) == 0:
            return DepartureSuggestion(hours, departure + delta, order[0])
    return None


def evaluate_plan(
    routes: Sequence[RouteInput],
    forecasts: Mapping[WeatherKey, HourlySeries],
    load_lb: float,
    wind_metric: str,
    departure: datetime,
    distance_unit: str = "mi",
) -> PlanEvaluation:
    if not routes:
        raise ValueError("At least one route is required")
    evaluations, order = _rank_routes(routes, forecasts, load_lb, wind_metric)
    reason = explain(
        [e.name for e in evaluations], [e.summary for e in evaluations], order, distance_unit
    )
    best = evaluations[order[0]]
    not_recommended = best.summary.miles(RiskLevel.NO_TRAVEL) > 0
    suggestion = (
        find_safer_departure(routes, forecasts, load_lb, wind_metric, departure)
        if not_recommended
        else None
    )
    return PlanEvaluation(evaluations, order, reason, not_recommended, suggestion)
