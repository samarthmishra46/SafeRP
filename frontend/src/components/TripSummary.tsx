import EditOutlined from '@mui/icons-material/EditOutlined';
import { Box, Button, Typography } from '@mui/material';
import type { PlanResponse } from '../api/types';
import { formatDateTime, formatInterval, formatWeight } from '../lib/format';
import { useUnits } from '../state/tripStore';
import { useTrip } from '../state/tripStore';

export function TripSummary({ plan, onEdit }: { plan: PlanResponse; onEdit: () => void }) {
  const units = useUnits();
  const origin = useTrip((s) => s.origin);
  const destination = useTrip((s) => s.destination);
  const short = (label?: string) => label?.split(',')[0] ?? '—';
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'surface.sunken',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" component="p" noWrap>
          {short(origin?.label)} → {short(destination?.label)}
        </Typography>
        <Typography variant="caption" component="p">
          {formatDateTime(plan.meta.departure)} · {formatWeight(plan.meta.weightLb, units)} ·{' '}
          {formatInterval(plan.meta.intervalMi, units)} checkpoints
          {plan.meta.restPlan && ' · rest stops planned'}
        </Typography>
      </Box>
      <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={onEdit}>
        Edit
      </Button>
    </Box>
  );
}
