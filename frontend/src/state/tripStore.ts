import dayjs, { type Dayjs } from 'dayjs';
import { create } from 'zustand';
import type { Place, PlanRequest, RestPlan } from '../api/types';

export type Interval = 10 | 25 | 50;

export const MIN_WEIGHT = 1_000;
export const MAX_WEIGHT = 80_000;
export const WEIGHT_PRESETS = [
  { label: 'Light', value: 15_000 },
  { label: 'Medium', value: 35_000 },
  { label: 'Heavy', value: 45_000 },
  { label: 'Max', value: 80_000 },
];
export const DEPARTURE_SLACK_MIN = 10;
export const FORECAST_DAYS = 7;

/** Rest-stop settings. Everything is optional and editable; presets only fill in values. */
export interface RestSettings {
  enabled: boolean;
  breaksOn: boolean;
  breakEveryH: string;
  breakMin: string;
  overnightOn: boolean;
  overnightAfterH: string;
  overnightH: string;
}

export interface RestPreset {
  id: string;
  label: string;
  breaks: [everyH: number, minutes: number] | null;
  overnight: [afterDrivingH: number, hours: number] | null;
}

/** Typical legal limits per region, as a convenient starting point (see DECISIONS.md). */
export const REST_PRESETS: RestPreset[] = [
  { id: 'us', label: 'US', breaks: [8, 30], overnight: [11, 10] },
  { id: 'ca', label: 'Canada', breaks: null, overnight: [13, 10] },
  { id: 'eu', label: 'EU / UK', breaks: [4.5, 45], overnight: [9, 11] },
  { id: 'au', label: 'Australia', breaks: [5.25, 15], overnight: [12, 7] },
  { id: 'in', label: 'India', breaks: [5, 30], overnight: [8, 10] },
];

export const REST_LIMITS = {
  breakEveryH: [0.5, 24],
  breakMin: [5, 240],
  overnightAfterH: [1, 24],
  overnightH: [1, 48],
} as const;

const DEFAULT_REST: RestSettings = {
  enabled: false,
  breaksOn: true,
  breakEveryH: '8',
  breakMin: '30',
  overnightOn: true,
  overnightAfterH: '11',
  overnightH: '10',
};

export function nextFullHour(): Dayjs {
  return dayjs().add(1, 'hour').startOf('hour');
}

interface TripState {
  origin: Place | null;
  destination: Place | null;
  departure: Dayjs | null;
  weight: string;
  interval: Interval;
  rest: RestSettings;
  setOrigin: (p: Place | null) => void;
  setDestination: (p: Place | null) => void;
  swap: () => void;
  setDeparture: (d: Dayjs | null) => void;
  setWeight: (w: string) => void;
  setInterval: (i: Interval) => void;
  setRest: (patch: Partial<RestSettings>) => void;
  applyRestPreset: (preset: RestPreset) => void;
}

export const useTrip = create<TripState>((set) => ({
  origin: null,
  destination: null,
  departure: nextFullHour(),
  weight: '36000',
  interval: 25,
  rest: DEFAULT_REST,
  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  swap: () => set((s) => ({ origin: s.destination, destination: s.origin })),
  setDeparture: (departure) => set({ departure }),
  setWeight: (weight) => set({ weight }),
  setInterval: (interval) => set({ interval }),
  setRest: (patch) => set((s) => ({ rest: { ...s.rest, ...patch } })),
  applyRestPreset: (p) =>
    set((s) => ({
      rest: {
        ...s.rest,
        breaksOn: p.breaks !== null,
        breakEveryH: p.breaks ? String(p.breaks[0]) : s.rest.breakEveryH,
        breakMin: p.breaks ? String(p.breaks[1]) : s.rest.breakMin,
        overnightOn: p.overnight !== null,
        overnightAfterH: p.overnight ? String(p.overnight[0]) : s.rest.overnightAfterH,
        overnightH: p.overnight ? String(p.overnight[1]) : s.rest.overnightH,
      },
    })),
}));

export type RestField = 'breakEveryH' | 'breakMin' | 'overnightAfterH' | 'overnightH';
export type TripErrors = Partial<
  Record<'origin' | 'destination' | 'departure' | 'weight' | RestField, string>
>;

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const REST_LABELS: Record<RestField, string> = {
  breakEveryH: 'hours',
  breakMin: 'minutes',
  overnightAfterH: 'hours',
  overnightH: 'hours',
};

/** Range checks only for the parts the driver switched on; no legal rules are enforced. */
export function validateRest(rest: RestSettings): TripErrors {
  const errors: TripErrors = {};
  if (!rest.enabled) return errors;
  const fields: RestField[] = [
    ...(rest.breaksOn ? (['breakEveryH', 'breakMin'] as const) : []),
    ...(rest.overnightOn ? (['overnightAfterH', 'overnightH'] as const) : []),
  ];
  for (const f of fields) {
    const v = parseNumber(rest[f]);
    const [lo, hi] = REST_LIMITS[f];
    if (v === null || v < lo || v > hi) errors[f] = `${lo}–${hi} ${REST_LABELS[f]}`;
  }
  return errors;
}

export function toRestPlan(rest: RestSettings): RestPlan | null {
  if (!rest.enabled || (!rest.breaksOn && !rest.overnightOn)) return null;
  return {
    breaks: rest.breaksOn
      ? { everyH: Number(rest.breakEveryH), minutes: Math.round(Number(rest.breakMin)) }
      : null,
    overnight: rest.overnightOn
      ? { afterDrivingH: Number(rest.overnightAfterH), hours: Number(rest.overnightH) }
      : null,
  };
}

export function parseWeight(raw: string): number | null {
  const digits = raw.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/** Mirrors the backend rules so most mistakes are caught before a request is sent. */
export function validateTrip(
  s: Pick<TripState, 'origin' | 'destination' | 'departure' | 'weight'> & {
    rest?: RestSettings;
  },
  now: Dayjs = dayjs(),
): TripErrors {
  const errors: TripErrors = s.rest ? validateRest(s.rest) : {};
  if (!s.origin) errors.origin = 'Choose a starting point.';
  if (!s.destination) errors.destination = 'Choose a destination.';
  if (
    s.origin &&
    s.destination &&
    Math.abs(s.origin.lon - s.destination.lon) < 0.005 &&
    Math.abs(s.origin.lat - s.destination.lat) < 0.005
  ) {
    errors.destination = 'Destination must differ from the origin.';
  }
  if (!s.departure || !s.departure.isValid()) {
    errors.departure = 'Pick a departure date and time.';
  } else if (s.departure.isBefore(now.subtract(DEPARTURE_SLACK_MIN, 'minute'))) {
    errors.departure = 'Departure is in the past.';
  } else if (s.departure.isAfter(now.add(FORECAST_DAYS, 'day'))) {
    errors.departure = `Departure must be within the ${FORECAST_DAYS}-day forecast.`;
  }
  const weight = parseWeight(s.weight);
  if (weight === null) errors.weight = 'Enter the load in pounds.';
  else if (weight < MIN_WEIGHT || weight > MAX_WEIGHT)
    errors.weight = 'Load must be between 1,000 and 80,000 lb.';
  return errors;
}

export function toPlanRequest(s: TripState): PlanRequest {
  return {
    origin: { lon: s.origin!.lon, lat: s.origin!.lat, label: s.origin!.label },
    destination: { lon: s.destination!.lon, lat: s.destination!.lat, label: s.destination!.label },
    departure: s.departure!.toDate().toISOString(),
    weightLb: parseWeight(s.weight)!,
    intervalMi: s.interval,
    restPlan: toRestPlan(s.rest),
  };
}
