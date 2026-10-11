import type { PaletteMode } from '@mui/material';
import type { RiskLevel } from '../api/types';

/**
 * Five-step risk scale derived from the Okabe–Ito colour-blind-safe palette. Hue and lightness
 * both change step to step, and every use pairs the colour with a label or a letter code.
 */
const COLORS: Record<PaletteMode, Record<RiskLevel, string>> = {
  light: { 0: '#0E9E74', 1: '#E3BC2D', 2: '#E68A00', 3: '#CF4B00', 4: '#6B1E5C' },
  dark: { 0: '#2CC495', 1: '#F2D45C', 2: '#F7A531', 3: '#FF7337', 4: '#E07ACB' },
};

const ON_COLORS: Record<RiskLevel, string> = {
  0: '#FFFFFF',
  1: '#1E1A05',
  2: '#1F1300',
  3: '#FFFFFF',
  4: '#FFFFFF',
};

export const RISK_LEVELS: RiskLevel[] = [0, 1, 2, 3, 4];

export const RISK_LABEL: Record<RiskLevel, string> = {
  0: 'Low',
  1: 'Moderate',
  2: 'High',
  3: 'Severe',
  4: 'No Travel',
};

/** One-character code drawn inside map markers so colour is never the only cue. */
export const RISK_CODE: Record<RiskLevel, string> = { 0: 'L', 1: 'M', 2: 'H', 3: 'S', 4: 'X' };

export const MILES_KEY = {
  4: 'noTravel',
  3: 'severe',
  2: 'high',
  1: 'moderate',
  0: 'low',
} as const satisfies Record<RiskLevel, string>;

export function riskColor(level: RiskLevel, mode: PaletteMode): string {
  return COLORS[mode][level];
}

export function riskOnColor(level: RiskLevel): string {
  return ON_COLORS[level];
}

export function riskPalette(mode: PaletteMode): Record<RiskLevel, string> {
  return COLORS[mode];
}
