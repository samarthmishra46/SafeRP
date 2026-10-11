import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useThemeMode } from '../theme/ThemeModeProvider';

function Logo() {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      aria-hidden
      sx={{ width: 30, height: 30, flexShrink: 0, color: 'primary.main' }}
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <path
        d="M8 21c4 0 4-10 8-10s4 10 8 10"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="21" r="2.2" fill="#fff" />
      <circle cx="24" cy="21" r="2.2" fill="#fff" />
    </Box>
  );
}

export function Brand() {
  const { mode, toggle } = useThemeMode();
  const next = mode === 'light' ? 'dark' : 'light';
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
      <Logo />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h1" component="h1" sx={{ lineHeight: 1.1 }}>
          SafeRP
        </Typography>
        <Typography variant="caption" component="p" noWrap>
          Weather-aware truck routing
        </Typography>
      </Box>
      <Tooltip title={`Switch to ${next} mode`}>
        <IconButton onClick={toggle} aria-label={`Switch to ${next} mode`} size="small">
          {mode === 'light' ? (
            <DarkModeOutlined fontSize="small" />
          ) : (
            <LightModeOutlined fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
