"""Heatmap grid over the trip corridor."""

from __future__ import annotations

import math
from dataclasses import dataclass

MILES_PER_DEG_LAT = 69.0
# Candidate spacings (degrees). Points snap to multiples of the spacing, so grids for
# overlapping corridors share coordinates and therefore cached forecasts.
SPACING_LADDER = (0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0)


@dataclass(frozen=True)
class BBox:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def buffered(self, miles: float) -> BBox:
        dlat = miles / MILES_PER_DEG_LAT
        mid_lat = (self.min_lat + self.max_lat) / 2
        dlon = miles / (MILES_PER_DEG_LAT * max(math.cos(math.radians(mid_lat)), 0.2))
        return BBox(
            max(-180.0, self.min_lon - dlon),
            max(-85.0, self.min_lat - dlat),
            min(180.0, self.max_lon + dlon),
            min(85.0, self.max_lat + dlat),
        )


@dataclass(frozen=True)
class Grid:
    spacing_deg: float
    points: list[tuple[float, float]]  # (lon, lat)


def _axis(lo: float, hi: float, step: float) -> list[float]:
    start, stop = math.floor(lo / step), math.ceil(hi / step)
    return [round(i * step, 4) for i in range(start, stop + 1)]


def build_grid(bbox: BBox, buffer_miles: float = 30.0, max_points: int = 400) -> Grid:
    """Smallest ladder spacing whose snapped grid over the buffered bbox fits `max_points`."""
    box = bbox.buffered(buffer_miles)
    for step in SPACING_LADDER:
        lons, lats = _axis(box.min_lon, box.max_lon, step), _axis(box.min_lat, box.max_lat, step)
        if len(lons) * len(lats) <= max_points:
            break
    else:
        # Very large area: stretch the spacing until it fits.
        step = SPACING_LADDER[-1]
        while True:
            lons = _axis(box.min_lon, box.max_lon, step)
            lats = _axis(box.min_lat, box.max_lat, step)
            if len(lons) * len(lats) <= max_points:
                break
            step *= 1.25
    return Grid(spacing_deg=step, points=[(lon, lat) for lat in lats for lon in lons])
