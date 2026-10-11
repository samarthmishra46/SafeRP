"""Corridor weather grid for the 0–48 h heatmap."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.conf import settings

from core.domain.evaluate import weather_key
from core.domain.grid import BBox, build_grid
from core.domain.weather import floor_hour, hourly_frame

from . import cache, weather

HOURS = 48
BUFFER_MILES = 30.0
TTL_SECONDS = 15 * 60


def _r(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def build_heatmap(bbox: BBox, now: datetime | None = None) -> dict:
    """Grid points once, then per-hour value arrays aligned with the points.

    Frame h covers [anchor + h, anchor + h + 1h) where anchor is the current UTC hour, so
    frame 0 is "now" and frame 48 is two days out.
    """
    now = now or datetime.now(UTC)
    anchor = floor_hour(now)
    grid = build_grid(bbox, BUFFER_MILES, settings.HEATMAP_MAX_POINTS)
    metric = settings.WIND_METRIC
    key = cache.make_key(
        "heat",
        anchor.strftime("%Y%m%d%H"),
        metric,
        grid.spacing_deg,
        grid.points[0],
        grid.points[-1],
    )
    cached = cache.get(key)
    if cached is not None:
        return cached

    keys = [weather_key(lon, lat) for lon, lat in grid.points]
    forecasts = weather.fetch_forecasts(keys, now)
    wind, rain, snow = [], [], []
    for h in range(HOURS + 1):
        frames = [hourly_frame(forecasts[k], anchor, h, metric) for k in keys]
        wind.append([_r(f.wind_mph, 1) for f in frames])
        rain.append([_r(f.rain_in, 3) for f in frames])
        snow.append([_r(f.snow_in, 2) for f in frames])

    payload = {
        "anchor": anchor.isoformat().replace("+00:00", "Z"),
        "hours": HOURS,
        "times": [
            (anchor + timedelta(hours=h)).isoformat().replace("+00:00", "Z")
            for h in range(HOURS + 1)
        ],
        "spacingDeg": grid.spacing_deg,
        "windMetric": metric,
        "points": [[lon, lat] for lon, lat in grid.points],
        "wind": wind,
        "rain": rain,
        "snow": snow,
    }
    cache.put(key, payload, TTL_SECONDS)
    return payload
