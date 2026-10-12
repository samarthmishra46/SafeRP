"""Hour-by-hour weather hazard levels for the forecast slider's animations.

These use the risk table thresholds only (no load rules): they describe the weather at a place
and time, not the truck's risk. Route risk and the recommendation still come from each
checkpoint's forecast at its ETA (see evaluate.py).

Levels are encoded as one digit per point ("0012") so a whole hour for hundreds of points is a
short string; wind direction is rounded to 10 degrees.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .risk import RiskLevel, rain_level, snow_level, wind_level
from .weather import Frame


def frame_levels(frame: Frame) -> tuple[RiskLevel, RiskLevel, RiskLevel]:
    """(wind, rain, snow) table levels for one frame; missing values count as calm/dry."""
    return (
        wind_level(frame.wind_mph or 0.0),
        rain_level(frame.rain_in or 0.0),
        snow_level(frame.snow_in or 0.0),
    )


def round_direction(degrees: float | None) -> int | None:
    if degrees is None:
        return None
    return round(degrees / 10.0) * 10 % 360


@dataclass(frozen=True)
class HazardRow:
    """One hour for a list of points: digit strings per factor plus wind directions."""

    wind: str
    rain: str
    snow: str
    wind_dir: list[int | None]


def hazard_row(frames: Sequence[Frame]) -> HazardRow:
    levels = [frame_levels(f) for f in frames]
    return HazardRow(
        wind="".join(str(int(w)) for w, _, _ in levels),
        rain="".join(str(int(r)) for _, r, _ in levels),
        snow="".join(str(int(s)) for _, _, s in levels),
        wind_dir=[round_direction(f.wind_direction_deg) for f in frames],
    )
