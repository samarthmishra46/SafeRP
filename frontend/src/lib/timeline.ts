import type { LngLat, RiskLevel, Route } from '../api/types';
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

/** Where the truck on `route` is at slider hour `hour`; null before departure or after arrival. */
export function truckPositionAtHour(
  route: Pick<Route, 'geometry' | 'cumDurationS' | 'departure'>,
  anchorMs: number,
  hour: number,
): LngLat | null {
  const elapsedS = (sliderTimeMs(anchorMs, hour) - Date.parse(route.departure)) / 1000;
  return positionAtElapsed(route, elapsedS);
}

/** Position of a timestamp on the slider track as a fraction of the window (may be outside 0–1). */
export function trackFraction(anchorMs: number, timeMs: number, maxHour = SLIDER_HOURS): number {
  return (timeMs - anchorMs) / HOUR_MS / maxHour;
}

/**
 * Worst risk the truck faces during each hour [anchor + h, anchor + h + 1), h = 0..hours-1.
 *
 * Each checkpoint owns the stretch of *time* from the midpoint of its ETA with the previous
 * checkpoint to the midpoint with the next (mirroring how it owns miles), so an hour's level is
 * the max over checkpoints whose stretch overlaps it. These are the ETA-forecast levels that
 * drive the recommendation. Hours when the truck is not on the road are null.
 */
export function hourlyWorstLevels(
  route: Pick<Route, 'checkpoints' | 'departure'>,
  anchorMs: number,
  hours = SLIDER_HOURS,
): (RiskLevel | null)[] {
  const dep = Date.parse(route.departure);
  const cps = route.checkpoints;
  const t = cps.map((c) => dep + c.elapsedS * 1000);
  const spans = cps.map((c, i) => ({
    level: c.level,
    start: i === 0 ? t[0] : (t[i - 1] + t[i]) / 2,
    end: i === cps.length - 1 ? t[i] : (t[i] + t[i + 1]) / 2,
  }));
  const out: (RiskLevel | null)[] = [];
  for (let h = 0; h < hours; h++) {
    const from = anchorMs + h * HOUR_MS;
    const to = from + HOUR_MS;
    let worst: RiskLevel | null = null;
    for (const s of spans) {
      const overlaps = s.start < to && s.end > from;
      if (overlaps && (worst === null || s.level > worst)) worst = s.level;
    }
    out.push(worst);
  }
  return out;
}
