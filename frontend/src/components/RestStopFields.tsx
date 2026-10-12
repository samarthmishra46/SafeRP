import BedtimeOutlined from '@mui/icons-material/BedtimeOutlined';
import LocalCafeOutlined from '@mui/icons-material/LocalCafeOutlined';
import {
  Box,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { REST_PRESETS, useTrip, type RestField, type TripErrors } from '../state/tripStore';

function NumberField({
  field,
  label,
  unit,
  errors,
  disabled,
}: {
  field: RestField;
  label: string;
  unit: string;
  errors: TripErrors;
  disabled: boolean;
}) {
  const value = useTrip((s) => s.rest[field]);
  const setRest = useTrip((s) => s.setRest);
  return (
    <TextField
      label={label}
      size="small"
      value={value}
      disabled={disabled}
      onChange={(e) => setRest({ [field]: e.target.value })}
      error={!disabled && Boolean(errors[field])}
      helperText={!disabled ? errors[field] : undefined}
      slotProps={{
        htmlInput: { inputMode: 'decimal' },
        input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> },
      }}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
}

function Part({
  icon,
  title,
  on,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Box>
      <FormControlLabel
        control={<Switch size="small" checked={on} onChange={(e) => onToggle(e.target.checked)} />}
        label={
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            {icon}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
          </Stack>
        }
        sx={{ ml: 0, mb: 1 }}
      />
      <Stack direction="row" sx={{ gap: 1, opacity: on ? 1 : 0.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

/**
 * Optional rest stops. Ticking the box reveals the settings; every part can be switched on or
 * off and every value edited. Presets only fill in typical values; nothing is enforced.
 */
export function RestStopFields({ errors }: { errors: TripErrors }) {
  const rest = useTrip((s) => s.rest);
  const setRest = useTrip((s) => s.setRest);
  const applyPreset = useTrip((s) => s.applyRestPreset);
  const iconSx = { fontSize: 18, color: 'text.secondary' };

  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={rest.enabled}
            onChange={(e) => setRest({ enabled: e.target.checked })}
          />
        }
        label={<Typography variant="body2">Plan rest stops (optional)</Typography>}
        sx={{ ml: -0.5 }}
      />
      <Collapse in={rest.enabled} unmountOnExit>
        <Stack
          spacing={2}
          sx={{ mt: 1, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}
          role="group"
          aria-label="Rest stop settings"
        >
          <Box>
            <Typography variant="caption" component="div" sx={{ mb: 0.75 }}>
              Quick fill with typical limits, then adjust anything:
            </Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {REST_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  size="small"
                  variant="outlined"
                  label={p.label}
                  onClick={() => applyPreset(p)}
                />
              ))}
            </Stack>
          </Box>

          <Part
            icon={<LocalCafeOutlined sx={iconSx} aria-hidden />}
            title="Short breaks"
            on={rest.breaksOn}
            onToggle={(breaksOn) => setRest({ breaksOn })}
          >
            <NumberField
              field="breakEveryH"
              label="Every"
              unit="h driving"
              errors={errors}
              disabled={!rest.breaksOn}
            />
            <NumberField
              field="breakMin"
              label="Lasting"
              unit="min"
              errors={errors}
              disabled={!rest.breaksOn}
            />
          </Part>

          <Part
            icon={<BedtimeOutlined sx={iconSx} aria-hidden />}
            title="Overnight rest"
            on={rest.overnightOn}
            onToggle={(overnightOn) => setRest({ overnightOn })}
          >
            <NumberField
              field="overnightAfterH"
              label="After"
              unit="h driving"
              errors={errors}
              disabled={!rest.overnightOn}
            />
            <NumberField
              field="overnightH"
              label="Rest for"
              unit="h"
              errors={errors}
              disabled={!rest.overnightOn}
            />
          </Part>

          <Typography variant="caption" component="p">
            Stops shift every later ETA, so they change the forecast each checkpoint is scored on.
          </Typography>
        </Stack>
      </Collapse>
    </Box>
  );
}
