import type { Checkpoint, HeatmapResponse, PlanResponse, RiskLevel, Route } from '../api/types';

function checkpoint(
  index: number,
  mile: number,
  span: [number, number],
  level: RiskLevel,
): Checkpoint {
  return {
    index,
    lon: -97 + index * 0.1,
    lat: 32,
    distanceMi: mile,
    eta: new Date(Date.UTC(2026, 0, 15, 12, index * 20)).toISOString(),
    elapsedS: index * 1200,
    spanMi: span,
    level,
    levelLabel: ['Low', 'Moderate', 'High', 'Severe', 'No Travel'][level],
    drivers: level ? ['wind'] : [],
    loadRule: null,
    missing: [],
    factorLevels: { wind: level, rain: 0, snow: 0 },
    weather: {
      windSpeedMph: 10,
      windGustMph: [10, 28, 38, 48, 58][level],
      windDirectionDeg: 180,
      windUsedMph: [10, 28, 38, 48, 58][level],
      rainIn: 0,
      snowIn: 0,
      temperatureC: 10,
      validHour: '2026-01-15T12:00:00Z',
    },
  };
}

export function makeRoute(id: string, levels: RiskLevel[], overrides: Partial<Route> = {}): Route {
  const n = levels.length;
  const total = (n - 1) * 25;
  const cps = levels.map((lvl, i) =>
    checkpoint(i, i * 25, [Math.max(0, i * 25 - 12.5), Math.min(total, i * 25 + 12.5)], lvl),
  );
  const miles = { noTravel: 0, severe: 0, high: 0, moderate: 0, low: 0 };
  const keys = ['low', 'moderate', 'high', 'severe', 'noTravel'] as const;
  cps.forEach((c) => (miles[keys[c.level]] += c.spanMi[1] - c.spanMi[0]));
  return {
    id,
    name: `Route ${id}`,
    via: 'I 45 South',
    source: 'primary',
    rank: 1,
    distanceMi: total,
    durationS: 3 * 3600,
    departure: '2026-01-15T12:00:00Z',
    arrival: '2026-01-15T15:00:00Z',
    geometry: [
      [-97, 32],
      [-96, 32],
    ],
    cumDurationS: [0, 10800],
    segments: cps.map((c) => ({ checkpointIndex: c.index, level: c.level, coords: [] })),
    checkpoints: cps,
    summary: { miles, avgRisk: 0, maxLevel: Math.max(...levels) as RiskLevel },
    hourly: { wind: [], rain: [], snow: [], windDir: [] },
    ...overrides,
  };
}

export function makePlan(): PlanResponse {
  const a = makeRoute('A', [0, 3, 3, 0, 0], { rank: 2, durationS: 3 * 3600 });
  const b = makeRoute('B', [0, 0, 1, 0, 0], { rank: 1, durationS: 3 * 3600 + 14 * 60 });
  return {
    routes: [a, b],
    recommendation: {
      routeId: 'B',
      reason: 'Route B has 0 Severe miles vs 50 on Route A, and is 14 minutes longer.',
      notRecommended: false,
      suggestion: null,
      ranking: [
        {
          routeId: 'B',
          rank: 1,
          noTravelMi: 0,
          severeMi: 0,
          highMi: 0,
          avgRisk: 0.25,
          durationMin: 194,
        },
        {
          routeId: 'A',
          rank: 2,
          noTravelMi: 0,
          severeMi: 50,
          highMi: 0,
          avgRisk: 1.5,
          durationMin: 180,
        },
      ],
    },
    notices: [],
    meta: {
      generatedAt: '2026-01-15T11:00:00Z',
      windMetric: 'gust',
      intervalMi: 25,
      weightLb: 36000,
      departure: '2026-01-15T12:00:00Z',
      bbox: [-97, 32, -96, 32],
      hourlyAnchor: '2026-01-15T10:00:00Z',
      hourlyHours: 48,
    },
  };
}

export function makeHeatmap(anchorIso: string): HeatmapResponse {
  const empty = () => Array.from({ length: 49 }, () => [] as number[]);
  return {
    anchor: anchorIso,
    hours: 48,
    times: Array.from({ length: 49 }, (_, h) =>
      new Date(Date.parse(anchorIso) + h * 3_600_000).toISOString(),
    ),
    spacingDeg: 0.5,
    windMetric: 'gust',
    points: [],
    wind: empty(),
    rain: empty(),
    snow: empty(),
    levels: { wind: [], rain: [], snow: [] },
    windDir: empty(),
  };
}
