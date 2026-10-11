import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Box, ButtonBase, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export const PANEL_WIDTH = 408;
export const SHEET_PEEK = 0.42; // fraction of viewport height when collapsed

interface Props {
  header: ReactNode;
  children: ReactNode;
  mobile: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/** Floating panel on desktop; a two-position bottom sheet on small screens. */
export function SidePanel({ header, children, mobile, expanded, onToggle }: Props) {
  if (!mobile) {
    return (
      <Paper
        component="aside"
        aria-label="Trip planner"
        elevation={4}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          bottom: 16,
          width: PANEL_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 3,
          overflow: 'hidden',
          zIndex: 2,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.25, pb: 1.75, borderBottom: 1, borderColor: 'divider' }}>
          {header}
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2.5, scrollbarGutter: 'stable' }}>
          {children}
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      component="aside"
      aria-label="Trip planner"
      elevation={4}
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: expanded ? '88dvh' : `${SHEET_PEEK * 100}dvh`,
        transition: (t) => t.transitions.create('height', { duration: 240 }),
        display: 'flex',
        flexDirection: 'column',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        zIndex: 2,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          pt: 0.75,
          pb: 0.25,
          borderRadius: '16px 16px 0 0',
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
          {expanded ? (
            <ExpandMoreRounded fontSize="small" />
          ) : (
            <ExpandLessRounded fontSize="small" />
          )}
          <Typography variant="caption">{expanded ? 'Show map' : 'Show details'}</Typography>
        </Box>
      </ButtonBase>
      <Box sx={{ px: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>{header}</Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>{children}</Box>
    </Paper>
  );
}
