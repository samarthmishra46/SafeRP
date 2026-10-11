from core.domain.grid import BBox, build_grid
from core.domain.routes import Candidate, select_routes


def cand(coords, minutes, source):
    return Candidate(coords=coords, duration_s=minutes * 60, distance_m=1, source=source)


FAST = cand([(0.0, 0.0), (1.0, 0.0)], 60, "primary")
NEAR_COPY = cand([(0.0, 0.0), (0.98, 0.0), (1.0, 0.002)], 62, "alternative")
NORTH = cand([(0.0, 0.0), (0.5, 0.5), (1.0, 0.0)], 80, "via")
SOUTH = cand([(0.0, 0.0), (0.5, -0.5), (1.0, 0.0)], 85, "exclude=toll")
TOO_SLOW = cand([(0.0, 0.0), (0.5, 0.9), (1.0, 0.0)], 97, "via")


def test_selects_distinct_routes_fastest_first():
    selected, rejected = select_routes([SOUTH, NEAR_COPY, FAST, NORTH])
    assert [c.source for c in selected] == ["primary", "via", "exclude=toll"]
    assert [(r.source, r.reason) for r in rejected] == [("alternative", "too similar")]


def test_rejects_routes_much_slower_than_fastest():
    selected, rejected = select_routes([FAST, TOO_SLOW])
    assert [c.source for c in selected] == ["primary"]
    assert rejected[0].reason == "too slow"


def test_duration_ratio_boundary_is_inclusive():
    exactly = cand([(0.0, 0.0), (0.5, 0.9), (1.0, 0.0)], 96, "via")  # 1.6 x 60
    selected, _ = select_routes([FAST, exactly])
    assert len(selected) == 2


def test_stops_at_three():
    extra = cand([(0.0, 0.0), (0.5, 1.2), (1.0, 0.0)], 90, "via2")
    selected, _ = select_routes([FAST, NORTH, SOUTH, extra])
    assert len(selected) == 3


def test_grid_respects_point_budget_and_snaps_to_lattice():
    grid = build_grid(BBox(-97.0, 29.5, -95.0, 33.0), max_points=400)
    assert len(grid.points) <= 400
    s = grid.spacing_deg
    for lon, lat in grid.points[:20]:
        assert abs(lon / s - round(lon / s)) < 1e-6
        assert abs(lat / s - round(lat / s)) < 1e-6


def test_grid_covers_buffered_bbox():
    bbox = BBox(-97.0, 29.5, -95.0, 33.0)
    grid = build_grid(bbox, buffer_miles=30)
    lons = [p[0] for p in grid.points]
    lats = [p[1] for p in grid.points]
    assert min(lats) <= 29.5 - 30 / 69 and max(lats) >= 33.0 + 30 / 69
    assert min(lons) < -97.0 and max(lons) > -95.0


def test_grid_for_huge_area_still_fits():
    grid = build_grid(BBox(-125, 25, -65, 49), max_points=400)
    assert len(grid.points) <= 400
