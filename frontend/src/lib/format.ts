import {
  toDistance,
  toRain,
  toSnow,
  toSpeed,
  toTemperature,
  weightFromLb,
  type Units,
} from './units';

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "3 h 42 min", "45 min" */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function compact(value: number): string {
  if (value >= 100) return intFmt.format(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** "238 mi" / "383 km": whole units from 100 up, one decimal below. */
export function formatDistance(miles: number, u: Units): string {
  return `${compact(toDistance(miles, u))} ${u.distance}`;
}

/** Distance value without unit, "0", "4.5", "1,204". */
export function formatDistanceValue(miles: number, u: Units): string {
  return compact(toDistance(miles, u));
}

/**
 * Checkpoint interval label. Intervals are 10/25/50 miles (the brief); in km they are shown as
 * whole numbers (16/40/80) because the exact 16.1/40.2/80.5 reads as noise on a selector.
 */
export function formatInterval(miles: number, u: Units): string {
  return u.distance === 'km' ? `${Math.round(miles * 1.609344)} km` : `${miles} mi`;
}

/** Position along a route: "mile 25" / "km 40". */
export function formatMilepost(miles: number, u: Units): string {
  return `${u.distance === 'mi' ? 'mile' : 'km'} ${compact(toDistance(miles, u))}`;
}

export function formatWeight(lb: number, u: Units): string {
  return `${intFmt.format(Math.round(weightFromLb(lb, u)))} ${u.weight}`;
}

/** Local clock time; adds the weekday when the date differs from `reference`. */
export function formatTime(iso: string | Date, reference: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const sameDay = d.toDateString() === reference.toDateString();
  return sameDay ? timeFmt.format(d) : dayTimeFmt.format(d);
}

export function formatDateTime(iso: string | Date): string {
  return fullFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatWind(mph: number | null, u: Units): string {
  return mph === null ? '—' : `${Math.round(toSpeed(mph, u))} ${u.speed}`;
}

function formatRate(value: number, unit: string, decimals: number): string {
  // Round, then drop trailing zeros: 0.05 -> "0.05", 0.10 -> "0.1", 1.00 -> "1".
  return `${Number(value.toFixed(decimals))} ${unit}`;
}

/** Rain rate: inches to 2 decimals, millimetres to 1. */
export function formatRain(inches: number | null, u: Units): string {
  if (inches === null) return '—';
  return formatRate(toRain(inches, u), u.rain, u.rain === 'in/h' ? 2 : 1);
}

/** Snowfall rate: inches to 2 decimals, centimetres to 1. */
export function formatSnow(inches: number | null, u: Units): string {
  if (inches === null) return '—';
  return formatRate(toSnow(inches, u), u.snow, u.snow === 'in/h' ? 2 : 1);
}

export function formatTemperature(celsius: number | null, u: Units): string {
  return celsius === null ? '—' : `${Math.round(toTemperature(celsius, u))}${u.temperature}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Wind "from" direction as a compass point. */
export function formatCompass(degrees: number | null): string {
  if (degrees === null) return '';
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/** "+3 h" style offset label for the forecast timeline. */
export function formatHourOffset(hour: number): string {
  return hour === 0 ? 'Now' : `+${hour} h`;
}

export function joinFactors(factors: string[]): string {
  if (factors.length === 0) return '';
  const cap = factors.map((f) => f[0].toUpperCase() + f.slice(1));
  if (cap.length === 1) return cap[0];
  return `${cap.slice(0, -1).join(', ')} and ${cap[cap.length - 1]}`;
}

/** Slider label: weekday and 24-hour local time, e.g. "Tue 14:00". */
const weekdayFormats = new Map<string | undefined, Intl.DateTimeFormat>();

export function formatSliderTime(date: Date, locale?: string): string {
  let fmt = weekdayFormats.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    weekdayFormats.set(locale, fmt);
  }
  const weekday = fmt.format(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${weekday} ${hh}:${mm}`;
}
