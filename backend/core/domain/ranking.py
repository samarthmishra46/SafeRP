"""Per-route risk summaries, ranking and the plain-language recommendation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .geo import meters_to_miles
from .risk import RiskLevel

LEVELS_HIGH_TO_LOW = (
    RiskLevel.NO_TRAVEL,
    RiskLevel.SEVERE,
    RiskLevel.HIGH,
    RiskLevel.MODERATE,
    RiskLevel.LOW,
)


@dataclass(frozen=True)
class RouteSummary:
    miles_by_level: dict[RiskLevel, float]
    avg_risk: float  # mile-weighted mean of numeric levels
    distance_m: float
    duration_s: float

    @property
    def max_level(self) -> RiskLevel:
        for level in LEVELS_HIGH_TO_LOW:
            if self.miles_by_level[level] > 0:
                return level
        return RiskLevel.LOW

    def miles(self, level: RiskLevel) -> float:
        return self.miles_by_level[level]


def summarize(
    owned_m: Sequence[float],
    levels: Sequence[RiskLevel],
    distance_m: float,
    duration_s: float,
) -> RouteSummary:
    miles = {level: 0.0 for level in RiskLevel}
    weighted = 0.0
    total_m = 0.0
    for meters, level in zip(owned_m, levels, strict=True):
        miles[level] += meters_to_miles(meters)
        weighted += meters * int(level)
        total_m += meters
    avg = weighted / total_m if total_m > 0 else float(max(levels, default=RiskLevel.LOW))
    return RouteSummary(
        miles_by_level=miles, avg_risk=avg, distance_m=distance_m, duration_s=duration_s
    )


def rank_key(s: RouteSummary) -> tuple[float, float, float, float, int]:
    """Lexicographic key, lower is better. Rounded so float noise never decides the winner."""
    return (
        round(s.miles(RiskLevel.NO_TRAVEL), 1),
        round(s.miles(RiskLevel.SEVERE), 1),
        round(s.miles(RiskLevel.HIGH), 1),
        round(s.avg_risk, 2),
        round(s.duration_s / 60),
    )


def rank(summaries: Sequence[RouteSummary]) -> list[int]:
    """Route indices from best to worst. Full ties keep the input order (fastest first)."""
    return sorted(range(len(summaries)), key=lambda i: rank_key(summaries[i]))


def fmt_miles(value: float) -> str:
    text = f"{round(value, 1):.1f}"
    return text[:-2] if text.endswith(".0") else text


def fmt_minutes(minutes: int) -> str:
    minutes = abs(minutes)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    h, m = divmod(minutes, 60)
    return f"{h} h {m:02d} min" if m else f"{h} h"


_KEY_LABELS = {0: "No Travel", 1: "Severe", 2: "High"}


KM_PER_MILE = 1.609344
DISTANCE_WORDS = {"mi": "miles", "km": "km"}


def explain(
    names: Sequence[str],
    summaries: Sequence[RouteSummary],
    order: Sequence[int],
    distance_unit: str = "mi",
) -> str:
    """Why the top-ranked route beat the runner-up, in one or two sentences.

    Ranking always compares miles; `distance_unit` ("mi" or "km") only changes the wording.
    """
    factor = KM_PER_MILE if distance_unit == "km" else 1.0
    word = DISTANCE_WORDS.get(distance_unit, "miles")
    best = order[0]
    if len(order) == 1:
        return f"{names[best]} is the only route available."
    runner = order[1]
    kb, kr = rank_key(summaries[best]), rank_key(summaries[runner])
    minutes = kb[4] - kr[4]
    if minutes > 0:
        time_clause = f"is {fmt_minutes(minutes)} longer"
    elif minutes < 0:
        time_clause = f"is also {fmt_minutes(minutes)} faster"
    else:
        time_clause = "takes about the same time"

    for k in range(3):
        if kb[k] != kr[k]:
            label = _KEY_LABELS[k]
            return (
                f"{names[best]} has {fmt_miles(kb[k] * factor)} {label} {word} vs "
                f"{fmt_miles(kr[k] * factor)} on {names[runner]}, and {time_clause}."
            )
    if kb[3] != kr[3]:
        return (
            f"{names[best]} and {names[runner]} tie on No Travel, Severe and High {word}, but "
            f"{names[best]} has lower average risk ({kb[3]:.2f} vs {kr[3]:.2f}) and {time_clause}."
        )
    if minutes != 0:
        return (
            f"{names[best]} and {names[runner]} carry the same weather risk; "
            f"{names[best]} is {fmt_minutes(minutes)} faster."
        )
    return (
        f"{names[best]} and {names[runner]} are tied on risk and travel time; "
        f"{names[best]} is listed first."
    )
