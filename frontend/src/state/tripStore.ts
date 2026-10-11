import dayjs, { type Dayjs } from 'dayjs';
import { create } from 'zustand';
import type { Place, PlanRequest } from '../api/types';

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

export function nextFullHour(): Dayjs {
  return dayjs().add(1, 'hour').startOf('hour');
}

interface TripState {
  origin: Place | null;
  destination: Place | null;
  departure: Dayjs | null;
  weight: string;
  interval: Interval;
  setOrigin: (p: Place | null) => void;
  setDestination: (p: Place | null) => void;
  swap: () => void;
  setDeparture: (d: Dayjs | null) => void;
  setWeight: (w: string) => void;
  setInterval: (i: Interval) => void;
}

export const useTrip = create<TripState>((set) => ({
  origin: null,
  destination: null,
  departure: nextFullHour(),
  weight: '36000',
  interval: 25,
  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  swap: () => set((s) => ({ origin: s.destination, destination: s.origin })),
  setDeparture: (departure) => set({ departure }),
  setWeight: (weight) => set({ weight }),
  setInterval: (interval) => set({ interval }),
}));

export type TripErrors = Partial<Record<'origin' | 'destination' | 'departure' | 'weight', string>>;

export function parseWeight(raw: string): number | null {
  const digits = raw.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/** Mirrors the backend rules so most mistakes are caught before a request is sent. */
export function validateTrip(
  s: Pick<TripState, 'origin' | 'destination' | 'departure' | 'weight'>,
  now: Dayjs = dayjs(),
): TripErrors {
  const errors: TripErrors = {};
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
  };
}
