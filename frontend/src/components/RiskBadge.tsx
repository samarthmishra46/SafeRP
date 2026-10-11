import { Box, useTheme, type SxProps, type Theme } from '@mui/material';
import type { RiskLevel } from '../api/types';
import { RISK_LABEL, riskColor, riskOnColor } from '../theme/risk';
import { RISK_ICON } from '../theme/riskIcons';

interface Props {
  level: RiskLevel;
  size?: 'small' | 'medium';
  variant?: 'solid' | 'soft';
  label?: string;
  sx?: SxProps<Theme>;
}

/** Colour + icon + text: the level is readable without colour vision. */
export function RiskBadge({ level, size = 'small', variant = 'solid', label, sx }: Props) {
  const theme = useTheme();
  const color = riskColor(level, theme.palette.mode);
  const Icon = RISK_ICON[level];
  const solid = variant === 'solid';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: size === 'small' ? 0.75 : 1,
        py: size === 'small' ? 0.125 : 0.25,
        borderRadius: 1,
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        bgcolor: solid ? color : 'transparent',
        color: solid ? riskOnColor(level) : 'text.primary',
        border: solid ? 'none' : `1px solid ${color}`,
        ...sx,
      }}
    >
      <Icon
        sx={{ fontSize: size === 'small' ? 14 : 16, color: solid ? 'inherit' : color }}
        aria-hidden
      />
      {label ?? RISK_LABEL[level]}
    </Box>
  );
}

/** Small colour swatch with the level's icon, for dense tables and legends. */
export function RiskSwatch({ level, size = 14 }: { level: RiskLevel; size?: number }) {
  const theme = useTheme();
  const Icon = RISK_ICON[level];
  return (
    <Icon
      aria-label={RISK_LABEL[level]}
      sx={{ fontSize: size, color: riskColor(level, theme.palette.mode), flexShrink: 0 }}
    />
  );
}
