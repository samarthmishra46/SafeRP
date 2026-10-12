import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { usePlaceSearch } from '../api/hooks';
import type { Place } from '../api/types';
import { useDebounced } from '../lib/useDebounced';
import { useTrip } from '../state/tripStore';

interface Props {
  id: string;
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  error?: string;
  startIcon: ReactNode;
}

export function PlaceAutocomplete({ id, label, value, onChange, error, startIcon }: Props) {
  const [input, setInput] = useState(value?.label ?? '');
  // Keep the text in sync when the value changes from outside (e.g. the swap button).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInput(value?.label ?? '');
  }
  const query = useDebounced(input, 250);
  const typingMatchesValue = value !== null && input === value.label;
  const country = useTrip((s) => s.country);
  const search = usePlaceSearch(typingMatchesValue ? '' : query, country);
  const options = search.data ?? [];

  const noOptionsText =
    input.trim().length < 2
      ? 'Type at least 2 characters'
      : search.isError
        ? search.error.message
        : 'No matching places';

  return (
    <Autocomplete
      id={id}
      value={value}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      onChange={(_, place) => onChange(place)}
      options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={search.isFetching}
      noOptionsText={noOptionsText}
      autoHighlight
      fullWidth
      renderOption={({ key, ...props }, option) => (
        <Box
          component="li"
          key={key}
          {...props}
          sx={{ gap: 1.5, alignItems: 'flex-start !important' }}
        >
          <PlaceOutlined fontSize="small" sx={{ color: 'text.secondary', mt: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {option.name}
            </Typography>
            <Typography variant="caption" component="div" noWrap>
              {option.context}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          error={Boolean(error)}
          helperText={error}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <Box
                  sx={{ display: 'flex', color: 'text.secondary', ml: 0.5, mr: -0.5 }}
                  aria-hidden
                >
                  {startIcon}
                </Box>
              ),
            },
          }}
        />
      )}
    />
  );
}
