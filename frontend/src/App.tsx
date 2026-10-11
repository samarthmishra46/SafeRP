import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Skeleton,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import dayjs from 'dayjs';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { ApiError } from './api/client';
import { useHeatmap, usePlanTrip } from './api/hooks';
import { Brand } from './components/Brand';
import { EmptyState } from './components/EmptyState';
import { Legend } from './components/Legend';
import { PlanProgress } from './components/PlanProgress';
import { Results } from './components/Results';
import { PANEL_WIDTH, SHEET_PEEK, SidePanel } from './components/SidePanel';
import { TimelineBar } from './components/TimelineBar';
import { TripForm } from './components/TripForm';
import { TripSummary } from './components/TripSummary';
import type { MapPadding } from './map/MapView';
import { toPlanRequest, useTrip } from './state/tripStore';
import { useUi } from './state/uiStore';

const MapView = lazy(() => import('./map/MapView'));

function errorTitle(error: Error): string {
  if (!(error instanceof ApiError)) return 'Something went wrong';
  if (error.code === 'network') return 'Can’t reach the server';
  if (error.status === 502) return 'A data provider is unavailable';
  if (error.status === 429) return 'Too many requests';
  if (error.status === 422) return 'This trip can’t be planned';
  if (error.status === 400) return 'Check the trip details';
  return 'Something went wrong';
}

export default function App() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [editing, setEditing] = useState(true);
  const planMutation = usePlanTrip();
  const plan = planMutation.data;
  const heatQuery = useHeatmap(plan?.meta.bbox);
  const heatmap = heatQuery.data;
  // Slider hour 0 is "now": the moment the forecast grid loaded, kept inside its anchor hour.
  const timelineStartMs = useMemo(() => {
    if (!heatmap) return 0;
    const anchor = Date.parse(heatmap.anchor);
    return Math.min(Math.max(heatQuery.dataUpdatedAt, anchor), anchor + 3_599_000);
  }, [heatmap, heatQuery.dataUpdatedAt]);

  const submit = useCallback(() => {
    planMutation.mutate(toPlanRequest(useTrip.getState()), {
      onSuccess: (data) => {
        useUi.getState().resetForPlan(data.recommendation.routeId);
        setEditing(false);
        if (mobile) setSheetExpanded(false);
      },
    });
  }, [planMutation, mobile]);

  const useDeparture = useCallback(
    (iso: string) => {
      useTrip.getState().setDeparture(dayjs(iso));
      submit();
    },
    [submit],
  );

  const padding = useMemo<MapPadding>(
    () =>
      mobile
        ? { top: 56, right: 16, left: 16, bottom: window.innerHeight * SHEET_PEEK }
        : { top: 16, right: 200, left: PANEL_WIDTH + 16, bottom: 140 },
    [mobile],
  );

  let body;
  if (planMutation.isPending) {
    body = <PlanProgress />;
  } else if (planMutation.isError) {
    body = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={submit}>
            Retry
          </Button>
        }
      >
        <AlertTitle>{errorTitle(planMutation.error)}</AlertTitle>
        {planMutation.error.message}
      </Alert>
    );
  } else if (plan) {
    body = <Results plan={plan} onUseDeparture={useDeparture} />;
  } else {
    body = <EmptyState />;
  }

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
        <MapView
          plan={plan}
          heatmap={heatmap}
          timelineStartMs={timelineStartMs}
          padding={padding}
        />
      </Suspense>

      {plan && (
        <Box
          sx={
            mobile
              ? { position: 'absolute', top: 8, left: 8, right: 56, zIndex: 1 }
              : { position: 'absolute', right: 16, top: 96, zIndex: 1 }
          }
        >
          <Legend compact={mobile} />
        </Box>
      )}

      {plan && !(mobile && sheetExpanded) && (
        <Box
          sx={
            mobile
              ? {
                  position: 'absolute',
                  left: 8,
                  right: 8,
                  bottom: `calc(${SHEET_PEEK * 100}dvh + 8px)`,
                  zIndex: 1,
                }
              : {
                  position: 'absolute',
                  left: PANEL_WIDTH + 32,
                  right: 16,
                  bottom: 32, // clears the map attribution
                  zIndex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                }
          }
        >
          <Box sx={{ width: '100%', maxWidth: 880 }}>
            <TimelineBar
              plan={plan}
              heatmap={heatmap}
              loading={heatQuery.isFetching}
              error={heatQuery.error}
              onRetry={() => heatQuery.refetch()}
              startMs={timelineStartMs}
              compact={mobile}
            />
          </Box>
        </Box>
      )}

      <SidePanel
        header={<Brand />}
        mobile={mobile}
        expanded={sheetExpanded}
        onToggle={() => setSheetExpanded((v) => !v)}
      >
        <Stack spacing={2}>
          {plan && !editing && !planMutation.isPending ? (
            <TripSummary plan={plan} onEdit={() => setEditing(true)} />
          ) : (
            <TripForm onSubmit={submit} pending={planMutation.isPending} />
          )}
          {body}
        </Stack>
      </SidePanel>
    </Box>
  );
}
