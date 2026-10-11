import type { LngLat, Route } from '../api/types';

/** Binary search: last index i with values[i] <= x. */
function floorIndex(values: number[], x: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Position along a route `elapsedS` seconds after departure, or null outside the trip. */
export function positionAtElapsed(
  route: Pick<Route, 'geometry' | 'cumDurationS'>,
  elapsedS: number,
): LngLat | null {
  const { geometry, cumDurationS } = route;
  const total = cumDurationS[cumDurationS.length - 1];
  if (geometry.length < 2 || elapsedS < 0 || elapsedS > total) return null;
  const i = Math.min(floorIndex(cumDurationS, elapsedS), geometry.length - 2);
  const span = cumDurationS[i + 1] - cumDurationS[i];
  const f = span > 0 ? (elapsedS - cumDurationS[i]) / span : 0;
  const [ax, ay] = geometry[i];
  const [bx, by] = geometry[i + 1];
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
}

export function boundsOf(points: LngLat[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
