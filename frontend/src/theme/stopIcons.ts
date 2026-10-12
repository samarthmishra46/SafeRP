import BedtimeRounded from '@mui/icons-material/BedtimeRounded';
import LocalCafeRounded from '@mui/icons-material/LocalCafeRounded';
import type { StopKind } from '../api/types';

/** Coffee cup for a short break, moon for an overnight rest. */
export const STOP_ICON = { break: LocalCafeRounded, overnight: BedtimeRounded } as const;

export const STOP_LABEL: Record<StopKind, string> = {
  break: 'Break',
  overnight: 'Overnight rest',
};
