import CheckRounded from '@mui/icons-material/CheckRounded';
import { Box, CircularProgress, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useEffect, useState } from 'react';

const STAGES = [
  { label: 'Finding three truck routes', at: 0 },
  { label: 'Placing checkpoints and ETAs', at: 2200 },
  { label: 'Fetching forecasts along each route', at: 3200 },
  { label: 'Scoring risk and ranking routes', at: 6000 },
];

/**
 * The plan is one request, so stages advance on typical timings and the last one waits for
 * the response. It tells the driver what is happening rather than showing a bare spinner.
 */
export function PlanProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - start), 200);
    return () => window.clearInterval(id);
  }, []);
  const active = STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <Box role="status" aria-live="polite" aria-label="Planning trip">
      <LinearProgress
        variant="determinate"
        value={Math.min(92, ((active + 1) / STAGES.length) * 100 - 10 + Math.min(elapsed / 400, 8))}
        sx={{ borderRadius: 1, height: 4, mb: 2 }}
      />
      <Stack component="ol" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, mb: 2.5 }}>
        {STAGES.map((s, i) => (
          <Stack
            component="li"
            key={s.label}
            direction="row"
            sx={{ alignItems: 'center', gap: 1.25, opacity: i > active ? 0.45 : 1 }}
          >
            <Box sx={{ width: 18, display: 'flex', justifyContent: 'center' }} aria-hidden>
              {i < active ? (
                <CheckRounded sx={{ fontSize: 18, color: 'success.main' }} />
              ) : i === active ? (
                <CircularProgress size={14} thickness={5} />
              ) : (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              )}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: i === active ? 600 : 400 }}>
              {s.label}
              {i < active && (
                <Box component="span" sx={visuallyHidden}>
                  {' '}
                  (done)
                </Box>
              )}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <ResultsSkeleton />
    </Box>
  );
}

export function ResultsSkeleton() {
  return (
    <Stack spacing={1.5} aria-hidden>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 2.5, p: 1.75 }}>
          <Skeleton width="40%" height={22} />
          <Skeleton width="70%" height={16} />
          <Skeleton variant="rounded" height={12} sx={{ mt: 1.5 }} />
          <Skeleton width="100%" height={18} sx={{ mt: 1 }} />
        </Box>
      ))}
    </Stack>
  );
}
