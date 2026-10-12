import { Box, Typography, useTheme } from '@mui/material';
import { memo, useMemo } from 'react';
import type { RiskLevel, Route } from '../api/types';
import { formatSliderTime } from '../lib/format';
import { HOUR_MS, hourlyWorstLevels, trackFraction } from '../lib/timeline';
import { RISK_LABEL, riskColor } from '../theme/risk';
import { MONO } from '../theme/theme';

interface Props {
  route: Route;
  anchorMs: number;
}

function describe(levels: (RiskLevel | null)[], route: Route): string {
  const driving = levels.filter((l) => l !== null) as RiskLevel[];
  if (driving.length === 0) return `${route.name} is not on the road during the next 48 hours.`;
  const worst = Math.max(...driving) as RiskLevel;
  if (worst === 0) return `${route.name}: Low risk for every hour on the road.`;
  const first = levels.findIndex((l) => l === worst);
  return `${route.name}: worst risk ${RISK_LABEL[worst]}, first at +${first} h.`;
}

/**
 * Thin bar aligned with the slider track: each hour coloured by the worst risk the truck on the
 * selected route meets during that hour (ETA forecast), plus departure and arrival markers.
 */
export const HazardTrack = memo(function HazardTrack({ route, anchorMs }: Props) {
  const mode = useTheme().palette.mode;
  const levels = useMemo(() => hourlyWorstLevels(route, anchorMs), [route, anchorMs]);
  const markers = [
    { key: 'dep', label: 'Dep', time: Date.parse(route.departure), name: 'Departure' },
    { key: 'arr', label: 'Arr', time: Date.parse(route.arrival), name: 'Arrival' },
  ]
    .map((m) => ({ ...m, f: trackFraction(anchorMs, m.time) }))
    .filter((m) => m.f >= 0 && m.f <= 1);

  return (
    <Box sx={{ position: 'relative', height: 18, mb: -0.75 }}>
      <Box
        role="img"
        aria-label={`Hazard timeline. ${describe(levels, route)}`}
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          display: 'flex',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'divider',
        }}
      >
        {levels.map((level, h) => (
          <Box
            key={h}
            title={
              level === null
                ? undefined
                : `${formatSliderTime(new Date(anchorMs + h * HOUR_MS))}: ${RISK_LABEL[level]}`
            }
            sx={{
              flex: 1,
              bgcolor: level === null ? 'transparent' : riskColor(level, mode),
              opacity: level === 0 ? 0.55 : 1,
            }}
          />
        ))}
      </Box>
      {markers.map((m) => (
        <Box
          key={m.key}
          role="img"
          aria-label={`${m.name} ${formatSliderTime(new Date(m.time))}`}
          sx={{
            position: 'absolute',
            left: `${m.f * 100}%`,
            bottom: -3,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography
            component="span"
            sx={{ fontFamily: MONO, fontSize: 9, lineHeight: 1, color: 'text.secondary', mb: 0.25 }}
          >
            {m.label}
          </Typography>
          <Box sx={{ width: 2, height: 9, borderRadius: 1, bgcolor: 'text.primary' }} />
        </Box>
      ))}
    </Box>
  );
});
