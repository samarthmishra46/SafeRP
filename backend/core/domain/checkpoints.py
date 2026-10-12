"""Checkpoint placement, ETAs and mile attribution."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from .geo import RouteProfile, interpolate_at_distance, miles_to_meters
from .rest import Stop, clock_elapsed

ALLOWED_INTERVALS_MI = (10, 25, 50)
# A regular checkpoint this close to the destination is merged into it.
MIN_GAP_TO_DESTINATION_M = 800.0


@dataclass(frozen=True)
class Checkpoint:
    index: int
    lon: float
    lat: float
    distance_m: float
    elapsed_s: float
    eta: datetime


def checkpoint_distances(total_m: float, interval_mi: float) -> list[float]:
    """Distances (m) at 0, every `interval_mi`, and the destination."""
    if interval_mi <= 0:
        raise ValueError("interval must be positive")
    step = miles_to_meters(interval_mi)
    out = [0.0]
    k = 1
    while k * step < total_m - MIN_GAP_TO_DESTINATION_M:
        out.append(k * step)
        k += 1
    if total_m > 0:
        out.append(total_m)
    return out


def place_checkpoints(
    profile: RouteProfile,
    interval_mi: float,
    departure: datetime,
    stops: Sequence[Stop] = (),
) -> list[Checkpoint]:
    """Checkpoints with ETAs interpolated from the route's cumulative durations.

    `elapsed_s` is clock time since departure, so it includes any rest stops taken before the
    checkpoint is reached.
    """
    checkpoints = []
    for i, d in enumerate(checkpoint_distances(profile.distance_m, interval_mi)):
        p = interpolate_at_distance(profile, d)
        elapsed = clock_elapsed(p.elapsed_s, list(stops))
        checkpoints.append(
            Checkpoint(
                index=i,
                lon=p.lon,
                lat=p.lat,
                distance_m=p.distance_m,
                elapsed_s=elapsed,
                eta=departure + timedelta(seconds=elapsed),
            )
        )
    return checkpoints


def shift_checkpoints(checkpoints: list[Checkpoint], delta: timedelta) -> list[Checkpoint]:
    return [
        Checkpoint(c.index, c.lon, c.lat, c.distance_m, c.elapsed_s, c.eta + delta)
        for c in checkpoints
    ]


def owned_spans(distances_m: list[float]) -> list[tuple[float, float]]:
    """Stretch of road each checkpoint owns: midpoint with previous to midpoint with next.

    The first checkpoint starts at 0 and the last ends at the final distance, so the spans
    tile the whole route exactly.
    """
    n = len(distances_m)
    if n == 0:
        return []
    if n == 1:
        return [(distances_m[0], distances_m[0])]
    mids = [(distances_m[i] + distances_m[i + 1]) / 2 for i in range(n - 1)]
    starts = [distances_m[0], *mids]
    ends = [*mids, distances_m[-1]]
    return list(zip(starts, ends, strict=True))
