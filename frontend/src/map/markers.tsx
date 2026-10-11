import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { Box } from '@mui/material';
import { Marker } from 'react-map-gl/maplibre';
import type { LngLat } from '../api/types';
import { MONO } from '../theme/theme';

export function EndpointMarker({
  kind,
  lngLat,
}: {
  kind: 'origin' | 'destination';
  lngLat: LngLat;
}) {
  const isOrigin = kind === 'origin';
  return (
    <Marker longitude={lngLat[0]} latitude={lngLat[1]} anchor="center">
      <Box
        role="img"
        aria-label={isOrigin ? 'Origin' : 'Destination'}
        sx={{
          width: 18,
          height: 18,
          borderRadius: isOrigin ? '50%' : '4px',
          bgcolor: 'text.primary',
          border: '3px solid',
          borderColor: 'background.paper',
          boxShadow: 3,
          transform: isOrigin ? 'none' : 'rotate(45deg)',
        }}
      />
    </Marker>
  );
}

export function TruckMarker({ label, selected }: { label: string; selected: boolean }) {
  return (
    <Box
      role="img"
      aria-label={`Truck position on route ${label}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        pl: 0.5,
        pr: 0.75,
        py: 0.25,
        borderRadius: 999,
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        boxShadow: 3,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: MONO,
        opacity: selected ? 1 : 0.85,
        pointerEvents: 'none',
      }}
    >
      <LocalShippingRounded sx={{ fontSize: 15 }} />
      {label}
    </Box>
  );
}
