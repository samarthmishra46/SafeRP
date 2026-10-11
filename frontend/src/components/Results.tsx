import TipsAndUpdatesOutlined from '@mui/icons-material/TipsAndUpdatesOutlined';
import { Box, Divider, Stack, Typography } from '@mui/material';
import type { PlanResponse } from '../api/types';
import { useUi } from '../state/uiStore';
import { NoTravelBanner, Notices } from './Banners';
import { RouteCard } from './RouteCard';
import { WhyThisRoute } from './WhyThisRoute';

interface Props {
  plan: PlanResponse;
  onUseDeparture: (iso: string) => void;
}

export function Results({ plan, onUseDeparture }: Props) {
  const selectedRouteId = useUi((s) => s.selectedRouteId);
  const selectRoute = useUi((s) => s.selectRoute);
  const rec = plan.recommendation;
  const best = plan.routes.find((r) => r.id === rec.routeId)!;
  const ordered = [...plan.routes].sort((a, b) => a.rank - b.rank);

  return (
    <Stack spacing={2} component="section" aria-label="Route options">
      <NoTravelBanner plan={plan} onUseDeparture={onUseDeparture} />
      <Notices notices={plan.notices} />

      <Box
        sx={{
          display: 'flex',
          gap: 1.25,
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'surface.sunken',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <TipsAndUpdatesOutlined
          sx={{ fontSize: 20, color: 'primary.main', mt: 0.25 }}
          aria-hidden
        />
        <Box>
          <Typography variant="subtitle2" component="h2">
            {rec.notRecommended ? `${best.name} is the least risky option` : `Take ${best.name}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {rec.reason}
          </Typography>
        </Box>
      </Box>

      <Stack spacing={1.25}>
        {ordered.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            recommended={route.id === rec.routeId}
            selected={route.id === (selectedRouteId ?? rec.routeId)}
            onSelect={selectRoute}
          />
        ))}
      </Stack>

      <Divider />
      <WhyThisRoute recommendation={rec} routes={plan.routes} />
      <Typography variant="caption" component="p">
        Risk uses wind {plan.meta.windMetric === 'gust' ? 'gusts' : 'sustained speed'}, rain and
        snow at each checkpoint&apos;s ETA. Forecast data: Open-Meteo. Routing: Mapbox.
      </Typography>
    </Stack>
  );
}
