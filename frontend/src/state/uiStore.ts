import { create } from 'zustand';
import type { HeatLayer } from '../api/types';

export type PlaySpeed = 1 | 2 | 4;

const ANIMATIONS_KEY = 'saferp:weather-animations';

function readAnimationsEnabled(): boolean {
  try {
    return localStorage.getItem(ANIMATIONS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storeAnimationsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ANIMATIONS_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

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
  /** Forecast hours advanced per second during playback. */
  playSpeed: PlaySpeed;
  /** Weather animations on the map (remembered in localStorage). */
  animationsEnabled: boolean;
  selectRoute: (id: string | null) => void;
  setHovered: (h: HoveredCheckpoint | null) => void;
  pinCheckpoint: (p: { routeId: string; index: number } | null) => void;
  setHeatHour: (hour: number) => void;
  setHeatLayer: (layer: HeatLayer) => void;
  setHeatVisible: (visible: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setPlaySpeed: (speed: PlaySpeed) => void;
  toggleAnimations: () => void;
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
  playSpeed: 1,
  animationsEnabled: readAnimationsEnabled(),
  selectRoute: (id) => set({ selectedRouteId: id, pinned: null, hovered: null }),
  setHovered: (hovered) => set({ hovered }),
  pinCheckpoint: (pinned) => set({ pinned }),
  setHeatHour: (heatHour) => set({ heatHour }),
  setHeatLayer: (heatLayer) => set({ heatLayer }),
  setHeatVisible: (heatVisible) => set({ heatVisible }),
  setPlaying: (playing) => set({ playing }),
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  toggleAnimations: () =>
    set((s) => {
      storeAnimationsEnabled(!s.animationsEnabled);
      return { animationsEnabled: !s.animationsEnabled };
    }),
  resetForPlan: (recommendedId) =>
    set({ selectedRouteId: recommendedId, hovered: null, pinned: null, playing: false }),
}));
