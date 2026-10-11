"""Choosing up to three distinct route options from routing-engine candidates."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .geo import Footprint, LonLat

MAX_ROUTES = 3
MAX_SHARED_FRACTION = 0.80
MAX_DURATION_RATIO = 1.6


@dataclass(frozen=True)
class Candidate:
    coords: list[LonLat]
    duration_s: float
    distance_m: float
    source: str  # "primary", "alternative", "exclude=motorway", "via", ...
    payload: dict = field(default_factory=dict, compare=False, repr=False)


@dataclass(frozen=True)
class Rejection:
    source: str
    reason: str


def select_routes(
    candidates: Sequence[Candidate],
    max_routes: int = MAX_ROUTES,
    max_shared: float = MAX_SHARED_FRACTION,
    max_ratio: float = MAX_DURATION_RATIO,
) -> tuple[list[Candidate], list[Rejection]]:
    """Greedy selection, fastest first.

    A candidate is rejected when it is more than `max_ratio` times the fastest duration or
    shares more than `max_shared` of its length with an already selected route (checked
    both ways, so a short candidate that is a subset of a longer route is also rejected).
    """
    usable = [c for c in candidates if len(c.coords) >= 2 and c.duration_s > 0]
    if not usable:
        return [], []
    ordered = sorted(usable, key=lambda c: c.duration_s)
    fastest = ordered[0].duration_s
    ref_lat = (ordered[0].coords[0][1] + ordered[0].coords[-1][1]) / 2
    selected: list[tuple[Candidate, Footprint]] = []
    rejected: list[Rejection] = []
    for cand in ordered:
        if len(selected) >= max_routes:
            break
        if cand.duration_s > fastest * max_ratio:
            rejected.append(Rejection(cand.source, "too slow"))
            continue
        fp = Footprint(cand.coords, ref_lat)
        too_similar = any(
            max(fp.shared_fraction(other), other.shared_fraction(fp)) > max_shared
            for _, other in selected
        )
        if too_similar:
            rejected.append(Rejection(cand.source, "too similar"))
            continue
        selected.append((cand, fp))
    return [c for c, _ in selected], rejected
