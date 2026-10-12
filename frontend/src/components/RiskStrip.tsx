import { Box, Typography, useTheme } from '@mui/material';
import { memo, useCallback, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { Route } from '../api/types';
import { formatDistance, formatMilepost, formatTime, joinFactors } from '../lib/format';
import type { Units } from '../lib/units';
import { useUnits } from '../state/tripStore';
import { useUi } from '../state/uiStore';
import { RISK_LABEL, riskColor } from '../theme/risk';

interface Props {
  route: Route;
  height?: number;
}

function describe(route: Route, index: number, units: Units): string {
  const c = route.checkpoints[index];
  if (!c) return '';
  const why = c.drivers.length ? ` (${joinFactors(c.drivers).toLowerCase()})` : '';
  const at = formatMilepost(c.distanceMi, units);
  return `${at[0].toUpperCase()}${at.slice(1)}, ETA ${formatTime(c.eta)}: ${RISK_LABEL[c.level]}${why}`;
}

/**
 * The route from start to finish as a thin bar, one segment per checkpoint's stretch.
 * Hover or arrow keys highlight the matching checkpoint on the map; Enter pins its details.
 */
export const RiskStrip = memo(function RiskStrip({ route, height = 12 }: Props) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const units = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const activeIndex = useUi((s) => {
    const focus = s.hovered ?? s.pinned;
    return focus && focus.routeId === route.id ? focus.index : -1;
  });
  const { setHovered, pinCheckpoint } = useUi.getState();
  const total = route.distanceMi || 1;

  const indexAt = useCallback(
    (clientX: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return -1;
      const mile = ((clientX - rect.left) / rect.width) * total;
      return route.checkpoints.findIndex((c) => mile >= c.spanMi[0] && mile <= c.spanMi[1]);
    },
    [route, total],
  );

  const onMove = (e: MouseEvent) => {
    const index = indexAt(e.clientX);
    if (index >= 0 && index !== activeIndex)
      setHovered({ routeId: route.id, index, source: 'strip' });
  };

  const onLeave = () => {
    if (useUi.getState().hovered?.source === 'strip') setHovered(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = route.checkpoints.length - 1;
    const current = activeIndex < 0 ? -1 : activeIndex;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(last, current + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Enter' && current >= 0) {
      pinCheckpoint({ routeId: route.id, index: current });
      e.preventDefault();
      return;
    } else if (e.key === 'Escape') {
      setHovered(null);
      pinCheckpoint(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setHovered({ routeId: route.id, index: next, source: 'strip' });
    }
  };

  const active = activeIndex >= 0 ? route.checkpoints[activeIndex] : undefined;
  return (
    <Box>
      <Box
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={`Risk along ${route.name}. Use arrow keys to step through checkpoints, Enter for details.`}
        aria-describedby={`strip-live-${route.id}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={(e) => {
          e.stopPropagation();
          const index = indexAt(e.clientX);
          if (index >= 0) pinCheckpoint({ routeId: route.id, index });
        }}
        onKeyDown={onKeyDown}
        onBlur={onLeave}
        sx={{
          position: 'relative',
          height,
          borderRadius: 1,
          overflow: 'hidden',
          cursor: 'crosshair',
          bgcolor: 'divider',
          '&:focus-visible': { outlineOffset: 3 },
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 10"
          preserveAspectRatio="none"
          aria-hidden
          style={{ display: 'block' }}
        >
          {route.checkpoints.map((c) => {
            const x = (c.spanMi[0] / total) * 1000;
            const w = ((c.spanMi[1] - c.spanMi[0]) / total) * 1000;
            return (
              <rect
                key={c.index}
                x={x}
                y={0}
                width={w + 0.6}
                height={10}
                fill={riskColor(c.level, mode)}
                opacity={activeIndex >= 0 && activeIndex !== c.index ? 0.7 : 1}
              />
            );
          })}
        </svg>
        {active && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(active.spanMi[0] / total) * 100}%`,
              width: `${((active.spanMi[1] - active.spanMi[0]) / total) * 100}%`,
              minWidth: 3,
              boxShadow: `inset 0 0 0 2px ${theme.palette.text.primary}`,
              borderRadius: 0.5,
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
      <Typography
        id={`strip-live-${route.id}`}
        variant="caption"
        component="div"
        aria-live="polite"
        sx={{
          mt: 0.5,
          minHeight: '1.5em',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        {active ? (
          <span>{describe(route, activeIndex, units)}</span>
        ) : (
          <>
            <span>Origin</span>
            <span>{formatDistance(route.distanceMi, units)}</span>
          </>
        )}
      </Typography>
    </Box>
  );
});
