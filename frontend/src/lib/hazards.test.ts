import type { PlanResponse } from '../api/types';
import { makeHeatmap, makePlan } from '../test/fixtures';
import {
  dominantHazard,
  gridHazardFeatures,
  isModerateOrHigher,
  routeHazardFeatures,
  windRotation,
} from './hazards';
import { HOUR_MS } from './timeline';

describe('Moderate-or-higher filter', () => {
  it.each([
    [0, false],
    [1, true],
    [2, true],
    [4, true],
  ])('level %i -> %s', (level, expected) => expect(isModerateOrHigher(level)).toBe(expected));
});

describe('dominantHazard', () => {
  it('returns null when nothing reaches Moderate', () => {
    expect(dominantHazard({ wind: 0, rain: 0, snow: 0 })).toBeNull();
  });
  it('picks the highest level', () => {
    expect(dominantHazard({ wind: 3, rain: 1, snow: 2 })).toEqual({ type: 'wind', level: 3 });
    expect(dominantHazard({ wind: 1, rain: 4, snow: 0 })).toEqual({ type: 'rain', level: 4 });
  });
  it('breaks ties toward precipitation: snow, then rain, then wind', () => {
    expect(dominantHazard({ wind: 2, rain: 2, snow: 2 })).toEqual({ type: 'snow', level: 2 });
    expect(dominantHazard({ wind: 2, rain: 2, snow: 0 })).toEqual({ type: 'rain', level: 2 });
  });
});

describe('windRotation', () => {
  it('points the east-facing icon downwind', () => {
    expect(windRotation(270)).toBe(0); // westerly wind blows east
    expect(windRotation(0)).toBe(90); // northerly blows south
    expect(windRotation(90)).toBe(180); // easterly blows west
    expect(windRotation(180)).toBe(270); // southerly blows north
    expect(windRotation(null)).toBe(0);
  });
});

function planWithHourly(): PlanResponse {
  const plan = makePlan();
  plan.meta.hourlyAnchor = '2026-01-15T10:00:00Z';
  plan.meta.hourlyHours = 48;
  for (const route of plan.routes) {
    const n = route.checkpoints.length;
    const row = (s: string) => Array.from({ length: 49 }, () => s.padEnd(n, '0'));
    route.hourly = {
      wind: row(route.id === 'A' ? '0300' : '0'),
      rain: row(route.id === 'A' ? '0110' : '01'),
      snow: row('0'),
      windDir: Array.from({ length: 49 }, () => Array(n).fill(270)),
    };
  }
  return plan;
}

describe('routeHazardFeatures', () => {
  it('emits the dominant Moderate+ hazard per checkpoint, selected route first', () => {
    const plan = planWithHourly();
    const features = routeHazardFeatures(plan, Date.parse(plan.meta.hourlyAnchor), 0, 'B');
    const summary = features.map((f) => [
      f.properties.selected,
      f.properties.type,
      f.properties.level,
    ]);
    expect(summary).toEqual([
      [true, 'rain', 1], // B, checkpoint 1
      [false, 'wind', 3], // A, checkpoint 1: wind 3 beats rain 1
      [false, 'rain', 1], // A, checkpoint 2
    ]);
    expect(features[1].properties.rot).toBe(0);
  });

  it('aligns the plan hours to the slider anchor and stops outside the window', () => {
    const plan = planWithHourly();
    const anchor = Date.parse(plan.meta.hourlyAnchor);
    expect(routeHazardFeatures(plan, anchor + HOUR_MS, 48, 'B')).toEqual([]); // plan hour 49
    expect(routeHazardFeatures(plan, anchor - HOUR_MS, 0, 'B')).toEqual([]); // plan hour -1
  });

  it('caps the number of symbols', () => {
    const plan = planWithHourly();
    expect(routeHazardFeatures(plan, Date.parse(plan.meta.hourlyAnchor), 0, 'B', 2)).toHaveLength(
      2,
    );
  });
});

describe('gridHazardFeatures', () => {
  it('keeps only Moderate+ points of the selected layer with wind rotation', () => {
    const heatmap = makeHeatmap('2026-01-15T10:00:00Z');
    heatmap.points = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    heatmap.levels = {
      wind: Array(49).fill('024'),
      rain: Array(49).fill('000'),
      snow: Array(49).fill('100'),
    };
    heatmap.windDir = Array.from({ length: 49 }, () => [0, 0, 90]);
    const wind = gridHazardFeatures(heatmap, 'wind', 3);
    expect(
      wind.map((f) => [f.geometry.coordinates[0], f.properties.level, f.properties.rot]),
    ).toEqual([
      [2, 4, 180],
      [1, 2, 90],
    ]);
    expect(gridHazardFeatures(heatmap, 'rain', 3)).toEqual([]);
    expect(gridHazardFeatures(heatmap, 'snow', 3)[0].properties.type).toBe('snow');
  });
});
