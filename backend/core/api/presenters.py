"""Turn planning results into the compact camelCase JSON the frontend consumes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from core.domain.geo import interpolate_at_elapsed, meters_to_miles, slice_polyline
from core.domain.hazards import HazardRow
from core.domain.ranking import rank_key
from core.domain.risk import RiskLevel
from core.services.planner import PlannedRoute, PlanResult

LEVEL_KEYS = {
    RiskLevel.NO_TRAVEL: "noTravel",
    RiskLevel.SEVERE: "severe",
    RiskLevel.HIGH: "high",
    RiskLevel.MODERATE: "moderate",
    RiskLevel.LOW: "low",
}


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _pt(p) -> list[float]:
    return [round(p[0], 5), round(p[1], 5)]


def _mi(meters: float, digits: int = 2) -> float:
    return round(meters_to_miles(meters), digits)


def _r(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _hourly(rows: list[HazardRow]) -> dict:
    """Per slider hour: one digit per checkpoint for each factor, plus wind direction."""
    return {
        "wind": [r.wind for r in rows],
        "rain": [r.rain for r in rows],
        "snow": [r.snow for r in rows],
        "windDir": [r.wind_dir for r in rows],
    }


def _stops(route: PlannedRoute, departure: datetime) -> list[dict]:
    out = []
    for s in route.stops:
        p = interpolate_at_elapsed(route.profile, s.drive_elapsed_s)
        out.append(
            {
                "kind": s.kind,
                "lon": round(p.lon, 5),
                "lat": round(p.lat, 5),
                "distanceMi": _mi(p.distance_m, 1),
                "start": iso(departure + timedelta(seconds=s.clock_start_s)),
                "end": iso(departure + timedelta(seconds=s.clock_end_s)),
                "durationS": round(s.duration_s),
                "driveElapsedS": round(s.drive_elapsed_s),
                "clockStartS": round(s.clock_start_s),
            }
        )
    return out


def _route(route: PlannedRoute, ev, departure: datetime, rank_position: int) -> dict:
    prof = route.profile
    idx = route.simplified
    line = [prof.coords[i] for i in idx]
    cum_d = [prof.cum_distance_m[i] for i in idx]
    summary = ev.summary

    checkpoints, segments = [], []
    for e in ev.checkpoints:
        cp, w, risk = e.checkpoint, e.weather, e.risk
        checkpoints.append(
            {
                "index": cp.index,
                "lon": round(cp.lon, 5),
                "lat": round(cp.lat, 5),
                "distanceMi": _mi(cp.distance_m),
                "eta": iso(cp.eta),
                "elapsedS": round(cp.elapsed_s),
                "spanMi": [_mi(e.span_m[0]), _mi(e.span_m[1])],
                "level": int(risk.level),
                "levelLabel": risk.level.label,
                "drivers": list(risk.drivers),
                "loadRule": risk.load_rule,
                "missing": list(risk.missing),
                "factorLevels": {
                    "wind": int(risk.wind_level),
                    "rain": int(risk.rain_level),
                    "snow": int(risk.snow_level),
                },
                "weather": {
                    "windSpeedMph": _r(w.wind_speed_mph, 1),
                    "windGustMph": _r(w.wind_gust_mph, 1),
                    "windDirectionDeg": _r(w.wind_direction_deg, 0),
                    "windUsedMph": _r(e.wind_used_mph, 1),
                    "rainIn": _r(w.rain_in, 3),
                    "snowIn": _r(w.snow_in, 2),
                    "temperatureC": _r(w.temperature_c, 1),
                    "validHour": iso(w.valid_hour),
                },
            }
        )
        segments.append(
            {
                "checkpointIndex": cp.index,
                "level": int(risk.level),
                "coords": [_pt(p) for p in slice_polyline(line, cum_d, *e.span_m)],
            }
        )

    return {
        "id": route.id,
        "name": route.name,
        "via": route.via,
        "source": route.source,
        "rank": rank_position + 1,
        "distanceMi": _mi(prof.distance_m, 1),
        "durationS": round(prof.duration_s),  # driving time
        "tripDurationS": round(route.trip_duration_s),  # driving + rest stops
        "departure": iso(departure),
        "arrival": iso(departure + timedelta(seconds=route.trip_duration_s)),
        "stops": _stops(route, departure),
        "geometry": [_pt(p) for p in line],
        "cumDurationS": [round(prof.cum_duration_s[i]) for i in idx],
        "segments": segments,
        "checkpoints": checkpoints,
        "summary": {
            "miles": {key: round(summary.miles(level), 1) for level, key in LEVEL_KEYS.items()},
            "avgRisk": round(summary.avg_risk, 2),
            "maxLevel": int(summary.max_level),
        },
    }


def _bbox(routes: list[PlannedRoute]) -> list[float]:
    lons = [c[0] for r in routes for c in r.profile.coords]
    lats = [c[1] for r in routes for c in r.profile.coords]
    return [round(min(lons), 4), round(min(lats), 4), round(max(lons), 4), round(max(lats), 4)]


def _rest_plan(plan) -> dict | None:
    if plan is None:
        return None
    return {
        "breaks": (
            {"everyH": plan.break_every_s / 3600, "minutes": round(plan.break_s / 60)}
            if plan.break_every_s
            else None
        ),
        "overnight": (
            {"afterDrivingH": plan.max_daily_drive_s / 3600, "hours": plan.overnight_s / 3600}
            if plan.max_daily_drive_s
            else None
        ),
    }


def present_plan(result: PlanResult) -> dict:
    ev = result.evaluation
    req = result.request
    positions = {route_index: pos for pos, route_index in enumerate(ev.order)}
    routes = [
        {**_route(r, e, req.departure, positions[i]), "hourly": _hourly(result.hourly[i])}
        for i, (r, e) in enumerate(zip(result.routes, ev.routes, strict=True))
    ]
    ranking = []
    for pos, i in enumerate(ev.order):
        nt, sev, high, avg, minutes = rank_key(ev.routes[i].summary)
        ranking.append(
            {
                "routeId": result.routes[i].id,
                "rank": pos + 1,
                "noTravelMi": nt,
                "severeMi": sev,
                "highMi": high,
                "avgRisk": avg,
                "durationMin": minutes,
            }
        )
    suggestion = None
    if ev.suggestion:
        suggestion = {
            "departure": iso(ev.suggestion.departure),
            "shiftHours": ev.suggestion.shift_hours,
            "routeId": result.routes[ev.suggestion.route_index].id,
        }
    return {
        "routes": routes,
        "recommendation": {
            "routeId": result.routes[ev.best_index].id,
            "reason": ev.reason,
            "notRecommended": ev.not_recommended,
            "suggestion": suggestion,
            "ranking": ranking,
        },
        "notices": result.notices,
        "meta": {
            "generatedAt": iso(result.generated_at),
            "windMetric": result.wind_metric,
            "intervalMi": req.interval_mi,
            "weightLb": req.weight_lb,
            "departure": iso(req.departure),
            "bbox": _bbox(result.routes),
            "restPlan": _rest_plan(req.rest_plan),
            "hourlyAnchor": iso(result.hourly_anchor),
            "hourlyHours": len(result.hourly[0]) - 1 if result.hourly else 0,
        },
    }
