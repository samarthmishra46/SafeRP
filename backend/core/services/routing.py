"""Mapbox Directions client and the strategy for finding three distinct route options."""

from __future__ import annotations

import logging
from concurrent.futures import wait
from dataclasses import dataclass

from django.conf import settings

from core.domain.geo import build_profile, haversine_m, perpendicular_offsets
from core.domain.routes import MAX_ROUTES, Candidate, select_routes
from core.errors import PlanningError, UpstreamError

from . import cache
from .http import executor, get_json

logger = logging.getLogger(__name__)

SERVICE = "Mapbox Directions"
TTL_SECONDS = 10 * 60
LB_TO_METRIC_TONS = 0.45359237 / 1000
MAPBOX_MAX_WEIGHT_TONS = 100.0  # documented upper bound for max_weight
# Extra corridor requests are best-effort; a slow one must not hold up the plan.
EXTRA_ROUTES_TIMEOUT_S = 6.0


@dataclass(frozen=True)
class RouteSet:
    candidates: list[Candidate]
    notice: str | None


def weight_tons(load_lb: float) -> float:
    return round(min(load_lb * LB_TO_METRIC_TONS, MAPBOX_MAX_WEIGHT_TONS), 2)


def _token() -> str:
    if not settings.MAPBOX_ACCESS_TOKEN:
        raise UpstreamError(SERVICE, "the server has no Mapbox access token configured")
    return settings.MAPBOX_ACCESS_TOKEN


def _strip(route: dict) -> dict:
    """Keep only what planning needs (steps are large and unused after the summary)."""
    legs = route.get("legs") or []
    distances: list[float] = []
    durations: list[float] = []
    for leg in legs:
        annotation = leg.get("annotation") or {}
        distances.extend(annotation.get("distance") or [])
        durations.extend(annotation.get("duration") or [])
    summary = ", ".join(s for s in (leg.get("summary", "") for leg in legs) if s)
    return {
        "coords": [tuple(c[:2]) for c in route["geometry"]["coordinates"]],
        "distances": distances,
        "durations": durations,
        "distance_m": float(route["distance"]),
        "duration_s": float(route["duration"]),
        "summary": summary,
    }


def _directions(
    coords: list[tuple[float, float]], tons: float, extra: dict, source: str
) -> list[Candidate]:
    """One Directions request. NoRoute yields []; other failures raise."""
    path = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords)
    params = {
        "alternatives": "true" if len(coords) == 2 else "false",
        "geometries": "geojson",
        "overview": "full",
        "steps": "true",
        "annotations": "duration,distance",
        "max_weight": tons,
        "access_token": _token(),
        **extra,
    }
    status, body = get_json(
        SERVICE, f"{settings.MAPBOX_API_URL}/directions/v5/mapbox/driving/{path}", params
    )
    code = body.get("code") if isinstance(body, dict) else None
    if status == 401:
        raise UpstreamError(
            SERVICE,
            "the Mapbox access token was rejected (check MAPBOX_ACCESS_TOKEN on the server)",
        )
    if status == 429:
        raise UpstreamError(SERVICE, "rate limit reached, please retry shortly")
    if code in ("NoRoute", "NoSegment"):
        return []
    if code == "InvalidInput":
        raise PlanningError(body.get("message") or "Mapbox rejected the route request.")
    if status != 200 or code != "Ok":
        raise UpstreamError(SERVICE, body.get("message") or f"unexpected response (HTTP {status})")

    out = []
    for i, route in enumerate(body.get("routes") or []):
        stripped = _strip(route)
        if len(stripped["coords"]) < 2:
            continue
        label = source if i == 0 else "alternative"
        out.append(
            Candidate(
                coords=stripped["coords"],
                duration_s=stripped["duration_s"],
                distance_m=stripped["distance_m"],
                source=label,
                payload=stripped,
            )
        )
    return out


def _extra_requests(
    origin: tuple[float, float], dest: tuple[float, float], fastest: Candidate
) -> list[tuple[list[tuple[float, float]], dict, str]]:
    """Requests that tend to produce different corridors from the primary route."""
    payload = fastest.payload
    profile = build_profile(
        payload["coords"], payload["distances"], payload["durations"], 1.0, payload["duration_s"]
    )
    offset = min(max(0.15 * haversine_m(origin, dest), 15_000.0), 120_000.0)
    silent_via = {"waypoints": "0;2"}  # via point shapes the route without splitting legs
    requests = [
        ([origin, dest], {"exclude": "motorway"}, "exclude=motorway"),
        ([origin, dest], {"exclude": "toll"}, "exclude=toll"),
    ]
    for side, point in zip(("left", "right"), perpendicular_offsets(profile, offset), strict=True):
        requests.append(([origin, point, dest], silent_via, f"via-{side}"))
    return requests


def get_routes(origin: tuple[float, float], dest: tuple[float, float], load_lb: float) -> RouteSet:
    """Up to three distinct truck routes, fastest first, with a notice if fewer were found."""
    tons = weight_tons(load_lb)
    key = cache.make_key(
        "routes", f"{origin[0]:.5f},{origin[1]:.5f}", f"{dest[0]:.5f},{dest[1]:.5f}", tons
    )
    cached = cache.get(key)
    if cached is not None:
        return cached

    base = _directions([origin, dest], tons, {}, "primary")
    if not base:
        raise PlanningError(
            "No drivable route was found between these places for a truck of this weight.",
            code="no_route",
        )
    selected, _ = select_routes(base)
    if len(selected) < MAX_ROUTES:
        extra = _extra_requests(origin, dest, selected[0])
        futures = [executor.submit(_directions, c, tons, p, s) for c, p, s in extra]
        done, not_done = wait(futures, timeout=EXTRA_ROUTES_TIMEOUT_S)
        for future in not_done:
            future.cancel()
        more: list[Candidate] = []
        for future in done:
            try:
                more.extend(future.result())
            except (UpstreamError, PlanningError) as exc:
                # Extra corridors are best-effort; the primary route is enough to plan.
                logger.info("alternative request failed: %s", exc)
        selected, rejected = select_routes([*selected, *more])
        logger.info("route selection rejected: %s", rejected)

    notice = None
    if len(selected) < MAX_ROUTES:
        notice = (
            f"Only {len(selected)} distinct route{'s' if len(selected) != 1 else ''} could be "
            "found for this trip. Other options either overlapped the shown routes by more than "
            "80% or took over 1.6× as long as the fastest."
        )
    result = RouteSet(candidates=selected, notice=notice)
    cache.put(key, result, TTL_SECONDS)
    return result
