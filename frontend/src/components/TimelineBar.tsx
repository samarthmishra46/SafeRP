import AcUnitRounded from '@mui/icons-material/AcUnitRounded';
import AirRounded from '@mui/icons-material/AirRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Skeleton,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HeatLayer, HeatmapResponse, PlanResponse, Route } from '../api/types';
import { formatHourOffset, formatSliderTime } from '../lib/format';
import { SLIDER_HOURS, departureHour, sliderTimeMs, truckStateAtHour } from '../lib/timeline';
import { useRafThrottle } from '../lib/useRafThrottle';
import { heatStops } from '../map/layers';
import { useUi, type PlaySpeed } from '../state/uiStore';
import { STOP_LABEL } from '../theme/stopIcons';
import { HazardTrack } from './HazardTrack';

interface Props {
  heatmap: HeatmapResponse | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  plan: PlanResponse;
  /** Slider hour 0: the current UTC hour, from the heatmap anchor (epoch ms). */
  anchorMs: number;
  compact: boolean;
}

const SPEEDS: PlaySpeed[] = [1, 2, 4];
const HELP =
  'Explore how the weather develops over the next 48 hours. Route risk colours and the ' +
  'recommendation always use each checkpoint’s forecast at the truck’s ETA; moving the ' +
  'slider never changes them.';
const MARKS = [0, 6, 12, 18, 24, 30, 36, 42, 48].map((value) => ({
  value,
  label: value === 0 ? 'Now' : `${value}h`,
}));
const COMPACT_MARKS = MARKS.filter((m) => m.value % 12 === 0);

const LAYER_META: Record<HeatLayer, { label: string; unit: string; ticks: number[] }> = {
  wind: { label: 'Wind', unit: 'mph', ticks: [25, 35, 45, 55] },
  rain: { label: 'Rain', unit: 'in/h', ticks: [0.1, 0.25, 0.5, 1] },
  snow: { label: 'Snow', unit: 'in/h', ticks: [0.5, 1, 2, 3] },
};

const HeatScale = memo(function HeatScale({
  layer,
  metric,
}: {
  layer: HeatLayer;
  metric: 'gust' | 'sustained';
}) {
  const mode = useTheme().palette.mode;
  const stops = heatStops(layer, mode);
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  const gradient = `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${pos(v)}%`).join(', ')})`;
  const meta = LAYER_META[layer];
  const title = layer === 'wind' ? `Wind ${metric === 'gust' ? 'gusts' : 'speed'}` : meta.label;
  return (
    <Box sx={{ minWidth: 150 }} aria-label={`${title} scale in ${meta.unit}`} role="img">
      <Typography
        variant="overline"
        color="text.secondary"
        component="div"
        sx={{ lineHeight: 1.4 }}
      >
        {title} · {meta.unit}
      </Typography>
      <Box
        sx={{ height: 6, borderRadius: 1, background: gradient, border: 1, borderColor: 'divider' }}
      />
      <Box sx={{ position: 'relative', height: 16, mt: 0.25 }}>
        {meta.ticks.map((t) => (
          <Typography
            key={t}
            variant="mono"
            sx={{
              position: 'absolute',
              left: `${pos(t)}%`,
              transform: 'translateX(-50%)',
              fontSize: '0.625rem',
              color: 'text.secondary',
            }}
          >
            {t}
          </Typography>
        ))}
      </Box>
    </Box>
  );
});

/** Play/pause with its own playback loop (`speed` forecast hours per second, stops at +48 h). */
function PlayButton({ maxHour, disabled }: { maxHour: number; disabled: boolean }) {
  const playing = useUi((s) => s.playing);
  const speed = useUi((s) => s.playSpeed);
  const { setHeatHour, setPlaying } = useUi.getState();

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = useUi.getState().heatHour + 1;
      if (next > maxHour) {
        setPlaying(false);
      } else {
        setHeatHour(next);
      }
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, maxHour, setHeatHour, setPlaying]);

  const toggle = () => {
    if (!playing && useUi.getState().heatHour >= maxHour) setHeatHour(0);
    setPlaying(!playing);
  };

  return (
    <Tooltip title={playing ? 'Pause' : 'Play forecast'}>
      <span>
        <IconButton
          onClick={toggle}
          disabled={disabled}
          aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
          size="small"
        >
          {playing ? <PauseRounded /> : <PlayArrowRounded />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function SpeedControl() {
  const speed = useUi((s) => s.playSpeed);
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={speed}
      onChange={(_, v: PlaySpeed | null) => v && useUi.getState().setPlaySpeed(v)}
      aria-label="Playback speed"
      sx={{
        '& .MuiToggleButton-root': { px: 0.75, py: 0.25, fontFamily: 'inherit', fontSize: 12 },
      }}
    >
      {SPEEDS.map((s) => (
        <ToggleButton key={s} value={s} aria-label={`${s} times speed`}>
          {s}×
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function LayerControls({ compact }: { compact: boolean }) {
  const layer = useUi((s) => s.heatLayer);
  const visible = useUi((s) => s.heatVisible);
  const { setHeatLayer, setHeatVisible } = useUi.getState();
  return (
    <>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={layer}
        onChange={(_, v: HeatLayer | null) => v && setHeatLayer(v)}
        aria-label="Heatmap layer"
      >
        <ToggleButton value="wind" aria-label="Wind">
          <AirRounded sx={{ fontSize: 16, mr: compact ? 0 : 0.5 }} />
          {!compact && 'Wind'}
        </ToggleButton>
        <ToggleButton value="rain" aria-label="Rain">
          <WaterDropOutlined sx={{ fontSize: 16, mr: compact ? 0 : 0.5 }} />
          {!compact && 'Rain'}
        </ToggleButton>
        <ToggleButton value="snow" aria-label="Snow">
          <AcUnitRounded sx={{ fontSize: 16, mr: compact ? 0 : 0.5 }} />
          {!compact && 'Snow'}
        </ToggleButton>
      </ToggleButtonGroup>
      <Tooltip title={visible ? 'Hide heatmap' : 'Show heatmap'}>
        <IconButton
          size="small"
          onClick={() => setHeatVisible(!visible)}
          aria-pressed={visible}
          aria-label="Show weather heatmap"
        >
          {visible ? (
            <VisibilityOutlined fontSize="small" />
          ) : (
            <VisibilityOffOutlined fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </>
  );
}

function LayerScale({ metric }: { metric: 'gust' | 'sustained' }) {
  const layer = useUi((s) => s.heatLayer);
  return <HeatScale layer={layer} metric={metric} />;
}

interface ScrubberProps {
  plan: PlanResponse;
  anchorMs: number;
  maxHour: number;
  disabled: boolean;
  compact: boolean;
  route: Route;
  departureButton: ReactNode;
}

/**
 * The only part of the bar that re-renders on every hour: readout, track and status. While
 * dragging, the thumb follows the pointer immediately but the store (and so the map) updates at
 * most once per animation frame.
 */
function HourScrubber({
  plan,
  anchorMs,
  maxHour,
  disabled,
  compact,
  route,
  departureButton,
}: ScrubberProps) {
  const hour = useUi((s) => s.heatHour);
  const { setHeatHour, setPlaying } = useUi.getState();
  // Local value shown until the frame-throttled commit reaches the store (or the store moves).
  const [dragHour, setDragHour] = useState<number | null>(null);
  const [prevHour, setPrevHour] = useState(hour);
  if (hour !== prevHour) {
    setPrevHour(hour);
    setDragHour(null);
  }
  const commitHour = useRafThrottle(setHeatHour);
  const shownHour = dragHour ?? hour;
  const at = sliderTimeMs(anchorMs, shownHour);

  const tripStatus = useMemo(() => {
    const dep = Date.parse(plan.meta.departure);
    const arrivals = plan.routes.map((r) => Date.parse(r.arrival));
    if (at < dep) return `Departs in ${Math.ceil((dep - at) / 3_600_000)} h`;
    if (at > Math.max(...arrivals)) return 'All routes arrived';
    const resting = truckStateAtHour(route, anchorMs, shownHour)?.resting;
    if (resting) return `${route.name}: ${STOP_LABEL[resting].toLowerCase()}`;
    return 'Trucks shown on map';
  }, [plan, at, route, anchorMs, shownHour]);

  return (
    <>
      <Box sx={{ minWidth: compact ? 74 : 84 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="div"
            sx={{ lineHeight: 1.4 }}
          >
            {formatHourOffset(shownHour)}
          </Typography>
          <Tooltip title={HELP}>
            <InfoOutlined
              tabIndex={0}
              aria-label={HELP}
              sx={{ fontSize: 13, color: 'text.secondary', cursor: 'help' }}
            />
          </Tooltip>
        </Stack>
        <Typography variant="mono" component="div" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {formatSliderTime(new Date(at))}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, px: 1, minWidth: 120 }}>
        <HazardTrack route={route} anchorMs={anchorMs} />
        <Slider
          value={shownHour}
          min={0}
          max={maxHour}
          step={1}
          marks={compact ? COMPACT_MARKS : MARKS}
          onChange={(_, v) => {
            setPlaying(false);
            setDragHour(v as number);
            commitHour(v as number);
          }}
          onChangeCommitted={(_, v) => {
            // Keyboard steps also arrive here; the frame-throttled commit coalesces fast repeats.
            commitHour(v as number);
          }}
          disabled={disabled}
          size="small"
          aria-label="Forecast hour"
          aria-describedby="timeline-help"
          getAriaValueText={(v) =>
            `${formatHourOffset(v)}, ${formatSliderTime(new Date(sliderTimeMs(anchorMs, v)))}`
          }
          sx={{
            '& .MuiSlider-markLabel': { fontSize: '0.625rem', top: 22 },
            mb: compact ? 1 : 0.5,
          }}
        />
        <Box component="span" id="timeline-help" sx={visuallyHidden}>
          {HELP} Arrow keys step one hour; Home and End jump to the ends.
        </Box>
      </Box>

      {!compact && (
        <Stack sx={{ alignItems: 'flex-end', gap: 0.5, width: 132 }}>
          {departureButton}
          <Typography variant="caption" sx={{ textAlign: 'right' }} aria-live="polite">
            {tripStatus}
          </Typography>
        </Stack>
      )}
    </>
  );
}

export function TimelineBar({ heatmap, loading, error, onRetry, plan, anchorMs, compact }: Props) {
  const selectedRouteId = useUi((s) => s.selectedRouteId);
  const maxHour = heatmap?.hours ?? SLIDER_HOURS;
  const route =
    plan.routes.find((r) => r.id === selectedRouteId) ??
    plan.routes.find((r) => r.id === plan.recommendation.routeId)!;
  const depHour = departureHour(anchorMs, plan.meta.departure, maxHour);

  const departureButton = (
    <Tooltip
      title={
        depHour === null
          ? 'Departure is after the 48-hour forecast window'
          : 'Jump to the departure hour'
      }
    >
      <span>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            if (depHour === null) return;
            useUi.getState().setPlaying(false);
            useUi.getState().setHeatHour(depHour);
          }}
          disabled={!heatmap || depHour === null}
          startIcon={<LocalShippingOutlined sx={{ fontSize: 16 }} />}
          sx={{
            whiteSpace: 'nowrap',
            minWidth: 0,
            px: compact ? 1 : 1.5,
            // Readable while disabled (e.g. during loading); the muted border marks it inactive.
            '&.Mui-disabled': { color: 'text.secondary', borderColor: 'divider' },
          }}
        >
          {compact ? 'Dep' : 'Departure'}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Paper
      elevation={4}
      component="section"
      aria-label="Forecast timeline"
      sx={{
        px: compact ? 1.5 : 2,
        py: compact ? 1 : 1.25,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: compact ? 1 : 1.5 }}>
        <PlayButton maxHour={maxHour} disabled={!heatmap} />
        {!compact && <SpeedControl />}
        <HourScrubber
          plan={plan}
          anchorMs={anchorMs}
          maxHour={maxHour}
          disabled={!heatmap}
          compact={compact}
          route={route}
          departureButton={departureButton}
        />
      </Stack>

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: compact ? 1 : 1.5,
          mt: 0.5,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          {compact && <SpeedControl />}
          {compact && departureButton}
          <LayerControls compact={compact} />
        </Stack>

        {!compact && (
          <Typography variant="caption" sx={{ flex: 1, minWidth: 160, maxWidth: 260 }}>
            Weather explorer only. Route risk uses each checkpoint&apos;s ETA forecast.
          </Typography>
        )}

        {loading && (
          <Skeleton width={150} height={30} role="status" aria-label="Loading corridor forecast" />
        )}
        {error && !loading && (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="error">
              Weather layer unavailable
            </Typography>
            <Button size="small" onClick={onRetry}>
              Retry
            </Button>
          </Stack>
        )}
        {heatmap && !compact && <LayerScale metric={heatmap.windMetric} />}
      </Stack>
    </Paper>
  );
}
