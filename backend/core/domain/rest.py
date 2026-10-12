"""Optional rest stops: short breaks and overnight rests inserted into a route's timeline.

Everything is driver-chosen; nothing here enforces a jurisdiction's hours-of-service law. The
plan is defined in driving time:

* a short break after every `break_every_s` of driving since the last stop, and/or
* an overnight rest once `max_daily_drive_s` of driving has accumulated since the last overnight
  rest. An overnight rest also resets the short-break clock; a short break does not reset the
  daily driving clock.

A stop that would fall within `ARRIVAL_GRACE_S` of driving before arrival is skipped (no driver
stops for coffee ten minutes from the destination). Stops shift every later ETA, which is why
they change the forecast used for risk.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

BREAK = "break"
OVERNIGHT = "overnight"
ARRIVAL_GRACE_S = 15 * 60


@dataclass(frozen=True)
class RestPlan:
    break_every_s: float | None = None
    break_s: float = 0.0
    max_daily_drive_s: float | None = None
    overnight_s: float = 0.0

    @property
    def is_empty(self) -> bool:
        return self.break_every_s is None and self.max_daily_drive_s is None


@dataclass(frozen=True)
class Stop:
    kind: str  # BREAK or OVERNIGHT
    drive_elapsed_s: float  # driving time completed when the stop starts
    clock_start_s: float  # clock time since departure when the stop starts
    duration_s: float

    @property
    def clock_end_s(self) -> float:
        return self.clock_start_s + self.duration_s


def schedule_stops(total_drive_s: float, plan: RestPlan | None) -> list[Stop]:
    """Stops for a trip of `total_drive_s` driving time, in order."""
    if plan is None or plan.is_empty or total_drive_s <= 0:
        return []
    every = plan.break_every_s if plan.break_every_s and plan.break_every_s > 0 else math.inf
    daily = (
        plan.max_daily_drive_s
        if plan.max_daily_drive_s and plan.max_daily_drive_s > 0
        else math.inf
    )
    stops: list[Stop] = []
    drive = 0.0  # driving done so far
    since_break = 0.0  # driving since the last stop of any kind
    today = 0.0  # driving since the last overnight rest
    stopped = 0.0  # total stop time so far
    while True:
        t_break = drive + (every - since_break)
        t_night = drive + (daily - today)
        t = min(t_break, t_night)
        if t >= total_drive_s - ARRIVAL_GRACE_S:
            return stops
        overnight = t_night <= t_break  # the longer rest also covers a break due at the same time
        duration = plan.overnight_s if overnight else plan.break_s
        stops.append(Stop(OVERNIGHT if overnight else BREAK, t, t + stopped, duration))
        driven = t - drive
        drive = t
        stopped += duration
        since_break = 0.0
        today = 0.0 if overnight else today + driven


def clock_elapsed(drive_elapsed_s: float, stops: list[Stop]) -> float:
    """Clock time since departure at which `drive_elapsed_s` of driving is completed.

    A point reached exactly when a stop begins is reached before the stop.
    """
    return drive_elapsed_s + sum(s.duration_s for s in stops if s.drive_elapsed_s < drive_elapsed_s)


def total_stop_s(stops: list[Stop]) -> float:
    return sum(s.duration_s for s in stops)
