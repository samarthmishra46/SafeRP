from datetime import timedelta

import pytest

from core.domain.checkpoints import place_checkpoints
from core.domain.geo import interpolate_at_elapsed
from core.domain.rest import (
    BREAK,
    OVERNIGHT,
    RestPlan,
    clock_elapsed,
    schedule_stops,
    total_stop_s,
)
from tests.helpers import T0
from tests.test_geo_checkpoints import straight_profile

H = 3600.0
M = 60.0


def kinds_and_times(stops):
    return [(s.kind, s.drive_elapsed_s / H, s.clock_start_s / H, s.duration_s / H) for s in stops]


def test_no_plan_or_empty_plan_means_no_stops():
    assert schedule_stops(20 * H, None) == []
    assert schedule_stops(20 * H, RestPlan()) == []


def test_breaks_only_repeat_every_interval():
    plan = RestPlan(break_every_s=4 * H, break_s=30 * M)
    assert kinds_and_times(schedule_stops(13 * H, plan)) == [
        (BREAK, 4, 4, 0.5),
        (BREAK, 8, 8.5, 0.5),
        (BREAK, 12, 13, 0.5),
    ]


def test_overnight_only():
    plan = RestPlan(max_daily_drive_s=11 * H, overnight_s=10 * H)
    assert kinds_and_times(schedule_stops(25 * H, plan)) == [
        (OVERNIGHT, 11, 11, 10),
        (OVERNIGHT, 22, 32, 10),
    ]


def test_us_style_plan_break_then_overnight():
    # 30 min after 8 h of driving, 10 h rest after 11 h of driving (the trip in the screenshot).
    plan = RestPlan(8 * H, 30 * M, 11 * H, 10 * H)
    stops = schedule_stops(11 * H + 52 * M, plan)
    assert kinds_and_times(stops) == [(BREAK, 8, 8, 0.5), (OVERNIGHT, 11, 11.5, 10)]
    assert total_stop_s(stops) == 10.5 * H


def test_overnight_resets_break_clock_but_break_does_not_reset_daily_clock():
    plan = RestPlan(
        break_every_s=4 * H, break_s=15 * M, max_daily_drive_s=9 * H, overnight_s=11 * H
    )
    got = [(k, d) for k, d, _, _ in kinds_and_times(schedule_stops(18 * H, plan))]
    assert got == [
        (BREAK, 4),
        (BREAK, 8),
        (OVERNIGHT, 9),  # daily clock kept running through the breaks
        (BREAK, 13),  # break clock restarted after the overnight rest
        (BREAK, 17),
    ]


def test_overnight_wins_when_both_fall_due_together():
    plan = RestPlan(
        break_every_s=4 * H, break_s=30 * M, max_daily_drive_s=8 * H, overnight_s=10 * H
    )
    assert [s.kind for s in schedule_stops(10 * H, plan)] == [BREAK, OVERNIGHT]


def test_no_stop_just_before_arrival():
    plan = RestPlan(break_every_s=4 * H, break_s=30 * M)
    assert schedule_stops(4 * H + 10 * M, plan) == []  # within 15 min of arrival
    assert len(schedule_stops(4 * H + 20 * M, plan)) == 1


def test_clock_elapsed_adds_completed_stops_only():
    stops = schedule_stops(13 * H, RestPlan(break_every_s=4 * H, break_s=30 * M))
    assert clock_elapsed(3 * H, stops) == 3 * H
    assert clock_elapsed(4 * H, stops) == 4 * H  # reached as the break starts
    assert clock_elapsed(5 * H, stops) == 5.5 * H
    assert clock_elapsed(13 * H, stops) == 14.5 * H


def test_checkpoint_etas_include_earlier_stops():
    # 200 mi at 50 mph = 4 h of driving; break after 2 h for 1 h.
    profile = straight_profile([100, 100], [120, 120])
    stops = schedule_stops(profile.duration_s, RestPlan(break_every_s=2 * H, break_s=1 * H))
    cps = place_checkpoints(profile, 50, T0, stops)
    etas_h = [(c.eta - T0) / timedelta(hours=1) for c in cps]
    assert etas_h == pytest.approx([0, 1, 2, 4, 5])


def test_stop_position_from_driving_time():
    profile = straight_profile([100, 100], [120, 120])
    p = interpolate_at_elapsed(profile, 3 * H)
    assert p.distance_m / 1609.344 == pytest.approx(150)
