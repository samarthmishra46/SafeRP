import type { LngLat, RestStop, RiskLevel, Route, StopKind } from '../api/types';
import { positionAtElapsed } from './geo';

export const HOUR_MS = 3_600_000;
export const SLIDER_HOURS = 48;

/**
 * The slider works in whole forecast hours: hour h is the time `anchor + h` (anchor = the
 * current UTC hour) and shows the forecast frame covering [anchor + h, anchor + h + 1).
 */
export function sliderTimeMs(anchorMs: number, hour: number): number {
  return anchorMs + hour * HOUR_MS;
}

/** First slider hour at or after the departure, or null when it is beyond the window. */
export function departureHour(
  anchorMs: number,
  departureIso: string,
  maxHour = SLIDER_HOURS,
): number | null {
  const h = Math.ceil((Date.parse(departureIso) - anchorMs) / HOUR_MS);
  if (h > maxHour) return null;
  return Math.max(0, h);
}

/**
 * Driving time completed `clockS` seconds after departure, given the route's rest stops, and
 * the stop in progress (if any). Stops are in clock order.
 */
export function drivingElapsedAt(
  clockS: number,
  stops: RestStop[],
): { driveS: number; stop: RestStop | null } {
  let paused = 0;
  for (const stop of stops) {
    if (clockS < stop.clockStartS) break;
    if (clockS < stop.clockStartS + stop.durationS) return { driveS: stop.driveElapsedS, stop };
    paused += stop.durationS;
  }
  return { driveS: clockS - paused, stop: null };
}

export interface TruckState {
  pos: LngLat;
  /** Set while the truck is parked at a rest stop. */
  resting: StopKind | null;
}

type TruckRoute = Pick<Route, 'geometry' | 'cumDurationS' | 'departure' | 'arrival' | 'stops'>;

/** Where the truck on `route` is at slider hour `hour`; null before departure or after arrival. */
export function truckStateAtHour(
  route: TruckRoute,
  anchorMs: number,
  hour: number,
): TruckState | null {
  const t = sliderTimeMs(anchorMs, hour);
  if (t < Date.parse(route.departure) || t > Date.parse(route.arrival)) return null;
  const { driveS, stop } = drivingElapsedAt((t - Date.parse(route.departure)) / 1000, route.stops);
  const pos = stop ? ([stop.lon, stop.lat] as LngLat) : positionAtElapsed(route, driveS);
  return pos ? { pos, resting: stop?.kind ?? null } : null;
}

export function truckPositionAtHour(
  route: TruckRoute,
  anchorMs: number,
  hour: number,
): LngLat | null {
  return truckStateAtHour(route, anchorMs, hour)?.pos ?? null;
}

/** Position of a timestamp on the slider track as a fraction of the window (may be outside 0–1). */
export function trackFraction(anchorMs: number, timeMs: number, maxHour = SLIDER_HOURS): number {
  return (timeMs - anchorMs) / HOUR_MS / maxHour;
}

/** A timeline cell: the worst risk while driving, 'rest' when parked all hour, null when off the trip. */
export type HourCell = RiskLevel | 'rest' | null;

/**
 * Worst risk the truck faces during each hour [anchor + h, anchor + h + 1), h = 0..hours-1.
 *
 * Each checkpoint owns the stretch of *time* from the midpoint of its ETA with the previous
 * checkpoint to the midpoint with the next (mirroring how it owns miles), so an hour's level is
 * the max over checkpoints whose stretch overlaps the hour's *driving* time. These are the
 * ETA-forecast levels that drive the recommendation. Time spent at rest stops is excluded; an
 * hour with no driving but a stop is 'rest'. Hours off the trip are null.
 */
export function hourlyWorstLevels(
  route: Pick<Route, 'checkpoints' | 'departure' | 'arrival' | 'stops'>,
  anchorMs: number,
  hours = SLIDER_HOURS,
): HourCell[] {
  const dep = Date.parse(route.departure);
  const arr = Date.parse(route.arrival);
  const cps = route.checkpoints;
  const t = cps.map((c) => dep + c.elapsedS * 1000);
  const spans = cps.map((c, i) => ({
    level: c.level,
    start: i === 0 ? t[0] : (t[i - 1] + t[i]) / 2,
    end: i === cps.length - 1 ? t[i] : (t[i] + t[i + 1]) / 2,
  }));
  const rests = route.stops.map((s) => [
    dep + s.clockStartS * 1000,
    dep + (s.clockStartS + s.durationS) * 1000,
  ]);

  const out: HourCell[] = [];
  for (let h = 0; h < hours; h++) {
    const from = Math.max(anchorMs + h * HOUR_MS, dep);
    const to = Math.min(anchorMs + (h + 1) * HOUR_MS, arr);
    if (from >= to) {
      out.push(null);
      continue;
    }
    // Driving parts of the hour: [from, to) minus the rest stops.
    let parts: [number, number][] = [[from, to]];
    for (const [a, b] of rests) {
      parts = parts.flatMap(([x, y]): [number, number][] =>
        b <= x || a >= y
          ? [[x, y]]
          : (
              [
                [x, Math.min(a, y)],
                [Math.max(b, x), y],
              ] as [number, number][]
            ).filter(([p, q]) => q > p),
      );
    }
    if (parts.length === 0) {
      out.push('rest');
      continue;
    }
    let worst: RiskLevel | null = null;
    for (const s of spans) {
      const overlaps = parts.some(([x, y]) => s.start < y && s.end > x);
      if (overlaps && (worst === null || s.level > worst)) worst = s.level;
    }
    out.push(worst);
  }
  return out;
}
