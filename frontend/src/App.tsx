import { Alert, Box, Skeleton, useMediaQuery, useTheme } from '@mui/material';
import { lazy, Suspense, useMemo, useState } from 'react';
import { usePlanTrip } from './api/hooks';
import { Brand } from './components/Brand';
import { PANEL_WIDTH, SHEET_PEEK, SidePanel } from './components/SidePanel';
import { TripForm } from './components/TripForm';
import type { MapPadding } from './map/MapView';
import { toPlanRequest, useTrip } from './state/tripStore';
import { useUi } from './state/uiStore';

const MapView = lazy(() => import('./map/MapView'));

export default function App() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const planMutation = usePlanTrip();
  const plan = planMutation.data;

  function submit() {
    planMutation.mutate(toPlanRequest(useTrip.getState()), {
      onSuccess: (data) => {
        useUi.getState().resetForPlan(data.recommendation.routeId);
        if (mobile) setSheetExpanded(false);
      },
    });
  }

  const padding = useMemo<MapPadding>(
    () =>
      mobile
        ? { top: 16, right: 16, left: 16, bottom: window.innerHeight * SHEET_PEEK }
        : { top: 16, right: 16, left: PANEL_WIDTH + 16, bottom: 96 },
    [mobile],
  );

  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Suspense
        fallback={
          <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, height: '100%' }} />
        }
      >
        <MapView plan={plan} heatmap={undefined} timelineStartMs={0} padding={padding} />
      </Suspense>

      <SidePanel
        header={<Brand />}
        mobile={mobile}
        expanded={sheetExpanded}
        onToggle={() => setSheetExpanded((v) => !v)}
      >
        <TripForm onSubmit={submit} pending={planMutation.isPending} />
        {planMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {planMutation.error.message}
          </Alert>
        )}
      </SidePanel>
    </Box>
  );
}
