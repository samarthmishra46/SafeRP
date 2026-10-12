import { Box, Typography, useTheme } from '@mui/material';
import { memo, useMemo } from 'react';
import type { RiskLevel, Route } from '../api/types';
import { formatSliderTime } from '../lib/format';
import { HOUR_MS, hourlyWorstLevels, trackFraction, type HourCell } from '../lib/timeline';
import { RISK_LABEL, riskColor } from '../theme/risk';
import { MONO } from '../theme/theme';

interface Props {
  route: Route;
  anchorMs: number;
}

function describe(levels: HourCell[], route: Route): string {
  const driving = levels.filter((l): l is RiskLevel => l !== null && l !== 'rest');
  const rests = levels.filter((l) => l === 'rest').length;
  const restNote = rests ? ` Resting for ${rests} h.` : '';
  if (driving.length === 0)
    return `${route.name} is not on the road during the next 48 hours.${restNote}`;
  const worst = Math.max(...driving) as RiskLevel;
  if (worst === 0) return `${route.name}: Low risk for every hour on the road.${restNote}`;
  const first = levels.findIndex((l) => l === worst);
  return `${route.name}: worst risk ${RISK_LABEL[worst]}, first at +${first} h.${restNote}`;
}

function cellTitle(level: HourCell, at: number): string | undefined {
  if (level === null) return undefined;
  const when = formatSliderTime(new Date(at));
  return level === 'rest' ? `${when}: resting` : `${when}: ${RISK_LABEL[level]}`;
}

/**
 * Thin bar aligned with the slider track: each hour coloured by the worst risk the truck on the
 * selected route meets during that hour (ETA forecast), plus departure and arrival markers.
 */
export const HazardTrack = memo(function HazardTrack({ route, anchorMs }: Props) {
  const theme = useTheme();
  const mode = theme.palette.mode;
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
            title={cellTitle(level, anchorMs + h * HOUR_MS)}
            sx={{
              flex: 1,
              bgcolor:
                level === null
                  ? 'transparent'
                  : level === 'rest'
                    ? undefined
                    : riskColor(level, mode),
              // Rest hours are hatched: parked, not exposed to road risk.
              backgroundImage:
                level === 'rest'
                  ? `repeating-linear-gradient(135deg, ${theme.palette.text.secondary} 0 1.5px, transparent 1.5px 4px)`
                  : undefined,
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
