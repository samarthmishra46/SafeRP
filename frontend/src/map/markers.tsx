import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { Box, Tooltip } from '@mui/material';
import { Marker } from 'react-map-gl/maplibre';
import type { LngLat, RestStop, StopKind } from '../api/types';
import { formatDuration, formatMilesValue, formatSliderTime } from '../lib/format';
import { STOP_ICON, STOP_LABEL } from '../theme/stopIcons';
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

export function TruckMarker({
  label,
  selected,
  resting = null,
}: {
  label: string;
  selected: boolean;
  resting?: StopKind | null;
}) {
  const Icon = resting ? STOP_ICON[resting] : LocalShippingRounded;
  return (
    <Box
      role="img"
      aria-label={
        resting
          ? `Truck on route ${label}, stopped for ${STOP_LABEL[resting].toLowerCase()}`
          : `Truck position on route ${label}`
      }
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
      <Icon sx={{ fontSize: 15 }} />
      {label}
    </Box>
  );
}

/** A rest stop on the selected route: coffee cup for a break, moon for an overnight rest. */
export function StopMarker({ stop, routeName }: { stop: RestStop; routeName: string }) {
  const Icon = STOP_ICON[stop.kind];
  const text = `${STOP_LABEL[stop.kind]} on ${routeName}, ${formatDuration(stop.durationS)}: ${formatSliderTime(
    new Date(stop.start),
  )} to ${formatSliderTime(new Date(stop.end))}, mile ${formatMilesValue(stop.distanceMi)}`;
  return (
    <Marker longitude={stop.lon} latitude={stop.lat} anchor="center">
      <Tooltip title={text}>
        <Box
          role="img"
          tabIndex={0}
          aria-label={text}
          sx={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '2px solid',
            borderColor: 'text.primary',
            boxShadow: 3,
            cursor: 'default',
          }}
        >
          <Icon sx={{ fontSize: 15 }} />
        </Box>
      </Tooltip>
    </Marker>
  );
}
