export type RiskLevel = 0 | 1 | 2 | 3 | 4;
export type Factor = 'wind' | 'rain' | 'snow';
export type LngLat = [number, number];

export interface Place {
  id: string;
  name: string;
  label: string;
  context: string;
  type: string;
  lon: number;
  lat: number;
}

export interface CheckpointWeather {
  windSpeedMph: number | null;
  windGustMph: number | null;
  windDirectionDeg: number | null;
  windUsedMph: number | null;
  rainIn: number | null;
  snowIn: number | null;
  temperatureC: number | null;
  validHour: string;
}

export interface Checkpoint {
  index: number;
  lon: number;
  lat: number;
  distanceMi: number;
  eta: string;
  elapsedS: number;
  spanMi: [number, number];
  level: RiskLevel;
  levelLabel: string;
  drivers: Factor[];
  loadRule: string | null;
  missing: Factor[];
  factorLevels: Record<Factor, RiskLevel>;
  weather: CheckpointWeather;
}

export interface Segment {
  checkpointIndex: number;
  level: RiskLevel;
  coords: LngLat[];
}

export type MilesByLevel = Record<'noTravel' | 'severe' | 'high' | 'moderate' | 'low', number>;

export interface Route {
  id: string;
  name: string;
  via: string;
  source: string;
  rank: number;
  distanceMi: number;
  durationS: number;
  departure: string;
  arrival: string;
  geometry: LngLat[];
  cumDurationS: number[];
  segments: Segment[];
  checkpoints: Checkpoint[];
  summary: { miles: MilesByLevel; avgRisk: number; maxLevel: RiskLevel };
  /** Per slider hour: one level digit per checkpoint per factor, plus wind direction (FROM). */
  hourly: HourlyHazards;
}

export interface HourlyHazards {
  wind: string[];
  rain: string[];
  snow: string[];
  windDir: (number | null)[][];
}

export interface RankingRow {
  routeId: string;
  rank: number;
  noTravelMi: number;
  severeMi: number;
  highMi: number;
  avgRisk: number;
  durationMin: number;
}

export interface Recommendation {
  routeId: string;
  reason: string;
  notRecommended: boolean;
  suggestion: { departure: string; shiftHours: number; routeId: string } | null;
  ranking: RankingRow[];
}

export interface PlanResponse {
  routes: Route[];
  recommendation: Recommendation;
  notices: string[];
  meta: {
    generatedAt: string;
    windMetric: 'gust' | 'sustained';
    intervalMi: number;
    weightLb: number;
    departure: string;
    bbox: [number, number, number, number];
    /** Hour 0 of `routes[].hourly` (a whole UTC hour). */
    hourlyAnchor: string;
    hourlyHours: number;
  };
}

export interface PlanRequest {
  origin: { lon: number; lat: number; label: string };
  destination: { lon: number; lat: number; label: string };
  departure: string;
  weightLb: number;
  intervalMi: 10 | 25 | 50;
}

export type HeatLayer = 'wind' | 'rain' | 'snow';

export interface HeatmapResponse {
  anchor: string;
  hours: number;
  times: string[];
  spacingDeg: number;
  windMetric: 'gust' | 'sustained';
  points: LngLat[];
  wind: (number | null)[][];
  rain: (number | null)[][];
  snow: (number | null)[][];
  /** Per hour: one level digit (table thresholds) per grid point for each layer. */
  levels: Record<HeatLayer, string[]>;
  /** Per hour, per point: wind direction in degrees (where it blows FROM), rounded to 10. */
  windDir: (number | null)[][];
}
