"""Geometry helpers: distances, route profiles, interpolation, simplification, overlap."""

from __future__ import annotations

import math
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_MILE = 1609.344

LonLat = tuple[float, float]


def haversine_m(a: Sequence[float], b: Sequence[float]) -> float:
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def meters_to_miles(meters: float) -> float:
    return meters / METERS_PER_MILE


def miles_to_meters(miles: float) -> float:
    return miles * METERS_PER_MILE


@dataclass(frozen=True)
class RouteProfile:
    """A route polyline with cumulative distance (m) and duration (s) at every vertex."""

    coords: list[LonLat]
    cum_distance_m: list[float]
    cum_duration_s: list[float]

    @property
    def distance_m(self) -> float:
        return self.cum_distance_m[-1]

    @property
    def duration_s(self) -> float:
        return self.cum_duration_s[-1]


def build_profile(
    coords: Sequence[Sequence[float]],
    segment_distances_m: Sequence[float] | None,
    segment_durations_s: Sequence[float] | None,
    speed_factor: float = 1.0,
    total_duration_s: float | None = None,
) -> RouteProfile:
    """Build cumulative arrays from per-segment routing annotations.

    `speed_factor` scales vehicle speed, so durations are divided by it. If annotations are
    missing or misaligned with the geometry, distances fall back to haversine and the total
    duration is spread proportionally to distance (constant speed only as a last resort).
    """
    if len(coords) < 2:
        raise ValueError("A route needs at least two coordinates")
    if speed_factor <= 0:
        raise ValueError("speed_factor must be positive")
    pts: list[LonLat] = [(float(c[0]), float(c[1])) for c in coords]
    n_seg = len(pts) - 1

    aligned = (
        segment_distances_m is not None
        and segment_durations_s is not None
        and len(segment_distances_m) == n_seg
        and len(segment_durations_s) == n_seg
    )
    if aligned:
        seg_d = [float(d) for d in segment_distances_m]  # type: ignore[union-attr]
        seg_t = [float(t) for t in segment_durations_s]  # type: ignore[union-attr]
    else:
        seg_d = [haversine_m(pts[i], pts[i + 1]) for i in range(n_seg)]
        total_d = sum(seg_d) or 1.0
        total_t = total_duration_s or 0.0
        seg_t = [total_t * d / total_d for d in seg_d]

    cum_d = [0.0]
    cum_t = [0.0]
    for d, t in zip(seg_d, seg_t, strict=True):
        cum_d.append(cum_d[-1] + d)
        cum_t.append(cum_t[-1] + t / speed_factor)
    return RouteProfile(coords=pts, cum_distance_m=cum_d, cum_duration_s=cum_t)


@dataclass(frozen=True)
class PointOnRoute:
    lon: float
    lat: float
    distance_m: float
    elapsed_s: float
    segment_index: int


def interpolate_at_distance(profile: RouteProfile, distance_m: float) -> PointOnRoute:
    """Position and elapsed time at a distance along the route (clamped to the ends).

    Elapsed time is interpolated within the segment, so speed varies along the route exactly
    as the routing engine's per-segment durations say.
    """
    cum = profile.cum_distance_m
    d = min(max(distance_m, 0.0), cum[-1])
    i = min(bisect_right(cum, d) - 1, len(cum) - 2)
    seg_len = cum[i + 1] - cum[i]
    f = 0.0 if seg_len <= 0 else (d - cum[i]) / seg_len
    a, b = profile.coords[i], profile.coords[i + 1]
    t0, t1 = profile.cum_duration_s[i], profile.cum_duration_s[i + 1]
    return PointOnRoute(
        lon=a[0] + (b[0] - a[0]) * f,
        lat=a[1] + (b[1] - a[1]) * f,
        distance_m=d,
        elapsed_s=t0 + (t1 - t0) * f,
        segment_index=i,
    )


def simplify_indices(coords: Sequence[LonLat], tolerance_m: float) -> list[int]:
    """Douglas–Peucker simplification; returns the indices of the vertices to keep."""
    n = len(coords)
    if n <= 2:
        return list(range(n))
    lat0 = math.radians(sum(c[1] for c in coords) / n)
    kx = 111_320.0 * math.cos(lat0)
    ky = 110_540.0
    xy = [(c[0] * kx, c[1] * ky) for c in coords]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tolerance_m * tolerance_m
    while stack:
        start, end = stack.pop()
        ax, ay = xy[start]
        bx, by = xy[end]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best_i, best_d2 = -1, tol2
        for i in range(start + 1, end):
            px, py = xy[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best_d2:
                best_i, best_d2 = i, d2
        if best_i != -1:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [i for i, k in enumerate(keep) if k]


class _Projector:
    """Local equirectangular projection (metres), accurate enough for corridor comparisons."""

    def __init__(self, ref_lat: float):
        self.kx = 111_320.0 * math.cos(math.radians(ref_lat))
        self.ky = 110_540.0

    def __call__(self, p: LonLat) -> tuple[float, float]:
        return p[0] * self.kx, p[1] * self.ky


def _densify(xy: list[tuple[float, float]], step: float) -> list[tuple[float, float, float]]:
    """Points every ~`step` metres along a projected polyline, with the length each represents."""
    out: list[tuple[float, float, float]] = []
    for (ax, ay), (bx, by) in pairwise(xy):
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            continue
        k = max(1, math.ceil(seg / step))
        for j in range(k):
            f = (j + 0.5) / k
            out.append((ax + (bx - ax) * f, ay + (by - ay) * f, seg / k))
    return out


class Footprint:
    """A route rasterised onto ~`cell`-metre cells, for fast "how much do two routes share".

    Each cell holds the length of route inside it; `near` is the set of cells within one cell
    of the route. Two routes sharing a road fall into the same or adjacent cells.
    """

    def __init__(self, coords: Sequence[LonLat], ref_lat: float, cell: float = 120.0):
        proj = _Projector(ref_lat)
        self.length_by_cell: dict[tuple[int, int], float] = {}
        for x, y, w in _densify([proj(p) for p in coords], step=cell / 2):
            key = (math.floor(x / cell), math.floor(y / cell))
            self.length_by_cell[key] = self.length_by_cell.get(key, 0.0) + w
        self.total = sum(self.length_by_cell.values())
        self.near = {
            (cx + i, cy + j)
            for cx, cy in self.length_by_cell
            for i in (-1, 0, 1)
            for j in (-1, 0, 1)
        }

    def shared_fraction(self, other: Footprint) -> float:
        """Share of this route's length that lies along `other`."""
        if not self.total:
            return 0.0
        shared = sum(w for c, w in self.length_by_cell.items() if c in other.near)
        return shared / self.total


def overlap_fraction(
    candidate: Sequence[LonLat], existing: Sequence[LonLat], tolerance_m: float = 120.0
) -> float:
    """Share of the candidate's length that runs within ~tolerance of the existing route."""
    if len(candidate) < 2 or len(existing) < 2:
        return 0.0
    ref_lat = (candidate[0][1] + candidate[-1][1]) / 2
    return Footprint(candidate, ref_lat, tolerance_m).shared_fraction(
        Footprint(existing, ref_lat, tolerance_m)
    )


def perpendicular_offsets(profile: RouteProfile, offset_m: float) -> list[LonLat]:
    """Two points offset left/right of the route's midpoint, perpendicular to its heading."""
    mid = interpolate_at_distance(profile, profile.distance_m / 2)
    span = max(profile.distance_m * 0.05, 2_000.0)
    a = interpolate_at_distance(profile, mid.distance_m - span)
    b = interpolate_at_distance(profile, mid.distance_m + span)
    proj = _Projector(mid.lat)
    ax, ay = proj((a.lon, a.lat))
    bx, by = proj((b.lon, b.lat))
    hx, hy = bx - ax, by - ay
    norm = math.hypot(hx, hy) or 1.0
    nx, ny = -hy / norm, hx / norm  # left-hand normal
    points = []
    for sign in (1, -1):
        points.append(
            (
                mid.lon + sign * nx * offset_m / proj.kx,
                mid.lat + sign * ny * offset_m / proj.ky,
            )
        )
    return points


def slice_polyline(
    coords: Sequence[LonLat], cum_distance_m: Sequence[float], start_m: float, end_m: float
) -> list[LonLat]:
    """Sub-polyline between two distances along a line, with interpolated end points."""

    def point_at(d: float) -> LonLat:
        i = min(max(bisect_right(cum_distance_m, d) - 1, 0), len(coords) - 2)
        seg = cum_distance_m[i + 1] - cum_distance_m[i]
        f = 0.0 if seg <= 0 else min(max((d - cum_distance_m[i]) / seg, 0.0), 1.0)
        a, b = coords[i], coords[i + 1]
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    if end_m <= start_m:
        p = point_at(start_m)
        return [p, p]
    first = bisect_right(cum_distance_m, start_m)
    last = bisect_right(cum_distance_m, end_m)
    inner = [coords[i] for i in range(first, last) if start_m < cum_distance_m[i] < end_m]
    return [point_at(start_m), *inner, point_at(end_m)]
