"""Trip planning orchestration: routes -> checkpoints -> forecasts -> evaluation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from django.conf import settings

from core.domain.checkpoints import Checkpoint, place_checkpoints
from core.domain.evaluate import (
    ForecastUnavailable,
    PlanEvaluation,
    RouteInput,
    evaluate_plan,
    weather_key,
)
from core.domain.geo import RouteProfile, build_profile, simplify_indices
from core.domain.hazards import HazardRow, hazard_row
from core.domain.weather import floor_hour, hourly_frame
from core.errors import PlanningError

from . import routing, weather

SIMPLIFY_TOLERANCE_M = 15.0
HOURLY_HOURS = 48  # same window as the heatmap slider


@dataclass(frozen=True)
class Place:
    lon: float
    lat: float
    label: str = ""


@dataclass(frozen=True)
class PlanRequest:
    origin: Place
    destination: Place
    departure: datetime
    weight_lb: int
    interval_mi: int


@dataclass(frozen=True)
class PlannedRoute:
    id: str
    name: str
    via: str
    source: str
    profile: RouteProfile
    checkpoints: list[Checkpoint]
    simplified: list[int]  # indices into profile.coords kept for display


@dataclass(frozen=True)
class PlanResult:
    request: PlanRequest
    routes: list[PlannedRoute]
    evaluation: PlanEvaluation
    notices: list[str]
    generated_at: datetime
    wind_metric: str
    # Per route, per slider hour: hazard levels at each checkpoint (for the animations only).
    hourly_anchor: datetime
    hourly: list[list[HazardRow]]


def forecast_horizon_end(now: datetime) -> datetime:
    return floor_hour(now) + timedelta(hours=settings.FORECAST_HORIZON_HOURS)


def _fmt_utc(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%a %d %b %H:%M UTC")


def plan_trip(req: PlanRequest, now: datetime | None = None) -> PlanResult:
    now = now or datetime.now(UTC)
    route_set = routing.get_routes(
        (req.origin.lon, req.origin.lat), (req.destination.lon, req.destination.lat), req.weight_lb
    )

    routes: list[PlannedRoute] = []
    for i, cand in enumerate(route_set.candidates):
        p = cand.payload
        profile = build_profile(
            p["coords"],
            p["distances"],
            p["durations"],
            speed_factor=settings.TRUCK_SPEED_FACTOR,
            total_duration_s=p["duration_s"],
        )
        letter = "ABC"[i]
        routes.append(
            PlannedRoute(
                id=letter,
                name=f"Route {letter}",
                via=p.get("summary", ""),
                source=cand.source,
                profile=profile,
                checkpoints=place_checkpoints(profile, req.interval_mi, req.departure),
                simplified=simplify_indices(profile.coords, SIMPLIFY_TOLERANCE_M),
            )
        )

    horizon_end = forecast_horizon_end(now)
    latest_arrival = max(req.departure + timedelta(seconds=r.profile.duration_s) for r in routes)
    if latest_arrival > horizon_end:
        raise PlanningError(
            f"This trip would arrive {_fmt_utc(latest_arrival)}, after the forecast ends "
            f"({_fmt_utc(horizon_end)}). Choose an earlier departure.",
            code="beyond_forecast_horizon",
        )

    keys = {weather_key(c.lon, c.lat) for r in routes for c in r.checkpoints}
    if len(keys) > settings.MAX_WEATHER_POINTS:
        raise PlanningError(
            f"This trip needs {len(keys)} forecast points at a {req.interval_mi}-mile interval, "
            f"more than the {settings.MAX_WEATHER_POINTS} allowed per plan. "
            "Choose a wider checkpoint interval.",
            code="too_many_checkpoints",
        )
    forecasts = weather.fetch_forecasts(keys, now)

    try:
        evaluation = evaluate_plan(
            [
                RouteInput(r.name, r.checkpoints, r.profile.distance_m, r.profile.duration_s)
                for r in routes
            ],
            forecasts,
            req.weight_lb,
            settings.WIND_METRIC,
            req.departure,
        )
    except ForecastUnavailable as exc:
        raise PlanningError(
            "The weather forecast does not cover every checkpoint for this departure time.",
            code="forecast_unavailable",
        ) from exc

    anchor = floor_hour(now)
    hourly = []
    for r in routes:
        series = [forecasts[weather_key(c.lon, c.lat)] for c in r.checkpoints]
        hourly.append(
            [
                hazard_row([hourly_frame(s, anchor, h, settings.WIND_METRIC) for s in series])
                for h in range(HOURLY_HOURS + 1)
            ]
        )

    notices = [route_set.notice] if route_set.notice else []
    return PlanResult(req, routes, evaluation, notices, now, settings.WIND_METRIC, anchor, hourly)
