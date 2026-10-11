import { Alert, AlertTitle, Button } from '@mui/material';
import type { PlanResponse } from '../api/types';
import { formatDateTime, formatMilesValue } from '../lib/format';

interface NoTravelProps {
  plan: PlanResponse;
  onUseDeparture: (iso: string) => void;
}

export function NoTravelBanner({ plan, onUseDeparture }: NoTravelProps) {
  const rec = plan.recommendation;
  if (!rec.notRecommended) return null;
  const best = plan.routes.find((r) => r.id === rec.routeId)!;
  const s = rec.suggestion;
  const suggestedRoute = s ? plan.routes.find((r) => r.id === s.routeId) : undefined;

  return (
    <Alert
      severity="error"
      variant="filled"
      role="alert"
      action={
        s ? (
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            onClick={() => onUseDeparture(s.departure)}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Use {s.shiftHours} h later
          </Button>
        ) : undefined
      }
      sx={{ '& .MuiAlert-action': { alignSelf: 'center' } }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>Not recommended at this departure time</AlertTitle>
      Even the best option, {best.name}, crosses No Travel conditions for{' '}
      {formatMilesValue(best.summary.miles.noTravel)} mi.{' '}
      {s
        ? `Leaving at ${formatDateTime(s.departure)} (+${s.shiftHours} h) clears them on ${suggestedRoute?.name ?? 'the best route'}.`
        : 'No departure in the next 12 hours avoids them; consider postponing the trip.'}
    </Alert>
  );
}

export function Notices({ notices }: { notices: string[] }) {
  return (
    <>
      {notices.map((n) => (
        <Alert key={n} severity="info" variant="outlined">
          {n}
        </Alert>
      ))}
    </>
  );
}
