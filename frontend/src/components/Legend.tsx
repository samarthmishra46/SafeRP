import { Box, Paper, Stack, Typography, useTheme } from '@mui/material';
import type { HazardType } from '../lib/hazards';
import { useUi } from '../state/uiStore';
import { RISK_CODE, RISK_LABEL, RISK_LEVELS, riskColor, riskOnColor } from '../theme/risk';
import { STOP_ICON, STOP_LABEL } from '../theme/stopIcons';
import { WeatherGlyph } from './WeatherGlyph';

const WEATHER: { type: HazardType; label: string }[] = [
  { type: 'rain', label: 'Rain' },
  { type: 'snow', label: 'Snow' },
  { type: 'wind', label: 'Wind (points downwind)' },
];

export function Legend({
  compact = false,
  showStops = false,
}: {
  compact?: boolean;
  showStops?: boolean;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const animationsEnabled = useUi((s) => s.animationsEnabled);
  return (
    <Paper
      elevation={3}
      component="section"
      aria-label="Risk legend"
      sx={{ px: 1.5, py: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}
    >
      {!compact && (
        <Typography
          variant="overline"
          color="text.secondary"
          component="h2"
          sx={{ display: 'block', mb: 0.5 }}
        >
          Checkpoint risk
        </Typography>
      )}
      <Stack
        component="ul"
        direction={compact ? 'row' : 'column'}
        sx={{ listStyle: 'none', m: 0, p: 0, gap: compact ? 1.25 : 0.5, flexWrap: 'wrap' }}
      >
        {RISK_LEVELS.map((level) => (
          <Stack
            component="li"
            key={level}
            direction="row"
            sx={{ alignItems: 'center', gap: 0.75 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: riskColor(level, mode),
                color: riskOnColor(level),
                fontSize: 9,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                border: '1.5px solid',
                borderColor: 'background.paper',
                boxShadow: 1,
              }}
            >
              {RISK_CODE[level]}
            </Box>
            <Typography variant="caption" sx={{ color: 'text.primary' }}>
              {RISK_LABEL[level]}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {!compact && (
        <Typography variant="caption" component="p" sx={{ mt: 0.75, maxWidth: 150 }}>
          Dashed white line marks No Travel stretches.
        </Typography>
      )}
      {showStops && (
        <Box component="section" aria-label="Rest stop legend" sx={{ mt: compact ? 0.5 : 1 }}>
          {!compact && (
            <Typography
              variant="overline"
              color="text.secondary"
              component="h2"
              sx={{ display: 'block', mb: 0.5 }}
            >
              Rest stops
            </Typography>
          )}
          <Stack
            component="ul"
            direction={compact ? 'row' : 'column'}
            sx={{ listStyle: 'none', m: 0, p: 0, gap: compact ? 1.25 : 0.5 }}
          >
            {(['break', 'overnight'] as const).map((kind) => {
              const Icon = STOP_ICON[kind];
              return (
                <Stack
                  component="li"
                  key={kind}
                  direction="row"
                  sx={{ alignItems: 'center', gap: 0.75 }}
                >
                  <Icon sx={{ fontSize: 16, color: 'text.primary' }} aria-hidden />
                  <Typography variant="caption" sx={{ color: 'text.primary' }}>
                    {STOP_LABEL[kind]}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}
      {animationsEnabled && (
        <Box
          component="section"
          aria-label="Weather animation legend"
          sx={{ mt: compact ? 0.5 : 1 }}
        >
          {!compact && (
            <Typography
              variant="overline"
              color="text.secondary"
              component="h2"
              sx={{ display: 'block', mb: 0.5 }}
            >
              Weather at slider time
            </Typography>
          )}
          <Stack
            component="ul"
            direction={compact ? 'row' : 'column'}
            sx={{ listStyle: 'none', m: 0, p: 0, gap: compact ? 1.25 : 0.5, flexWrap: 'wrap' }}
          >
            {WEATHER.map((w) => (
              <Stack
                component="li"
                key={w.type}
                direction="row"
                sx={{ alignItems: 'center', gap: 0.75 }}
              >
                <WeatherGlyph type={w.type} size={compact ? 16 : 20} />
                <Typography variant="caption" sx={{ color: 'text.primary' }}>
                  {compact ? w.type[0].toUpperCase() + w.type.slice(1) : w.label}
                </Typography>
              </Stack>
            ))}
          </Stack>
          {!compact && (
            <Typography variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 150 }}>
              Shown from Moderate up; larger and denser at higher risk, in the risk colour.
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}
