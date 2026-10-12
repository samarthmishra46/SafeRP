import type { PaletteMode } from '@mui/material';
import type { FeatureCollection } from 'geojson';
import { memo, useEffect, useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import type { HeatmapResponse, PlanResponse } from '../api/types';
import { gridHazardFeatures, routeHazardFeatures } from '../lib/hazards';
import { truckPositionAtHour } from '../lib/timeline';
import { useUi } from '../state/uiStore';
import { heatLayerProps, weatherLayers } from './layers';
import { TruckMarker } from './markers';
import type { WeatherClock } from './weatherAnimation';

/*
 * Everything that changes with the slider hour lives here, in two small components that
 * subscribe to the hour themselves. A slider step re-renders only these (and updates their
 * GeoJSON sources in place) instead of the whole map with its static route layers.
 */

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

interface CorridorProps {
  heatmap: HeatmapResponse | undefined;
  mode: PaletteMode;
  labelLayerId: string | undefined;
  clock: WeatherClock | null;
}

/** Heatmap circles and grid weather symbols, beneath the basemap labels. */
export const CorridorWeatherLayers = memo(function CorridorWeatherLayers({
  heatmap,
  mode,
  labelLayerId,
  clock,
}: CorridorProps) {
  const hour = useUi((s) => s.heatHour);
  const layer = useUi((s) => s.heatLayer);
  const visible = useUi((s) => s.heatVisible);
  const animations = useUi((s) => s.animationsEnabled);

  // Point positions are fixed per heatmap; each hour only swaps the `v` values.
  const heatData = useMemo<FeatureCollection>(() => {
    if (!heatmap) return EMPTY_FC;
    const values = heatmap[layer][Math.min(hour, heatmap.hours)];
    return {
      type: 'FeatureCollection',
      features: heatmap.points.map((p, i) => ({
        type: 'Feature',
        properties: { v: values[i] },
        geometry: { type: 'Point', coordinates: p },
      })),
    };
  }, [heatmap, layer, hour]);

  const hazardData = useMemo<FeatureCollection>(
    () =>
      heatmap && animations && visible
        ? { type: 'FeatureCollection', features: gridHazardFeatures(heatmap, layer, hour) }
        : EMPTY_FC,
    [heatmap, animations, visible, layer, hour],
  );

  useEffect(() => {
    clock?.setSymbolCount('grid', hazardData.features.length);
  }, [clock, hazardData]);

  const heatStyle = useMemo(() => {
    if (!heatmap) return null;
    const midLat = (heatmap.points[0][1] + heatmap.points[heatmap.points.length - 1][1]) / 2;
    return heatLayerProps(layer, mode, heatmap.spacingDeg, midLat, visible);
  }, [heatmap, layer, mode, visible]);
  const gridLayer = useMemo(
    () => weatherLayers(mode, animations && visible, animations).grid,
    [mode, animations, visible],
  );

  return (
    <>
      {heatStyle && (
        <Source id="heat-src" type="geojson" data={heatData}>
          <Layer {...heatStyle} beforeId={labelLayerId} />
        </Source>
      )}
      <Source id="wx-grid-src" type="geojson" data={hazardData}>
        <Layer {...gridLayer} beforeId={labelLayerId} />
      </Source>
    </>
  );
});

interface RouteProps {
  plan: PlanResponse | undefined;
  heatmap: HeatmapResponse | undefined;
  anchorMs: number;
  selectedId: string | undefined;
  mode: PaletteMode;
  clock: WeatherClock | null;
}

/** Route weather symbols and truck markers, drawn above the route and checkpoints. */
export const RouteWeatherOverlay = memo(function RouteWeatherOverlay({
  plan,
  heatmap,
  anchorMs,
  selectedId,
  mode,
  clock,
}: RouteProps) {
  const hour = useUi((s) => s.heatHour);
  const animations = useUi((s) => s.animationsEnabled);

  const hazardData = useMemo<FeatureCollection>(
    () =>
      plan && heatmap && animations
        ? {
            type: 'FeatureCollection',
            features: routeHazardFeatures(plan, anchorMs, hour, selectedId),
          }
        : EMPTY_FC,
    [plan, heatmap, animations, anchorMs, hour, selectedId],
  );

  useEffect(() => {
    clock?.setSymbolCount('route', hazardData.features.length);
  }, [clock, hazardData]);

  const routeLayer = useMemo(
    () => weatherLayers(mode, false, animations).route,
    [mode, animations],
  );

  const trucks = useMemo(() => {
    if (!plan || !heatmap) return [];
    return plan.routes
      .flatMap((r) => {
        const pos = truckPositionAtHour(r, anchorMs, hour);
        return pos ? [{ id: r.id, pos, selected: r.id === selectedId }] : [];
      })
      .sort((a, b) => Number(a.selected) - Number(b.selected)); // selected truck drawn on top
  }, [plan, heatmap, anchorMs, hour, selectedId]);

  return (
    <>
      <Source id="wx-route-src" type="geojson" data={hazardData}>
        <Layer {...routeLayer} />
      </Source>
      {trucks.map((t) => (
        <Marker key={t.id} longitude={t.pos[0]} latitude={t.pos[1]} anchor="center">
          <TruckMarker label={t.id} selected={t.selected} />
        </Marker>
      ))}
    </>
  );
});
