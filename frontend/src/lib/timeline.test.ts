import type { RiskLevel } from '../api/types';
import { makeRoute } from '../test/fixtures';
import { formatSliderTime } from './format';
import {
  HOUR_MS,
  departureHour,
  drivingElapsedAt,
  hourlyWorstLevels,
  sliderTimeMs,
  trackFraction,
  truckPositionAtHour,
  truckStateAtHour,
} from './timeline';

const ANCHOR = Date.parse('2026-01-15T10:00:00Z');

/** A route departing `depOffsetH` hours after the anchor with checkpoints every `stepMin`. */
function timedRoute(levels: RiskLevel[], depOffsetH: number, stepMin: number) {
  const route = makeRoute('A', levels);
  route.departure = new Date(ANCHOR + depOffsetH * HOUR_MS).toISOString();
  route.checkpoints.forEach((c, i) => (c.elapsedS = i * stepMin * 60));
  const last = route.checkpoints[route.checkpoints.length - 1].elapsedS;
  route.arrival = new Date(ANCHOR + depOffsetH * HOUR_MS + last * 1000).toISOString();
  return route;
}

describe('slider time', () => {
  it('maps whole hours from the anchor', () => {
    expect(sliderTimeMs(ANCHOR, 0)).toBe(ANCHOR);
    expect(sliderTimeMs(ANCHOR, 5)).toBe(ANCHOR + 5 * HOUR_MS);
    expect(trackFraction(ANCHOR, ANCHOR + 12 * HOUR_MS)).toBe(0.25);
  });

  it('jumps to the first hour at or after departure', () => {
    expect(departureHour(ANCHOR, '2026-01-15T13:00:00Z')).toBe(3);
    expect(departureHour(ANCHOR, '2026-01-15T13:20:00Z')).toBe(4);
    expect(departureHour(ANCHOR, '2026-01-15T09:55:00Z')).toBe(0);
    expect(departureHour(ANCHOR, '2026-01-18T10:00:00Z')).toBeNull(); // +72 h
  });

  it('labels with weekday and 24-hour time', () => {
    expect(formatSliderTime(new Date(2026, 0, 13, 14, 0), 'en-US')).toBe('Tue 14:00');
    expect(formatSliderTime(new Date(2026, 0, 14, 7, 5), 'en-US')).toBe('Wed 07:05');
  });
});

describe('truckPositionAtHour', () => {
  // makeRoute: geometry (-97,32) -> (-96,32) over 3 h.
  const route = {
    ...makeRoute('A', [0, 0]),
    departure: new Date(ANCHOR + HOUR_MS).toISOString(),
    arrival: new Date(ANCHOR + 4 * HOUR_MS).toISOString(),
  };

  it('is hidden before departure and after arrival', () => {
    expect(truckPositionAtHour(route, ANCHOR, 0)).toBeNull();
    expect(truckPositionAtHour(route, ANCHOR, 5)).toBeNull();
  });

  it('interpolates along the route between departure and arrival', () => {
    expect(truckPositionAtHour(route, ANCHOR, 1)).toEqual([-97, 32]);
    const [lon, lat] = truckPositionAtHour(route, ANCHOR, 2)!;
    expect(lon).toBeCloseTo(-96 - 2 / 3, 6);
    expect(lat).toBe(32);
    expect(truckPositionAtHour(route, ANCHOR, 4)).toEqual([-96, 32]);
  });
});

describe('hourlyWorstLevels', () => {
  it('takes the worst checkpoint level the truck meets in each hour', () => {
    // Departs at +1 h; checkpoints every 30 min: levels by time 1:00 L, 1:30 M, 2:00 S, 2:30 L, 3:00 L.
    const route = timedRoute([0, 1, 3, 0, 0], 1, 30);
    const levels = hourlyWorstLevels(route, ANCHOR, 5);
    // Hour 1 [1:00,2:00) meets L, M and the start of S's stretch (from 1:45).
    // Hour 2 [2:00,3:00) meets S (to 2:15) and L.
    expect(levels).toEqual([null, 3, 3, null, null]);
  });

  it('returns null for hours before departure and after arrival', () => {
    const route = timedRoute([0, 2], 2, 60); // drives 2:00 -> 3:00
    expect(hourlyWorstLevels(route, ANCHOR, 4)).toEqual([null, null, 2, null]);
  });

  it('marks calm driving hours as Low, not empty', () => {
    const route = timedRoute([0, 0, 0], 0, 60); // 0:00 -> 2:00
    expect(hourlyWorstLevels(route, ANCHOR, 3)).toEqual([0, 0, null]);
  });
});

describe('rest stops', () => {
  // Drives 2:00-3:00 (1 h of driving split by a 1 h break at 30 min), arrival 4:00.
  function routeWithBreak() {
    const route = timedRoute([0, 3, 0], 2, 0);
    const dep = ANCHOR + 2 * HOUR_MS;
    route.departure = new Date(dep).toISOString();
    route.arrival = new Date(dep + 2 * HOUR_MS).toISOString();
    route.cumDurationS = [0, 3600];
    route.checkpoints[0].elapsedS = 0;
    route.checkpoints[1].elapsedS = 1800; // reached as the break starts
    route.checkpoints[2].elapsedS = 7200;
    route.stops = [
      {
        kind: 'break',
        lon: -96.5,
        lat: 32,
        distanceMi: 25,
        start: new Date(dep + 1800e3).toISOString(),
        end: new Date(dep + 5400e3).toISOString(),
        durationS: 3600,
        driveElapsedS: 1800,
        clockStartS: 1800,
      },
    ];
    return route;
  }

  it('maps clock time to driving time across stops', () => {
    const { stops } = routeWithBreak();
    expect(drivingElapsedAt(900, stops)).toEqual({ driveS: 900, stop: null });
    expect(drivingElapsedAt(3000, stops)).toEqual({ driveS: 1800, stop: stops[0] });
    expect(drivingElapsedAt(6300, stops)).toEqual({ driveS: 2700, stop: null });
  });

  it('parks the truck at the stop and marks it resting', () => {
    const route = routeWithBreak();
    // Slider hour 3 = 1 h after departure: inside the break.
    expect(truckStateAtHour(route, ANCHOR, 3)).toEqual({ pos: [-96.5, 32], resting: 'break' });
    expect(truckStateAtHour(route, ANCHOR, 2)?.resting).toBeNull();
    expect(truckStateAtHour(route, ANCHOR, 5)).toBeNull(); // arrived at 4:00
  });

  it('excludes rest time from the hazard timeline', () => {
    const route = routeWithBreak();
    route.stops[0] = { ...route.stops[0], clockStartS: 3600, durationS: 3600, driveElapsedS: 3600 };
    route.arrival = new Date(Date.parse(route.departure) + 3 * HOUR_MS).toISOString();
    route.checkpoints[2].elapsedS = 3 * 3600;
    // Hour 2 driving, hour 3 parked, hour 4 driving.
    expect(hourlyWorstLevels(route, ANCHOR, 6)).toEqual([null, null, 3, 'rest', 0, null]);
  });
});
