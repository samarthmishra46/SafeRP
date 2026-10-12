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
import { useEffect, useMemo, useState } from 'react';
import type { HeatLayer, HeatmapResponse, PlanResponse } from '../api/types';
import { formatHourOffset, formatSliderTime } from '../lib/format';
import { SLIDER_HOURS, departureHour, sliderTimeMs } from '../lib/timeline';
import { useRafThrottle } from '../lib/useRafThrottle';
import { heatStops } from '../map/layers';
import { useUi, type PlaySpeed } from '../state/uiStore';
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

const LAYER_META: Record<HeatLayer, { label: string; unit: string; ticks: number[] }> = {
  wind: { label: 'Wind', unit: 'mph', ticks: [25, 35, 45, 55] },
  rain: { label: 'Rain', unit: 'in/h', ticks: [0.1, 0.25, 0.5, 1] },
  snow: { label: 'Snow', unit: 'in/h', ticks: [0.5, 1, 2, 3] },
};

function HeatScale({ layer, metric }: { layer: HeatLayer; metric: 'gust' | 'sustained' }) {
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
}

export function TimelineBar({ heatmap, loading, error, onRetry, plan, anchorMs, compact }: Props) {
  const hour = useUi((s) => s.heatHour);
  const layer = useUi((s) => s.heatLayer);
  const visible = useUi((s) => s.heatVisible);
  const playing = useUi((s) => s.playing);
  const speed = useUi((s) => s.playSpeed);
  const selectedRouteId = useUi((s) => s.selectedRouteId);
  const { setHeatHour, setHeatLayer, setHeatVisible, setPlaying, setPlaySpeed } = useUi.getState();
  const maxHour = heatmap?.hours ?? SLIDER_HOURS;
  const route =
    plan.routes.find((r) => r.id === selectedRouteId) ??
    plan.routes.find((r) => r.id === plan.recommendation.routeId)!;

  // While dragging, the thumb follows the pointer immediately but the map (store) updates at
  // most once per animation frame.
  const [dragHour, setDragHour] = useState<number | null>(null);
  const commitHour = useRafThrottle(setHeatHour);
  const shownHour = dragHour ?? hour;

  // Playback: `speed` forecast hours per second; stops at the end of the window.
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

  const at = sliderTimeMs(anchorMs, shownHour);
  const depHour = departureHour(anchorMs, plan.meta.departure, maxHour);

  // Where are the trucks at this slider time?
  const tripStatus = useMemo(() => {
    const dep = Date.parse(plan.meta.departure);
    const arrivals = plan.routes.map((r) => Date.parse(r.arrival));
    if (at < dep) {
      const h = Math.ceil((dep - at) / 3_600_000);
      return `Departs in ${h} h`;
    }
    if (at > Math.max(...arrivals)) return 'All routes arrived';
    return 'Trucks shown on map';
  }, [plan, at]);

  const togglePlay = () => {
    if (!playing && hour >= maxHour) setHeatHour(0);
    setPlaying(!playing);
  };

  const jumpToDeparture = () => {
    if (depHour === null) return;
    setPlaying(false);
    setHeatHour(depHour);
  };

  const speedControl = (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={speed}
      onChange={(_, v: PlaySpeed | null) => v && setPlaySpeed(v)}
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
          onClick={jumpToDeparture}
          disabled={!heatmap || depHour === null}
          startIcon={<LocalShippingOutlined sx={{ fontSize: 16 }} />}
          sx={{ whiteSpace: 'nowrap', minWidth: 0, px: compact ? 1 : 1.5 }}
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
        <Tooltip title={playing ? 'Pause' : 'Play forecast'}>
          <span>
            <IconButton
              onClick={togglePlay}
              disabled={!heatmap}
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
        {!compact && speedControl}

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
          <Typography
            variant="mono"
            component="div"
            sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
            aria-live="off"
          >
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
            marks={compact ? MARKS.filter((m) => m.value % 12 === 0) : MARKS}
            onChange={(_, v) => {
              setPlaying(false);
              setDragHour(v as number);
              commitHour(v as number);
            }}
            onChangeCommitted={(_, v) => {
              setHeatHour(v as number);
              setDragHour(null);
            }}
            disabled={!heatmap}
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
          {compact && speedControl}
          {compact && departureButton}
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
        </Stack>

        {!compact && (
          <Typography variant="caption" sx={{ flex: 1, minWidth: 160, maxWidth: 260 }}>
            Weather explorer only. Route risk uses each checkpoint&apos;s ETA forecast.
          </Typography>
        )}

        {loading && <Skeleton width={150} height={30} aria-label="Loading corridor forecast" />}
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
        {heatmap && !compact && <HeatScale layer={layer} metric={heatmap.windMetric} />}
      </Stack>
    </Paper>
  );
}
