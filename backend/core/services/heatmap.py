"""Corridor weather grid for the 0–48 h heatmap."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.conf import settings

from core.domain.evaluate import weather_key
from core.domain.grid import BBox, build_grid
from core.domain.hazards import hazard_row
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
    # "heat2": the payload gained hazard levels and wind direction; never serve the old shape.
    key = cache.make_key(
        "heat2",
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
    wind, rain, snow, wind_dir = [], [], [], []
    levels: dict[str, list[str]] = {"wind": [], "rain": [], "snow": []}
    for h in range(HOURS + 1):
        frames = [hourly_frame(forecasts[k], anchor, h, metric) for k in keys]
        wind.append([_r(f.wind_mph, 1) for f in frames])
        rain.append([_r(f.rain_in, 3) for f in frames])
        snow.append([_r(f.snow_in, 2) for f in frames])
        row = hazard_row(frames)
        levels["wind"].append(row.wind)
        levels["rain"].append(row.rain)
        levels["snow"].append(row.snow)
        wind_dir.append(row.wind_dir)

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
        # Hazard levels (one digit per point, table thresholds) and wind direction (FROM,
        # degrees rounded to 10) for the weather animations.
        "levels": levels,
        "windDir": wind_dir,
    }
    cache.put(key, payload, TTL_SECONDS)
    return payload
