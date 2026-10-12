import { Box, useTheme } from '@mui/material';
import type { FeatureCollection } from 'geojson';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { HeatmapResponse, PlanResponse } from '../api/types';
import { boundsOf } from '../lib/geo';
import { truckPositionAtHour } from '../lib/timeline';
import { useUi } from '../state/uiStore';
import { CheckpointPopup } from './CheckpointPopup';
import {
  MAP_STYLES,
  checkpointCode,
  checkpointLayers,
  heatLayerProps,
  routeLayers,
  segmentLayers,
} from './layers';
import { EndpointMarker, TruckMarker } from './markers';

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
  const heatHour = useUi((s) => s.heatHour);
  const heatLayer = useUi((s) => s.heatLayer);
  const heatVisible = useUi((s) => s.heatVisible);
  const { selectRoute, setHovered, pinCheckpoint } = useUi.getState();

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

  // Point features are built once per heatmap; the slider only swaps the `v` property.
  const heatPoints = heatmap?.points;
  const heatData = useMemo<FeatureCollection>(() => {
    if (!heatmap || !heatPoints) return EMPTY_FC;
    const values = heatmap[heatLayer][Math.min(heatHour, heatmap.hours)];
    return {
      type: 'FeatureCollection',
      features: heatPoints.map((p, i) => ({
        type: 'Feature',
        properties: { v: values[i] },
        geometry: { type: 'Point', coordinates: p },
      })),
    };
  }, [heatmap, heatPoints, heatLayer, heatHour]);

  // --- Layer styles (memoised per theme / heat config) ------------------------------------
  const rLayers = useMemo(() => routeLayers(mode), [mode]);
  const sLayers = useMemo(() => segmentLayers(mode), [mode]);
  const cLayers = useMemo(() => checkpointLayers(mode), [mode]);
  const heatStyle = useMemo(() => {
    if (!heatmap) return null;
    const midLat = (heatmap.points[0][1] + heatmap.points[heatmap.points.length - 1][1]) / 2;
    return heatLayerProps(heatLayer, mode, heatmap.spacingDeg, midLat, heatVisible);
  }, [heatmap, heatLayer, mode, heatVisible]);

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

  // --- Truck positions at the slider time --------------------------------------------------
  const trucks = useMemo(() => {
    if (!plan || !heatmap) return [];
    return plan.routes
      .flatMap((r) => {
        const pos = truckPositionAtHour(r, timelineAnchorMs, heatHour);
        return pos ? [{ id: r.id, pos, selected: r.id === selected?.id }] : [];
      })
      .sort((a, b) => Number(a.selected) - Number(b.selected)); // selected truck drawn on top
  }, [plan, heatmap, timelineAnchorMs, heatHour, selected?.id]);

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
    const id = map?.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
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
    <Box sx={{ position: 'absolute', inset: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLES[mode]}
        interactiveLayerIds={plan ? INTERACTIVE : undefined}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onLoad={() => {
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

        {heatStyle && (
          <Source id="heat-src" type="geojson" data={heatData}>
            <Layer {...heatStyle} beforeId={labelLayerId} />
          </Source>
        )}

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

        {first && (
          <>
            <EndpointMarker kind="origin" lngLat={first.geometry[0]} />
            <EndpointMarker kind="destination" lngLat={first.geometry[first.geometry.length - 1]} />
          </>
        )}

        {trucks.map((t) => (
          <Marker key={t.id} longitude={t.pos[0]} latitude={t.pos[1]} anchor="center">
            <TruckMarker label={t.id} selected={t.selected} />
          </Marker>
        ))}

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
