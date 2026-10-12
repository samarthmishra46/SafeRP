import SwapVertRounded from '@mui/icons-material/SwapVertRounded';
import TripOriginRounded from '@mui/icons-material/TripOriginRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormHelperText,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { useState, type FormEvent } from 'react';
import {
  DEPARTURE_SLACK_MIN,
  FORECAST_DAYS,
  WEIGHT_PRESETS,
  parseWeight,
  useTrip,
  validateTrip,
  type Interval,
} from '../state/tripStore';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { RestStopFields } from './RestStopFields';

interface Props {
  onSubmit: () => void;
  pending: boolean;
}

const intFmt = new Intl.NumberFormat('en-US');

export function TripForm({ onSubmit, pending }: Props) {
  const trip = useTrip();
  const [submitted, setSubmitted] = useState(false);
  const errors = validateTrip(trip);
  // Show errors only after the first submit attempt, then live.
  const shown = submitted ? errors : {};
  const weightValue = parseWeight(trip.weight);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length === 0) onSubmit();
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit} aria-label="Trip details">
      <Stack spacing={2}>
        <Box
          sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, alignItems: 'center' }}
        >
          <Stack spacing={1.5}>
            <PlaceAutocomplete
              id="origin"
              label="Origin"
              value={trip.origin}
              onChange={trip.setOrigin}
              error={shown.origin}
              startIcon={<TripOriginRounded sx={{ fontSize: 16 }} />}
            />
            <PlaceAutocomplete
              id="destination"
              label="Destination"
              value={trip.destination}
              onChange={trip.setDestination}
              error={shown.destination}
              startIcon={<PlaceRounded sx={{ fontSize: 18 }} />}
            />
          </Stack>
          <Tooltip title="Swap origin and destination">
            <span>
              <IconButton
                onClick={trip.swap}
                aria-label="Swap origin and destination"
                disabled={!trip.origin && !trip.destination}
                size="small"
                sx={{ border: 1, borderColor: 'divider' }}
              >
                <SwapVertRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <DateTimePicker
          label="Departure"
          value={trip.departure}
          onChange={trip.setDeparture}
          minDateTime={dayjs().subtract(DEPARTURE_SLACK_MIN, 'minute')}
          maxDateTime={dayjs().add(FORECAST_DAYS, 'day')}
          timeSteps={{ minutes: 15 }}
          slotProps={{
            textField: {
              size: 'small',
              fullWidth: true,
              error: Boolean(shown.departure),
              helperText: shown.departure ?? 'Local time',
            },
          }}
        />

        <Box>
          <TextField
            label="Load weight"
            size="small"
            fullWidth
            value={trip.weight}
            onChange={(e) => trip.setWeight(e.target.value)}
            onBlur={() => weightValue !== null && trip.setWeight(String(weightValue))}
            error={Boolean(shown.weight)}
            helperText={shown.weight ?? '1,000 – 80,000 lb'}
            slotProps={{
              htmlInput: { inputMode: 'numeric', 'aria-describedby': 'weight-presets' },
              input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
            }}
          />
          <Stack
            id="weight-presets"
            direction="row"
            spacing={0.75}
            sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75 }}
            role="group"
            aria-label="Weight presets"
          >
            {WEIGHT_PRESETS.map((p) => (
              <Chip
                key={p.value}
                size="small"
                variant={weightValue === p.value ? 'filled' : 'outlined'}
                color={weightValue === p.value ? 'primary' : 'default'}
                label={`${p.label} · ${intFmt.format(p.value / 1000)}k`}
                onClick={() => trip.setWeight(String(p.value))}
                aria-pressed={weightValue === p.value}
              />
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="caption" component="div" id="interval-label" sx={{ mb: 0.75 }}>
            Checkpoint every
          </Typography>
          <ToggleButtonGroup
            value={trip.interval}
            exclusive
            fullWidth
            size="small"
            aria-labelledby="interval-label"
            onChange={(_, v: Interval | null) => v && trip.setInterval(v)}
          >
            {[10, 25, 50].map((v) => (
              <ToggleButton key={v} value={v} aria-label={`${v} miles`}>
                {v} mi
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <RestStopFields errors={shown} />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {pending ? 'Planning…' : 'Plan routes'}
        </Button>
        {submitted && Object.keys(errors).length > 0 && (
          <FormHelperText error sx={{ mt: -1 }} role="alert">
            Fix the highlighted fields to continue.
          </FormHelperText>
        )}
      </Stack>
    </Box>
  );
}
