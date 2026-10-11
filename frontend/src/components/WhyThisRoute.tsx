import CheckRounded from '@mui/icons-material/CheckRounded';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { Recommendation, Route } from '../api/types';
import { formatDuration, formatMilesValue } from '../lib/format';
import { MONO } from '../theme/theme';

interface Props {
  recommendation: Recommendation;
  routes: Route[];
}

const COLUMNS = [
  { key: 'noTravelMi', label: 'No Travel', format: (v: number) => `${formatMilesValue(v)}` },
  { key: 'severeMi', label: 'Severe', format: (v: number) => `${formatMilesValue(v)}` },
  { key: 'highMi', label: 'High', format: (v: number) => `${formatMilesValue(v)}` },
  { key: 'avgRisk', label: 'Avg risk', format: (v: number) => v.toFixed(2) },
  { key: 'durationMin', label: 'Time', format: (v: number) => formatDuration(v * 60) },
] as const;

/** The ranking keys in priority order, with the column that decided the winner highlighted. */
export function WhyThisRoute({ recommendation, routes }: Props) {
  const rows = recommendation.ranking;
  const names = Object.fromEntries(routes.map((r) => [r.id, r.name]));
  const decisive =
    rows.length > 1 ? COLUMNS.findIndex((c) => rows[0][c.key] !== rows[1][c.key]) : -1;

  return (
    <Box component="section" aria-labelledby="why-heading">
      <Typography id="why-heading" variant="subtitle2" component="h2" sx={{ mb: 0.5 }}>
        Why this route
      </Typography>
      <Typography variant="caption" component="p" sx={{ mb: 1 }}>
        Routes are ranked left to right: fewest No Travel miles, then Severe, then High, then lowest
        average risk, then shortest time.
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Route ranking comparison">
          <TableHead>
            <TableRow>
              <TableCell>Route</TableCell>
              {COLUMNS.map((c, i) => (
                <TableCell
                  key={c.key}
                  align="right"
                  sx={i === decisive ? { color: 'primary.main', fontWeight: 700 } : undefined}
                  aria-sort="none"
                >
                  {c.label}
                  {i < 3 && (
                    <Box
                      component="span"
                      sx={{ display: 'block', fontWeight: 400, fontSize: '0.6875rem' }}
                    >
                      mi
                    </Box>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const best = row.routeId === recommendation.routeId;
              return (
                <TableRow key={row.routeId} selected={best}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ whiteSpace: 'nowrap', fontWeight: best ? 600 : 400 }}
                  >
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                      {best ? (
                        <CheckRounded
                          sx={{ fontSize: 14, color: 'primary.main' }}
                          aria-label="Recommended"
                        />
                      ) : (
                        <Box component="span" sx={{ width: 14 }} />
                      )}
                      {names[row.routeId] ?? row.routeId}
                    </Box>
                  </TableCell>
                  {COLUMNS.map((c, i) => (
                    <TableCell
                      key={c.key}
                      align="right"
                      sx={{
                        fontFamily: MONO,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        fontWeight: i === decisive ? 700 : 400,
                      }}
                    >
                      {c.format(row[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
