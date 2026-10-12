import dayjs, { type Dayjs } from 'dayjs';
import { create } from 'zustand';
import type { Place, PlanRequest, RestPlan } from '../api/types';
import {
  UNITS,
  WEIGHT_RANGE,
  unitSystemFor,
  weightFromLb,
  weightToLb,
  type Units,
} from '../lib/units';

export type Interval = 10 | 25 | 50;

const COUNTRY_KEY = 'saferp:country';

function readCountry(): string {
  try {
    return localStorage.getItem(COUNTRY_KEY) ?? 'US';
  } catch {
    return 'US';
  }
}

function storeCountry(country: string) {
  try {
    localStorage.setItem(COUNTRY_KEY, country);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

export function unitsFor(country: string): Units {
  return UNITS[unitSystemFor(country)];
}

/** Display units for the selected country. */
export function useUnits(): Units {
  return useTrip((s) => unitsFor(s.country));
}
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
  /** ISO 3166 alpha-2 code filtering place search ('' = worldwide); also picks the units. */
  country: string;
  origin: Place | null;
  destination: Place | null;
  departure: Dayjs | null;
  /** Load weight as typed, in the selected country's weight unit (lb or kg). */
  weight: string;
  interval: Interval;
  rest: RestSettings;
  setCountry: (country: string) => void;
  setOrigin: (p: Place | null) => void;
  setDestination: (p: Place | null) => void;
  swap: () => void;
  setDeparture: (d: Dayjs | null) => void;
  setWeight: (w: string) => void;
  setInterval: (i: Interval) => void;
  setRest: (patch: Partial<RestSettings>) => void;
  applyRestPreset: (preset: RestPreset) => void;
}

const initialCountry = readCountry();

export const useTrip = create<TripState>((set) => ({
  country: initialCountry,
  origin: null,
  destination: null,
  departure: nextFullHour(),
  weight: String(Math.round(weightFromLb(36_000, unitsFor(initialCountry)))),
  interval: 25,
  rest: DEFAULT_REST,
  setCountry: (country) =>
    set((s) => {
      storeCountry(country);
      // Keep the same load when the weight unit changes (e.g. 36,000 lb -> 16,329 kg).
      const from = unitsFor(s.country);
      const to = unitsFor(country);
      const value = parseWeight(s.weight);
      const weight =
        value === null || from.weight === to.weight
          ? s.weight
          : String(Math.round(weightFromLb(weightToLb(value, from), to)));
      return { country, weight };
    }),
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
    country?: string;
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
  const units = unitsFor(s.country ?? 'US');
  const [min, max] = WEIGHT_RANGE[units.weight];
  const weight = parseWeight(s.weight);
  const fmt = new Intl.NumberFormat('en-US');
  if (weight === null)
    errors.weight = `Enter the load in ${units.weight === 'lb' ? 'pounds' : 'kilograms'}.`;
  else if (weight < min || weight > max)
    errors.weight = `Load must be between ${fmt.format(min)} and ${fmt.format(max)} ${units.weight}.`;
  return errors;
}

export function toPlanRequest(s: TripState): PlanRequest {
  return {
    origin: { lon: s.origin!.lon, lat: s.origin!.lat, label: s.origin!.label },
    destination: { lon: s.destination!.lon, lat: s.destination!.lat, label: s.destination!.label },
    departure: s.departure!.toDate().toISOString(),
    weightLb: Math.round(weightToLb(parseWeight(s.weight)!, unitsFor(s.country))),
    intervalMi: s.interval,
    restPlan: toRestPlan(s.rest),
    distanceUnit: unitsFor(s.country).distance,
  };
}
