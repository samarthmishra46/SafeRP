import AcUnitRounded from '@mui/icons-material/AcUnitRounded';
import AirRounded from '@mui/icons-material/AirRounded';
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
import { useEffect, useMemo } from 'react';
import type { HeatLayer, HeatmapResponse, PlanResponse } from '../api/types';
import { formatHourOffset, formatTime } from '../lib/format';
import { heatStops } from '../map/layers';
import { useUi } from '../state/uiStore';

interface Props {
  heatmap: HeatmapResponse | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  plan: PlanResponse;
  startMs: number;
  compact: boolean;
}

const PLAY_STEP_MS = 700;
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

export function TimelineBar({ heatmap, loading, error, onRetry, plan, startMs, compact }: Props) {
  const hour = useUi((s) => s.heatHour);
  const layer = useUi((s) => s.heatLayer);
  const visible = useUi((s) => s.heatVisible);
  const playing = useUi((s) => s.playing);
  const { setHeatHour, setHeatLayer, setHeatVisible, setPlaying } = useUi.getState();
  const maxHour = heatmap?.hours ?? 48;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = useUi.getState().heatHour + 1;
      if (next > maxHour) {
        setPlaying(false);
      } else {
        setHeatHour(next);
      }
    }, PLAY_STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, maxHour, setHeatHour, setPlaying]);

  const at = startMs + hour * 3_600_000;
  const atDate = useMemo(() => new Date(at), [at]);
  const timeLabel = formatTime(atDate, new Date(startMs));

  // Where are the trucks at this slider time?
  const tripStatus = useMemo(() => {
    const dep = Date.parse(plan.meta.departure);
    const arrivals = plan.routes.map((r) => Date.parse(r.arrival));
    if (at < dep) {
      const h = Math.round((dep - at) / 3_600_000);
      return h >= 1 ? `Departs in ${h} h` : 'Departing';
    }
    if (at > Math.max(...arrivals)) return 'All routes arrived';
    return 'Trucks shown on map';
  }, [plan, at]);

  const togglePlay = () => {
    if (!playing && hour >= maxHour) setHeatHour(0);
    setPlaying(!playing);
  };

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
      <Stack direction="row" sx={{ alignItems: 'center', gap: compact ? 1 : 2 }}>
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

        <Box sx={{ minWidth: compact ? 72 : 96 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="div"
            sx={{ lineHeight: 1.4 }}
          >
            {formatHourOffset(hour)}
          </Typography>
          <Typography variant="mono" component="div" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {timeLabel}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, px: 1, minWidth: 120 }}>
          <Slider
            value={hour}
            min={0}
            max={maxHour}
            step={1}
            marks={compact ? MARKS.filter((m) => m.value % 12 === 0) : MARKS}
            onChange={(_, v) => {
              setPlaying(false);
              setHeatHour(v as number);
            }}
            disabled={!heatmap}
            size="small"
            aria-label="Forecast hour"
            getAriaValueText={(v) =>
              `${formatHourOffset(v)}, ${formatTime(new Date(startMs + v * 3_600_000))}`
            }
            sx={{
              '& .MuiSlider-markLabel': { fontSize: '0.625rem', top: 22 },
              mb: compact ? 1 : 0.5,
            }}
          />
        </Box>

        {!compact && (
          <Typography variant="caption" sx={{ width: 120, textAlign: 'right' }} aria-live="polite">
            {tripStatus}
          </Typography>
        )}
      </Stack>

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1.5,
          mt: 0.5,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
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
