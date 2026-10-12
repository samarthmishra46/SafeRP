import { Box, useTheme } from '@mui/material';
import type { FeatureCollection } from 'geojson';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { HeatmapResponse, PlanResponse } from '../api/types';
import { boundsOf } from '../lib/geo';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { useUi } from '../state/uiStore';
import { AnimationToggleControl } from './AnimationToggleControl';
import { CheckpointPopup } from './CheckpointPopup';
import { CorridorWeatherLayers, RouteWeatherOverlay } from './HourLayers';
import { MAP_STYLES, checkpointCode, checkpointLayers, routeLayers, segmentLayers } from './layers';
import { EndpointMarker, StopMarker } from './markers';
import { WeatherClock, registerHazardImages } from './weatherAnimation';

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  plan: PlanResponse | undefined;
  heatmap: HeatmapResponse | undefined;
  /** Slider hour 0: the heatmap's anchor hour (epoch ms). */
  timelineAnchorMs: number;
  padding: MapPadding;
}

// maplibre-gl 6 locates its worker relative to its own module URL, which bundlers rewrite.
// Point it at the worker emitted as a Vite asset instead.
setWorkerUrl(maplibreWorkerUrl);

const INITIAL_VIEW = { longitude: -96.5, latitude: 37.5, zoom: 3.6 };
const INTERACTIVE = ['cp-circle', 'routes-hit'];
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default function MapView({ plan, heatmap, timelineAnchorMs, padding }: Props) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [labelLayerId, setLabelLayerId] = useState<string | undefined>();
  const [hoverRouteId, setHoverRouteId] = useState<string | null>(null);

  const selectedRouteId = useUi((s) => s.selectedRouteId);
  const hovered = useUi((s) => s.hovered);
  const pinned = useUi((s) => s.pinned);
  const animationsEnabled = useUi((s) => s.animationsEnabled);
  const { selectRoute, setHovered, pinCheckpoint, toggleAnimations } = useUi.getState();
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState<WeatherClock | null>(null);

  const selected = plan?.routes.find((r) => r.id === selectedRouteId) ?? plan?.routes[0];

  // --- Sources (memoised so react-map-gl only calls setData when content changes) ---------
  const routesData = useMemo<FeatureCollection>(() => {
    if (!plan) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: plan.routes
        .filter((r) => r.id !== selected?.id)
        .map((r) => ({
          type: 'Feature',
          properties: { id: r.id, hover: r.id === hoverRouteId },
          geometry: { type: 'LineString', coordinates: r.geometry },
        })),
    };
  }, [plan, selected?.id, hoverRouteId]);

  const segmentsData = useMemo<FeatureCollection>(() => {
    if (!selected) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: selected.segments.map((s) => ({
        type: 'Feature',
        properties: { level: s.level, index: s.checkpointIndex },
        geometry: { type: 'LineString', coordinates: s.coords },
      })),
    };
  }, [selected]);

  const checkpointsData = useMemo<FeatureCollection>(() => {
    if (!selected) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: selected.checkpoints.map((c) => ({
        type: 'Feature',
        properties: {
          index: c.index,
          level: c.level,
          code: checkpointCode(c.level),
          routeId: selected.id,
        },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      })),
    };
  }, [selected]);

  useEffect(() => {
    clock?.set({ enabled: animationsEnabled, reducedMotion });
  }, [clock, animationsEnabled, reducedMotion]);

  // Pause the animation loop when the tab is hidden or the map is scrolled/covered out of view.
  useEffect(() => {
    if (!clock) return;
    const onVisibility = () => clock.set({ pageVisible: !document.hidden });
    document.addEventListener('visibilitychange', onVisibility);
    const el = containerRef.current;
    const observer =
      el && 'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => clock.set({ mapVisible: entry.isIntersecting }))
        : null;
    if (el) observer?.observe(el);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [clock]);

  useEffect(() => () => clock?.destroy(), [clock]);

  // --- Layer styles (memoised per theme / heat config) ------------------------------------
  const rLayers = useMemo(() => routeLayers(mode), [mode]);
  const sLayers = useMemo(() => segmentLayers(mode), [mode]);
  const cLayers = useMemo(() => checkpointLayers(mode), [mode]);
  // The focused checkpoint can belong to any route (e.g. hovering another card's risk strip).
  const focus = pinned ?? (hovered ? { routeId: hovered.routeId, index: hovered.index } : null);
  const focusRoute = focus ? plan?.routes.find((r) => r.id === focus.routeId) : undefined;
  const focusCheckpoint = focus ? focusRoute?.checkpoints[focus.index] : undefined;
  const highlightData = useMemo<FeatureCollection>(
    () =>
      focusCheckpoint
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Point',
                  coordinates: [focusCheckpoint.lon, focusCheckpoint.lat],
                },
              },
            ],
          }
        : EMPTY_FC,
    [focusCheckpoint],
  );

  // --- Camera ------------------------------------------------------------------------------
  const fittedPlan = useRef<PlanResponse | null>(null);
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !plan || fittedPlan.current === plan) return;
    const bounds = boundsOf(plan.routes.flatMap((r) => r.geometry));
    if (!bounds) return;
    fittedPlan.current = plan;
    map.fitBounds(bounds, {
      padding: {
        top: padding.top + 48,
        bottom: padding.bottom + 48,
        left: padding.left + 48,
        right: padding.right + 48,
      },
      duration: prefersReducedMotion() ? 0 : 900,
      maxZoom: 11,
    });
  }, [plan, padding]);

  useEffect(() => {
    if (loaded) fit();
  }, [loaded, fit]);

  const syncLabelLayer = useCallback(() => {
    const map = mapRef.current?.getMap();
    // First basemap label layer; our own sources all end in "-src" and must be skipped.
    const id = map
      ?.getStyle()
      ?.layers?.find((l) => l.type === 'symbol' && !l.source.endsWith('-src'))?.id;
    setLabelLayerId((prev) => (prev === id ? prev : id));
  }, []);

  // --- Pointer interaction -----------------------------------------------------------------
  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const canvas = mapRef.current?.getCanvas();
      if (f?.layer.id === 'cp-circle') {
        const { routeId, index } = f.properties as { routeId: string; index: number };
        const current = useUi.getState().hovered;
        if (current?.index !== index || current.routeId !== routeId) {
          setHovered({ routeId, index, source: 'map' });
        }
        setHoverRouteId(null);
        if (canvas) canvas.style.cursor = 'pointer';
        return;
      }
      if (useUi.getState().hovered?.source === 'map') setHovered(null);
      const routeId = f?.layer.id === 'routes-hit' ? (f.properties as { id: string }).id : null;
      setHoverRouteId(routeId);
      if (canvas) canvas.style.cursor = routeId ? 'pointer' : '';
    },
    [setHovered],
  );

  const onMouseLeave = useCallback(() => {
    if (useUi.getState().hovered?.source === 'map') setHovered(null);
    setHoverRouteId(null);
  }, [setHovered]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f?.layer.id === 'cp-circle') {
        const { routeId, index } = f.properties as { routeId: string; index: number };
        pinCheckpoint({ routeId, index });
      } else if (f?.layer.id === 'routes-hit') {
        selectRoute((f.properties as { id: string }).id);
      } else {
        pinCheckpoint(null);
      }
    },
    [pinCheckpoint, selectRoute],
  );

  const first = plan?.routes[0];
  return (
    <Box ref={containerRef} sx={{ position: 'absolute', inset: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLES[mode]}
        interactiveLayerIds={plan ? INTERACTIVE : undefined}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onLoad={(e) => {
          const map = e.target;
          const clock = new WeatherClock(() => map.triggerRepaint());
          clock.set({ pageVisible: !document.hidden });
          registerHazardImages(map, clock);
          setClock(clock);
          setLoaded(true);
          syncLabelLayer();
        }}
        onStyleData={syncLabelLayer}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={{ compact: true }}
        style={{ width: '100%', height: '100%' }}
        aria-label="Route map"
      >
        <NavigationControl position="top-right" showCompass={false} />
        <AnimationToggleControl enabled={animationsEnabled} onToggle={toggleAnimations} />

        <CorridorWeatherLayers
          heatmap={heatmap}
          mode={mode}
          labelLayerId={labelLayerId}
          clock={clock}
        />

        <Source id="routes-src" type="geojson" data={routesData}>
          <Layer {...rLayers.mutedCasing} beforeId={labelLayerId} />
          <Layer {...rLayers.mutedLine} beforeId={labelLayerId} />
          <Layer {...rLayers.hit} />
        </Source>

        <Source id="segments-src" type="geojson" data={segmentsData}>
          <Layer {...sLayers.casing} beforeId={labelLayerId} />
          <Layer {...sLayers.line} beforeId={labelLayerId} />
          <Layer {...sLayers.noTravel} beforeId={labelLayerId} />
        </Source>

        <Source id="highlight-src" type="geojson" data={highlightData}>
          <Layer {...cLayers.highlight} />
        </Source>

        <Source id="checkpoints-src" type="geojson" data={checkpointsData}>
          <Layer {...cLayers.circle} />
          <Layer {...cLayers.label} />
        </Source>

        {selected?.stops.map((stop) => (
          <StopMarker key={stop.clockStartS} stop={stop} routeName={selected.name} />
        ))}

        <RouteWeatherOverlay
          plan={plan}
          heatmap={heatmap}
          anchorMs={timelineAnchorMs}
          selectedId={selected?.id}
          mode={mode}
          clock={clock}
        />

        {first && (
          <>
            <EndpointMarker kind="origin" lngLat={first.geometry[0]} />
            <EndpointMarker kind="destination" lngLat={first.geometry[first.geometry.length - 1]} />
          </>
        )}

        {focusRoute && focusCheckpoint && (
          <Popup
            longitude={focusCheckpoint.lon}
            latitude={focusCheckpoint.lat}
            offset={16}
            closeButton={false}
            closeOnClick={false}
            maxWidth="300px"
            onClose={() => pinCheckpoint(null)}
          >
            <CheckpointPopup
              checkpoint={focusCheckpoint}
              routeName={focusRoute.name}
              windMetric={plan!.meta.windMetric}
              pinned={Boolean(pinned)}
              onClose={() => pinCheckpoint(null)}
            />
          </Popup>
        )}
      </Map>
    </Box>
  );
}
