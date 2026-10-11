import { Box, Paper, Stack, Typography, useTheme } from '@mui/material';
import { RISK_CODE, RISK_LABEL, RISK_LEVELS, riskColor, riskOnColor } from '../theme/risk';

export function Legend({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const mode = theme.palette.mode;
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
    </Paper>
  );
}
