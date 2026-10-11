import AltRouteRounded from '@mui/icons-material/AltRouteRounded';
import ThunderstormOutlined from '@mui/icons-material/ThunderstormOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { Box, Stack, Typography } from '@mui/material';

const STEPS = [
  { icon: AltRouteRounded, text: 'Up to three truck-legal route options' },
  { icon: ThunderstormOutlined, text: 'Forecast wind, rain and snow at each checkpoint’s ETA' },
  { icon: VerifiedOutlined, text: 'A recommendation you can explain to dispatch' },
];

export function EmptyState() {
  return (
    <Box
      sx={{
        mt: 3,
        p: 2,
        borderRadius: 2.5,
        border: 1,
        borderStyle: 'dashed',
        borderColor: 'divider',
      }}
    >
      <Typography variant="subtitle2" component="h2" sx={{ mb: 1.25 }}>
        Plan a trip to compare routes
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {STEPS.map(({ icon: Icon, text }) => (
          <Stack component="li" key={text} direction="row" sx={{ gap: 1.25, alignItems: 'center' }}>
            <Icon sx={{ fontSize: 18, color: 'text.secondary' }} aria-hidden />
            <Typography variant="body2" color="text.secondary">
              {text}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
