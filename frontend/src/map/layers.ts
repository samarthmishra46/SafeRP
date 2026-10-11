import type { PaletteMode } from '@mui/material';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { LayerProps } from 'react-map-gl/maplibre';
import type { HeatLayer } from '../api/types';
import { RISK_CODE, riskPalette } from '../theme/risk';

export const MAP_STYLES: Record<PaletteMode, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const FONT = ['Noto Sans Regular'];

function levelColor(mode: PaletteMode): ExpressionSpecification {
  const c = riskPalette(mode);
  return ['match', ['get', 'level'], 0, c[0], 1, c[1], 2, c[2], 3, c[3], c[4]];
}

export function routeLayers(mode: PaletteMode) {
  const muted = mode === 'light' ? '#8A96A6' : '#5F6B7B';
  const casing = mode === 'light' ? '#FFFFFF' : '#0E1217';
  const hit: LayerProps = {
    id: 'routes-hit',
    type: 'line',
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };
  const mutedCasing: LayerProps = {
    id: 'routes-casing',
    type: 'line',
    paint: { 'line-color': casing, 'line-width': ['case', ['get', 'hover'], 8, 6] },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };
  const mutedLine: LayerProps = {
    id: 'routes-line',
    type: 'line',
    paint: {
      'line-color': muted,
      'line-width': ['case', ['get', 'hover'], 4.5, 3],
      'line-opacity': ['case', ['get', 'hover'], 1, 0.85],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };
  return { hit, mutedCasing, mutedLine };
}

export function segmentLayers(mode: PaletteMode) {
  const casing: LayerProps = {
    id: 'seg-casing',
    type: 'line',
    paint: {
      'line-color': mode === 'light' ? '#17202B' : '#000000',
      'line-width': 9,
      'line-opacity': mode === 'light' ? 0.55 : 0.8,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };
  const line: LayerProps = {
    id: 'seg-line',
    type: 'line',
    paint: { 'line-color': levelColor(mode), 'line-width': 6 },
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
  };
  // A dashed overlay marks No Travel stretches without relying on colour.
  const noTravel: LayerProps = {
    id: 'seg-no-travel',
    type: 'line',
    filter: ['==', ['get', 'level'], 4],
    paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-dasharray': [1.5, 1.5] },
  };
  return { casing, line, noTravel };
}

export function checkpointLayers(mode: PaletteMode) {
  const stroke = mode === 'light' ? '#FFFFFF' : '#0E1217';
  const radius: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    ['+', 5, ['*', ['get', 'level'], 0.6]],
    10,
    ['+', 8, ['*', ['get', 'level'], 0.8]],
  ];
  const circle: LayerProps = {
    id: 'cp-circle',
    type: 'circle',
    paint: {
      'circle-color': levelColor(mode),
      'circle-radius': radius,
      'circle-stroke-color': stroke,
      'circle-stroke-width': 1.5,
    },
  };
  const label: LayerProps = {
    id: 'cp-label',
    type: 'symbol',
    minzoom: 5.5,
    layout: {
      'text-field': ['get', 'code'],
      'text-font': FONT,
      'text-size': 10,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['match', ['get', 'level'], 1, '#1E1A05', 2, '#1F1300', '#FFFFFF'],
    },
  };
  const highlight: LayerProps = {
    id: 'cp-highlight',
    type: 'circle',
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 13, 10, 17],
      'circle-stroke-color': mode === 'light' ? '#2F4B8A' : '#9DB4F0',
      'circle-stroke-width': 3,
    },
  };
  return { circle, label, highlight };
}

export function checkpointCode(level: number): string {
  return RISK_CODE[level as 0 | 1 | 2 | 3 | 4];
}

/** Stops [value, colour]: faint tint for measurable weather, then risk colours at thresholds. */
export function heatStops(layer: HeatLayer, mode: PaletteMode): [number, string][] {
  const c = riskPalette(mode);
  // Sub-threshold tint: visible on both basemaps without muddying the dark one.
  const slate = mode === 'light' ? '120,140,170' : '170,190,220';
  switch (layer) {
    case 'wind':
      return [
        [12, `rgba(${slate},0)`],
        [18, `rgba(${slate},${mode === 'light' ? 0.45 : 0.3})`],
        [25, c[1]],
        [35, c[2]],
        [45, c[3]],
        [55, c[4]],
      ];
    case 'rain':
      return [
        [0.005, 'rgba(70,130,200,0)'],
        [0.03, 'rgba(70,130,200,0.55)'],
        [0.1, c[1]],
        [0.25, c[2]],
        [0.5, c[3]],
        [1.0, c[4]],
      ];
    case 'snow':
      return [
        [0.02, 'rgba(150,200,230,0)'],
        [0.2, 'rgba(150,200,230,0.6)'],
        [0.5, c[1]],
        [1.0, c[2]],
        [2.0, c[3]],
        [3.0, c[4]],
      ];
  }
}

export function heatLayerProps(
  layer: HeatLayer,
  mode: PaletteMode,
  spacingDeg: number,
  midLat: number,
  visible: boolean,
): LayerProps {
  const stops = heatStops(layer, mode).flat();
  // Pixel radius that covers one grid cell at zoom 0 (512 px world), grown 2x per zoom level.
  // Mercator stretches latitude by 1/cos(lat), so size for the taller (north-south) spacing.
  const r0 = ((spacingDeg * 512) / 360) * (1.25 / Math.cos((midLat * Math.PI) / 180));
  return {
    id: 'heat',
    type: 'circle',
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'circle-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'v'], 0],
        ...stops,
      ] as ExpressionSpecification,
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 16, r0 * 2 ** 16],
      'circle-blur': 1,
      'circle-opacity': mode === 'light' ? 0.6 : 0.55,
      'circle-pitch-alignment': 'map',
    },
  };
}
