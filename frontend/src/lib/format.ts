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

/** "238 mi" for long distances, "12.5 mi" below 100. */
export function formatMiles(miles: number): string {
  if (miles >= 100) return `${intFmt.format(Math.round(miles))} mi`;
  const rounded = Math.round(miles * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} mi`;
}

/** Compact miles value without unit, "0", "4.5", "1,204". */
export function formatMilesValue(miles: number): string {
  if (miles >= 100) return intFmt.format(Math.round(miles));
  const rounded = Math.round(miles * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

export function formatWeight(lb: number): string {
  return `${intFmt.format(lb)} lb`;
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

export function formatWind(mph: number | null): string {
  return mph === null ? '—' : `${Math.round(mph)} mph`;
}

export function formatPrecip(inches: number | null): string {
  if (inches === null) return '—';
  if (inches === 0) return '0 in/h';
  return `${inches < 0.1 ? inches.toFixed(2) : inches.toFixed(2).replace(/0$/, '')} in/h`;
}

export function formatTempF(celsius: number | null): string {
  return celsius === null ? '—' : `${Math.round((celsius * 9) / 5 + 32)}°F`;
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
