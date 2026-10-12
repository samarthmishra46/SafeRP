import { useTheme } from '@mui/material';
import { useEffect, useRef } from 'react';
import type { HazardLevel, HazardType } from '../lib/hazards';
import { drawHazard } from '../map/weatherAnimation';

/** Static frame of a map weather icon, drawn by the same code as the animated version. */
export function WeatherGlyph({
  type,
  level = 2,
  size = 22,
}: {
  type: HazardType;
  level?: HazardLevel;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useTheme().palette.mode;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d'); // null in test environments without canvas support
    if (!canvas || !ctx) return;
    const ratio = 2;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    drawHazard(ctx, type, level, mode, 0.15, size * ratio);
  }, [type, level, mode, size]);
  return <canvas ref={ref} aria-hidden style={{ width: size, height: size, flexShrink: 0 }} />;
}
