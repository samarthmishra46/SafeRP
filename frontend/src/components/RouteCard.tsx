import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import { alpha, Box, ButtonBase, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { memo } from 'react';
import type { RiskLevel, Route } from '../api/types';
import { formatDuration, formatMiles, formatMilesValue, formatTime } from '../lib/format';
import { MILES_KEY, RISK_LABEL, RISK_LEVELS } from '../theme/risk';
import { RiskBadge, RiskSwatch } from './RiskBadge';
import { RiskStrip } from './RiskStrip';

interface Props {
  route: Route;
  recommended: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}

const LEVELS_DESC = [...RISK_LEVELS].reverse() as RiskLevel[];

export const RouteCard = memo(function RouteCard({
  route,
  recommended,
  selected,
  onSelect,
}: Props) {
  const { miles, maxLevel } = route.summary;
  const label = `${route.name}${recommended ? ', recommended' : ''}. ${formatMiles(route.distanceMi)}, ${formatDuration(route.durationS)}, worst risk ${RISK_LABEL[maxLevel]}.`;

  return (
    <Paper
      data-testid="route-card"
      variant="outlined"
      sx={(t) => ({
        p: 1.75,
        borderRadius: 2.5,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? 'primary.main' : 'divider',
        m: selected ? 0 : '1px',
        bgcolor: selected
          ? alpha(t.palette.primary.main, t.palette.mode === 'light' ? 0.03 : 0.06)
          : 'background.paper',
        transition: t.transitions.create(['border-color', 'background-color'], { duration: 150 }),
      })}
    >
      <ButtonBase
        onClick={() => onSelect(route.id)}
        aria-pressed={selected}
        aria-label={label}
        sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 1.5, mb: 1.5 }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.25 }}>
          <Typography variant="subtitle1" component="h3">
            {route.name}
          </Typography>
          {recommended && (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.75,
                borderRadius: 1,
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.02em',
                lineHeight: '20px',
                color: 'primary.contrastText',
                bgcolor: 'primary.main',
              }}
            >
              <VerifiedRounded sx={{ fontSize: 13 }} aria-hidden />
              Recommended
            </Box>
          )}
          <Box sx={{ flex: 1 }} />
          <RiskBadge level={maxLevel} variant="soft" label={`Worst: ${RISK_LABEL[maxLevel]}`} />
        </Stack>
        {route.via && (
          <Typography variant="caption" component="p" noWrap title={route.via}>
            via {route.via}
          </Typography>
        )}
        <Stack direction="row" sx={{ mt: 1, gap: 2, flexWrap: 'wrap' }}>
          <Stat label="Distance" value={formatMiles(route.distanceMi)} />
          <Stat label="Drive time" value={formatDuration(route.durationS)} />
          <Stat label="Arrives" value={formatTime(route.arrival, new Date(route.departure))} />
        </Stack>
      </ButtonBase>

      <RiskStrip route={route} />

      <Stack
        direction="row"
        component="ul"
        aria-label={`Miles by risk level on ${route.name}`}
        sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, justifyContent: 'space-between' }}
      >
        {LEVELS_DESC.map((level) => {
          const value = miles[MILES_KEY[level]];
          return (
            <Tooltip key={level} title={`${RISK_LABEL[level]} miles`}>
              <Box
                component="li"
                aria-label={`${RISK_LABEL[level]}: ${formatMilesValue(value)} miles`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  opacity: value > 0 ? 1 : 0.45,
                }}
              >
                <RiskSwatch level={level} />
                <Typography variant="mono" sx={{ fontSize: '0.75rem' }}>
                  {formatMilesValue(value)}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Paper>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        component="div"
        sx={{ lineHeight: 1.4 }}
      >
        {label}
      </Typography>
      <Typography variant="mono" component="div" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
        {value}
      </Typography>
    </Box>
  );
}
