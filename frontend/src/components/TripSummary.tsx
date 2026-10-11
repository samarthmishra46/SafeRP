import EditOutlined from '@mui/icons-material/EditOutlined';
import { Box, Button, Typography } from '@mui/material';
import type { PlanResponse } from '../api/types';
import { formatDateTime, formatWeight } from '../lib/format';
import { useTrip } from '../state/tripStore';

export function TripSummary({ plan, onEdit }: { plan: PlanResponse; onEdit: () => void }) {
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
          {formatDateTime(plan.meta.departure)} · {formatWeight(plan.meta.weightLb)} ·{' '}
          {plan.meta.intervalMi}-mi checkpoints
        </Typography>
      </Box>
      <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={onEdit}>
        Edit
      </Button>
    </Box>
  );
}
