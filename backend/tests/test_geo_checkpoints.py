from datetime import timedelta

import pytest

from core.domain.checkpoints import checkpoint_distances, owned_spans, place_checkpoints
from core.domain.geo import (
    METERS_PER_MILE,
    build_profile,
    haversine_m,
    interpolate_at_distance,
    overlap_fraction,
    perpendicular_offsets,
    simplify_indices,
)
from tests.helpers import T0

MI = METERS_PER_MILE


def straight_profile(seg_miles, seg_minutes, speed_factor=1.0):
    """Profile along the equator with the given per-segment miles and minutes."""
    coords = [(0.0, 0.0)]
    for m in seg_miles:
        coords.append((coords[-1][0] + m * MI / 111_320.0, 0.0))
    return build_profile(
        coords,
        [m * MI for m in seg_miles],
        [t * 60 for t in seg_minutes],
        speed_factor=speed_factor,
    )


def test_haversine_one_degree_latitude():
    assert haversine_m((0, 0), (0, 1)) == pytest.approx(111_195, rel=1e-3)


def test_eta_interpolation_uses_per_segment_speed():
    # 10 mi in 10 min (60 mph), then 10 mi in 20 min (30 mph).
    p = straight_profile([10, 10], [10, 20])
    assert interpolate_at_distance(p, 5 * MI).elapsed_s == pytest.approx(5 * 60)
    assert interpolate_at_distance(p, 10 * MI).elapsed_s == pytest.approx(10 * 60)
    # Halfway through the slow segment: 10 + 10 minutes, not the constant-speed 15.
    assert interpolate_at_distance(p, 15 * MI).elapsed_s == pytest.approx(20 * 60)
    assert interpolate_at_distance(p, 20 * MI).elapsed_s == pytest.approx(30 * 60)


def test_eta_interpolation_clamps_beyond_ends():
    p = straight_profile([10], [10])
    assert interpolate_at_distance(p, -5).elapsed_s == 0
    assert interpolate_at_distance(p, 50 * MI).elapsed_s == pytest.approx(600)


def test_speed_factor_scales_durations():
    slow = straight_profile([10], [10], speed_factor=0.5)
    assert slow.duration_s == pytest.approx(1200)


def test_profile_falls_back_when_annotations_misaligned():
    coords = [(0, 0), (0.1, 0), (0.3, 0)]
    p = build_profile(coords, [1.0], [1.0], total_duration_s=300)
    assert p.distance_m == pytest.approx(haversine_m((0, 0), (0.3, 0)))
    assert p.duration_s == pytest.approx(300)
    assert p.cum_duration_s[1] == pytest.approx(100, rel=1e-3)


def test_checkpoint_distances_include_origin_and_destination():
    d = checkpoint_distances(60 * MI, 25)
    assert [round(x / MI, 3) for x in d] == [0, 25, 50, 60]


def test_checkpoint_merged_into_destination_when_very_close():
    d = checkpoint_distances(50.2 * MI, 25)
    assert [round(x / MI, 3) for x in d] == [0, 25, 50.2]


def test_short_route_has_origin_and_destination_only():
    d = checkpoint_distances(3 * MI, 10)
    assert [round(x / MI, 3) for x in d] == [0, 3]


def test_place_checkpoints_sets_eta_from_profile():
    p = straight_profile([25, 25], [20, 40])
    cps = place_checkpoints(p, 25, T0)
    assert [c.index for c in cps] == [0, 1, 2]
    assert cps[1].eta == T0 + timedelta(minutes=20)
    assert cps[2].eta == T0 + timedelta(minutes=60)
    assert cps[1].lon == pytest.approx(25 * MI / 111_320.0)


def test_owned_spans_use_midpoints_and_tile_route():
    spans = owned_spans([0, 25, 50, 60])
    assert spans == [(0, 12.5), (12.5, 37.5), (37.5, 55), (55, 60)]
    assert sum(b - a for a, b in spans) == 60


def test_owned_spans_two_points():
    assert owned_spans([0, 10]) == [(0, 5), (5, 10)]


def test_simplify_keeps_corners_and_drops_collinear_points():
    coords = [(0, 0), (0.5, 0), (1, 0), (1, 0.5), (1, 1)]
    assert simplify_indices(coords, tolerance_m=10) == [0, 2, 4]


def test_overlap_identical_and_disjoint():
    a = [(0.0, 0.0), (1.0, 0.0)]
    b = [(0.0, 1.0), (1.0, 1.0)]
    assert overlap_fraction(a, a) == pytest.approx(1.0)
    assert overlap_fraction(a, b) == 0.0


def test_overlap_partial():
    base = [(0.0, 0.0), (1.0, 0.0)]
    # Shares the first half, then diverges 0.5 degrees north.
    cand = [(0.0, 0.0), (0.5, 0.0), (0.5, 0.5), (1.0, 0.5)]
    frac = overlap_fraction(cand, base)
    assert 0.25 < frac < 0.4


def test_perpendicular_offsets_are_either_side_of_route():
    p = build_profile([(0, 0), (1, 0)], None, None, total_duration_s=3600)
    left, right = perpendicular_offsets(p, 10_000)
    assert left[1] > 0 > right[1]
    assert left[0] == pytest.approx(0.5, abs=1e-6)
    assert haversine_m(left, (0.5, 0)) == pytest.approx(10_000, rel=0.01)
