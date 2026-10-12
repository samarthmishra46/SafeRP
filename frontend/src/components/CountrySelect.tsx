import PublicRounded from '@mui/icons-material/PublicRounded';
import { Autocomplete, Box, TextField } from '@mui/material';
import { useMemo } from 'react';
import { countries, type Country } from '../lib/countries';
import { useTrip, useUnits } from '../state/tripStore';

/** Country for place search ('' = worldwide); it also sets the display units. */
export function CountrySelect() {
  const country = useTrip((s) => s.country);
  const setCountry = useTrip((s) => s.setCountry);
  const units = useUnits();
  const options = useMemo(() => countries(), []);
  const value = options.find((c) => c.code === country) ?? options[0];
  const unitHint = `Units: ${units.distance}, ${units.speed}, ${units.weight}, ${units.temperature}`;

  return (
    <Autocomplete<Country, false, true>
      id="country"
      options={options}
      value={value}
      onChange={(_, c) => setCountry(c.code)}
      getOptionLabel={(c) => c.name}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      disableClearable
      autoHighlight
      size="small"
      renderOption={({ key, ...props }, c) => (
        <Box
          component="li"
          key={key}
          {...props}
          sx={{ gap: 1, justifyContent: 'space-between !important' }}
        >
          <span>{c.name}</span>
          {c.code && (
            <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              {c.code}
            </Box>
          )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Country"
          helperText={`Filters place search. ${unitHint}`}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <Box
                  sx={{ display: 'flex', color: 'text.secondary', ml: 0.5, mr: -0.5 }}
                  aria-hidden
                >
                  <PublicRounded sx={{ fontSize: 18 }} />
                </Box>
              ),
            },
          }}
        />
      )}
    />
  );
}
