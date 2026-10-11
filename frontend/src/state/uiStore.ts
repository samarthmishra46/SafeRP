import { create } from 'zustand';
import type { HeatLayer } from '../api/types';

export interface HoveredCheckpoint {
  routeId: string;
  index: number;
  /** Where the hover came from, so the source doesn't react to its own echo. */
  source: 'map' | 'strip';
}

interface UiState {
  selectedRouteId: string | null;
  hovered: HoveredCheckpoint | null;
  pinned: { routeId: string; index: number } | null;
  heatHour: number;
  heatLayer: HeatLayer;
  heatVisible: boolean;
  playing: boolean;
  selectRoute: (id: string | null) => void;
  setHovered: (h: HoveredCheckpoint | null) => void;
  pinCheckpoint: (p: { routeId: string; index: number } | null) => void;
  setHeatHour: (hour: number) => void;
  setHeatLayer: (layer: HeatLayer) => void;
  setHeatVisible: (visible: boolean) => void;
  setPlaying: (playing: boolean) => void;
  resetForPlan: (recommendedId: string) => void;
}

export const useUi = create<UiState>((set) => ({
  selectedRouteId: null,
  hovered: null,
  pinned: null,
  heatHour: 0,
  heatLayer: 'wind',
  heatVisible: true,
  playing: false,
  selectRoute: (id) => set({ selectedRouteId: id, pinned: null, hovered: null }),
  setHovered: (hovered) => set({ hovered }),
  pinCheckpoint: (pinned) => set({ pinned }),
  setHeatHour: (heatHour) => set({ heatHour }),
  setHeatLayer: (heatLayer) => set({ heatLayer }),
  setHeatVisible: (heatVisible) => set({ heatVisible }),
  setPlaying: (playing) => set({ playing }),
  resetForPlan: (recommendedId) =>
    set({ selectedRouteId: recommendedId, hovered: null, pinned: null, playing: false }),
}));
