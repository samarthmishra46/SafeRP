/**
 * Display units. The API always speaks miles, mph, inches and pounds (the risk rules are
 * defined in them); the UI converts for display and converts the load weight back on submit.
 */

export type UnitSystem = 'imperial' | 'uk' | 'metric';

export interface Units {
  system: UnitSystem;
  distance: 'mi' | 'km';
  distanceWord: 'miles' | 'km';
  speed: 'mph' | 'km/h';
  weight: 'lb' | 'kg';
  rain: 'in/h' | 'mm/h';
  snow: 'in/h' | 'cm/h';
  temperature: '°F' | '°C';
}

export const UNITS: Record<UnitSystem, Units> = {
  imperial: {
    system: 'imperial',
    distance: 'mi',
    distanceWord: 'miles',
    speed: 'mph',
    weight: 'lb',
    rain: 'in/h',
    snow: 'in/h',
    temperature: '°F',
  },
  // UK roads use miles and mph; weights and weather are metric.
  uk: {
    system: 'uk',
    distance: 'mi',
    distanceWord: 'miles',
    speed: 'mph',
    weight: 'kg',
    rain: 'mm/h',
    snow: 'cm/h',
    temperature: '°C',
  },
  metric: {
    system: 'metric',
    distance: 'km',
    distanceWord: 'km',
    speed: 'km/h',
    weight: 'kg',
    rain: 'mm/h',
    snow: 'cm/h',
    temperature: '°C',
  },
};

/** The US and its territories (and Liberia) use US customary units on the road. */
const IMPERIAL_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'LR']);

/** '' means worldwide, which uses metric. */
export function unitSystemFor(country: string): UnitSystem {
  if (country === 'GB') return 'uk';
  return IMPERIAL_COUNTRIES.has(country) ? 'imperial' : 'metric';
}

export const KM_PER_MI = 1.609344;
export const KG_PER_LB = 0.45359237;

export function toDistance(miles: number, u: Units): number {
  return u.distance === 'km' ? miles * KM_PER_MI : miles;
}

export function toSpeed(mph: number, u: Units): number {
  return u.speed === 'km/h' ? mph * KM_PER_MI : mph;
}

export function toRain(inchesPerHour: number, u: Units): number {
  return u.rain === 'mm/h' ? inchesPerHour * 25.4 : inchesPerHour;
}

export function toSnow(inchesPerHour: number, u: Units): number {
  return u.snow === 'cm/h' ? inchesPerHour * 2.54 : inchesPerHour;
}

export function toTemperature(celsius: number, u: Units): number {
  return u.temperature === '°F' ? (celsius * 9) / 5 + 32 : celsius;
}

export function weightFromLb(lb: number, u: Units): number {
  return u.weight === 'kg' ? lb * KG_PER_LB : lb;
}

export function weightToLb(value: number, u: Units): number {
  return u.weight === 'kg' ? value / KG_PER_LB : value;
}

/** Load limits from the brief (1,000–80,000 lb), expressed in each weight unit. */
export const WEIGHT_RANGE: Record<Units['weight'], [number, number]> = {
  lb: [1_000, 80_000],
  kg: [454, 36_287], // rounded inward so the converted value stays inside the lb range
};

export const WEIGHT_PRESETS: Record<
  Units['weight'],
  { label: string; value: number; short: string }[]
> = {
  lb: [
    { label: 'Light', value: 15_000, short: '15k' },
    { label: 'Medium', value: 35_000, short: '35k' },
    { label: 'Heavy', value: 45_000, short: '45k' },
    { label: 'Max', value: 80_000, short: '80k' },
  ],
  // Same load-rule bands as the lb presets: below 30,000 lb, 30–40k, above 40k, near the max.
  kg: [
    { label: 'Light', value: 7_000, short: '7 t' },
    { label: 'Medium', value: 16_000, short: '16 t' },
    { label: 'Heavy', value: 20_000, short: '20 t' },
    { label: 'Max', value: 36_000, short: '36 t' },
  ],
};
