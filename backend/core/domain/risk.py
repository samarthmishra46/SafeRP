"""Checkpoint risk classification.

Thresholds are half-open so every decimal value has exactly one level:

    Level        Low     Moderate      High          Severe        No Travel
    Wind (mph)   <25     [25, 35)      [35, 45)      [45, 55)      >=55
    Rain (in/h)  <0.10   [0.10, 0.25)  [0.25, 0.50)  [0.50, 1.00]  >1.00
    Snow (in/h)  <0.5    [0.5, 1.0)    [1.0, 2.0)    [2.0, 3.0]    >3.0

Note the edge asymmetry: wind uses >=55 for No Travel, rain and snow use strictly greater than.

Load rules are applied to the wind level after the table:
    wind >= 55                      -> No Travel (any load)
    45 <= wind < 55, load > 30,000  -> No Travel
    35 <= wind < 45, load > 40,000  -> Severe

Checkpoint level = max(wind level after load rules, rain level, snow level).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return _LABELS[self]


_LABELS = {
    RiskLevel.LOW: "Low",
    RiskLevel.MODERATE: "Moderate",
    RiskLevel.HIGH: "High",
    RiskLevel.SEVERE: "Severe",
    RiskLevel.NO_TRAVEL: "No Travel",
}

# Load thresholds (lb). A load strictly greater than these triggers the rule.
HEAVY_LOAD_NO_TRAVEL_LB = 30_000
HEAVY_LOAD_SEVERE_LB = 40_000

WIND = "wind"
RAIN = "rain"
SNOW = "snow"


def wind_level(mph: float) -> RiskLevel:
    if mph >= 55:
        return RiskLevel.NO_TRAVEL
    if mph >= 45:
        return RiskLevel.SEVERE
    if mph >= 35:
        return RiskLevel.HIGH
    if mph >= 25:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def rain_level(inches_per_hour: float) -> RiskLevel:
    if inches_per_hour > 1.00:
        return RiskLevel.NO_TRAVEL
    if inches_per_hour >= 0.50:
        return RiskLevel.SEVERE
    if inches_per_hour >= 0.25:
        return RiskLevel.HIGH
    if inches_per_hour >= 0.10:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def snow_level(inches_per_hour: float) -> RiskLevel:
    if inches_per_hour > 3.0:
        return RiskLevel.NO_TRAVEL
    if inches_per_hour >= 2.0:
        return RiskLevel.SEVERE
    if inches_per_hour >= 1.0:
        return RiskLevel.HIGH
    if inches_per_hour >= 0.5:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def apply_load_rules(mph: float, load_lb: float) -> tuple[RiskLevel, str | None]:
    """Wind level after load rules, plus a description of the load rule that fired (if any)."""
    base = wind_level(mph)
    if mph >= 55:
        return RiskLevel.NO_TRAVEL, None
    if 45 <= mph < 55 and load_lb > HEAVY_LOAD_NO_TRAVEL_LB:
        return RiskLevel.NO_TRAVEL, "Wind 45–55 mph with load over 30,000 lb"
    if 35 <= mph < 45 and load_lb > HEAVY_LOAD_SEVERE_LB:
        return max(base, RiskLevel.SEVERE), "Wind 35–45 mph with load over 40,000 lb"
    return base, None


@dataclass(frozen=True)
class RiskAssessment:
    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    # Factors at the checkpoint's level, in display order (empty when Low).
    drivers: tuple[str, ...]
    load_rule: str | None = None
    missing: tuple[str, ...] = field(default_factory=tuple)


def classify(
    wind_mph: float | None,
    rain_in_per_hour: float | None,
    snow_in_per_hour: float | None,
    load_lb: float,
) -> RiskAssessment:
    """Classify one checkpoint. Missing values are treated as calm/dry and reported."""
    missing = tuple(
        name
        for name, value in ((WIND, wind_mph), (RAIN, rain_in_per_hour), (SNOW, snow_in_per_hour))
        if value is None
    )
    w_level, load_rule = apply_load_rules(wind_mph or 0.0, load_lb)
    r_level = rain_level(rain_in_per_hour or 0.0)
    s_level = snow_level(snow_in_per_hour or 0.0)

    level = max(w_level, r_level, s_level)
    drivers: tuple[str, ...] = ()
    if level > RiskLevel.LOW:
        drivers = tuple(
            name
            for name, lvl in ((WIND, w_level), (RAIN, r_level), (SNOW, s_level))
            if lvl == level
        )
    return RiskAssessment(
        level=level,
        wind_level=w_level,
        rain_level=r_level,
        snow_level=s_level,
        drivers=drivers,
        load_rule=load_rule if w_level == level else None,
        missing=missing,
    )
