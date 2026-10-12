import AcUnitRounded from '@mui/icons-material/AcUnitRounded';
import AirRounded from '@mui/icons-material/AirRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ThermostatRounded from '@mui/icons-material/ThermostatRounded';
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined';
import { Box, Divider, IconButton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { Checkpoint } from '../api/types';
import { RiskBadge } from '../components/RiskBadge';
import {
  formatCompass,
  formatDateTime,
  formatMilepost,
  formatRain,
  formatSnow,
  formatTemperature,
  formatWind,
  joinFactors,
} from '../lib/format';
import { useUnits } from '../state/tripStore';

interface Props {
  checkpoint: Checkpoint;
  routeName: string;
  windMetric: 'gust' | 'sustained';
  pinned: boolean;
  onClose: () => void;
}

function Row({
  icon,
  label,
  value,
  emphasis,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 1 }}
    >
      <Box sx={{ display: 'flex', color: 'text.secondary' }} aria-hidden>
        {icon}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="mono" sx={{ fontWeight: emphasis ? 600 : 400 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function CheckpointPopup({ checkpoint: c, routeName, windMetric, pinned, onClose }: Props) {
  const units = useUnits();
  const w = c.weather;
  const iconSx = { fontSize: 16 };
  const driverText =
    c.level === 0
      ? 'All factors below Moderate thresholds.'
      : `Driven by ${joinFactors(c.drivers).toLowerCase()}.`;
  return (
    <Box sx={{ p: 1.5, width: 260 }} role="dialog" aria-label={`Checkpoint ${c.index} details`}>
      <Stack
        direction="row"
        sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" component="div">
            {routeName} · {formatMilepost(c.distanceMi, units)}
          </Typography>
          <Typography variant="subtitle2" component="p">
            ETA {formatDateTime(c.eta)}
          </Typography>
        </Box>
        {pinned && (
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close checkpoint details"
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        )}
      </Stack>
      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <RiskBadge level={c.level} size="medium" />
      </Box>
      <Typography variant="caption" component="p" sx={{ mt: 0.75, mb: 1.25 }}>
        {driverText}
        {c.loadRule && ` ${c.loadRule}.`}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      <Stack spacing={0.5}>
        <Row
          icon={<AirRounded sx={iconSx} />}
          label={`Wind ${formatCompass(w.windDirectionDeg)}`.trim()}
          value={formatWind(w.windSpeedMph, units)}
          emphasis={windMetric === 'sustained'}
        />
        <Row
          icon={<AirRounded sx={iconSx} />}
          label="Gusts"
          value={formatWind(w.windGustMph, units)}
          emphasis={windMetric === 'gust'}
        />
        <Row
          icon={<WaterDropOutlined sx={iconSx} />}
          label="Rain"
          value={formatRain(w.rainIn, units)}
        />
        <Row
          icon={<AcUnitRounded sx={iconSx} />}
          label="Snow"
          value={formatSnow(w.snowIn, units)}
        />
        <Row
          icon={<ThermostatRounded sx={iconSx} />}
          label="Temperature"
          value={formatTemperature(w.temperatureC, units)}
        />
      </Stack>
      <Typography variant="caption" component="p" sx={{ mt: 1 }}>
        Risk uses {windMetric === 'gust' ? 'gusts' : 'sustained wind'} (bold).
        {c.missing.length > 0 && ` Missing forecast: ${joinFactors(c.missing).toLowerCase()}.`}
      </Typography>
    </Box>
  );
}
