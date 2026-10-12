import type { Feature, Point } from 'geojson';
import type { HeatLayer, HeatmapResponse, LngLat, PlanResponse } from '../api/types';
import { HOUR_MS } from './timeline';

export type HazardType = 'rain' | 'snow' | 'wind';
export type HazardLevel = 1 | 2 | 3 | 4;

export interface Hazard {
  type: HazardType;
  level: HazardLevel;
}

export interface HazardProps extends Hazard {
  /** icon-rotate in degrees (wind only; the wind icon is drawn blowing east). */
  rot: number;
  selected: boolean;
}

/** Caps keep the symbol count (and collision work) bounded whatever the corridor size. */
export const MAX_ROUTE_SYMBOLS = 120;
export const MAX_GRID_SYMBOLS = 90;

/** On equal levels, precipitation wins: it also cuts visibility and traction. */
const TIE_ORDER: HazardType[] = ['snow', 'rain', 'wind'];

/** Animations start at Moderate (level 1); Low weather is not animated. */
export function isModerateOrHigher(level: number): level is HazardLevel {
  return level >= 1;
}

/** The hazard with the highest level, or null when nothing reaches Moderate. */
export function dominantHazard(levels: Record<HazardType, number>): Hazard | null {
  let best: Hazard | null = null;
  for (const type of TIE_ORDER) {
    const level = levels[type];
    if (isModerateOrHigher(level) && (best === null || level > best.level)) {
      best = { type, level };
    }
  }
  return best;
}

/**
 * Wind direction is reported as where the wind blows FROM; the icon must point where it blows
 * TO. The icon is drawn pointing east and icon-rotate turns it clockwise.
 */
export function windRotation(fromDegrees: number | null): number {
  if (fromDegrees === null) return 0;
  return (((fromDegrees + 180 - 90) % 360) + 360) % 360;
}

function digit(row: string | undefined, i: number): number {
  const code = row?.charCodeAt(i);
  return code === undefined || Number.isNaN(code) ? 0 : code - 48;
}

type HazardFeature = Feature<Point, HazardProps>;

function feature(at: LngLat, props: HazardProps): HazardFeature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: at } };
}

/** Highest levels first, then cap. */
function capped(features: HazardFeature[], max: number): HazardFeature[] {
  return features
    .sort(
      (a, b) =>
        Number(b.properties.selected) - Number(a.properties.selected) ||
        b.properties.level - a.properties.level,
    )
    .slice(0, max);
}

/** Dominant hazard at every route checkpoint for slider hour `hour` (heatmap-anchored). */
export function routeHazardFeatures(
  plan: PlanResponse,
  anchorMs: number,
  hour: number,
  selectedId: string | undefined,
  max = MAX_ROUTE_SYMBOLS,
): HazardFeature[] {
  // The plan's hourly data may be anchored to a different hour than the heatmap.
  const h = hour + Math.round((anchorMs - Date.parse(plan.meta.hourlyAnchor)) / HOUR_MS);
  if (h < 0 || h > plan.meta.hourlyHours) return [];
  const out: HazardFeature[] = [];
  for (const route of plan.routes) {
    const { wind, rain, snow, windDir } = route.hourly;
    route.checkpoints.forEach((c, i) => {
      const hz = dominantHazard({
        wind: digit(wind[h], i),
        rain: digit(rain[h], i),
        snow: digit(snow[h], i),
      });
      if (!hz) return;
      out.push(
        feature([c.lon, c.lat], {
          ...hz,
          rot: hz.type === 'wind' ? windRotation(windDir[h]?.[i] ?? null) : 0,
          selected: route.id === selectedId,
        }),
      );
    });
  }
  return capped(out, max);
}

/** Grid points where the selected heatmap layer reaches Moderate or higher at `hour`. */
export function gridHazardFeatures(
  heatmap: HeatmapResponse,
  layer: HeatLayer,
  hour: number,
  max = MAX_GRID_SYMBOLS,
): HazardFeature[] {
  const row = heatmap.levels[layer][hour];
  if (!row) return [];
  const out: HazardFeature[] = [];
  for (let i = 0; i < row.length; i++) {
    const level = digit(row, i);
    if (!isModerateOrHigher(level)) continue;
    out.push(
      feature(heatmap.points[i], {
        type: layer,
        level,
        rot: layer === 'wind' ? windRotation(heatmap.windDir[hour]?.[i] ?? null) : 0,
        selected: false,
      }),
    );
  }
  return capped(out, max);
}
