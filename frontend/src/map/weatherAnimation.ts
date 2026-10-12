import type { PaletteMode } from '@mui/material';
import type {
  Map as MapLibreMap,
  StyleImageInterface,
  StyleImageWebGLData,
  StyleImageWebGLTarget,
} from 'maplibre-gl';
import type { HazardLevel, HazardType } from '../lib/hazards';
import { riskColor } from '../theme/risk';

/** Logical icon size in CSS pixels; images are drawn at 2x for sharpness. */
export const ICON_SIZE = 28;
const PIXEL_RATIO = 2;
const CANVAS = ICON_SIZE * PIXEL_RATIO;
export const ANIMATION_FPS = 24;

/** Seconds for one particle to cross the icon. */
const PERIOD_S: Record<HazardType, number> = { rain: 0.9, snow: 3.2, wind: 1.5 };
/** Particles per icon by level (index 0 unused): intensity follows the risk level. */
const COUNT: Record<HazardType, number[]> = {
  rain: [0, 3, 4, 6, 8],
  snow: [0, 3, 5, 7, 9],
  wind: [0, 2, 3, 4, 5],
};

const OUTLINE: Record<PaletteMode, string> = {
  light: 'rgba(23, 32, 43, 0.55)',
  dark: 'rgba(0, 0, 0, 0.75)',
};

/** Fade particles in and out at the icon's edges so the loop has no visible seam. */
function fade(p: number): number {
  return Math.sin(Math.PI * p);
}

/** Stable horizontal / vertical spread for particle i (golden-ratio sequence). */
function spread(i: number): number {
  return (0.31 + i * 0.618034) % 1;
}

/**
 * Draws one frame of a hazard icon. `phase` in [0, 1) loops seamlessly. Wind is drawn blowing
 * east; the map rotates it with icon-rotate. Pure canvas drawing, shared with the legend.
 */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  type: HazardType,
  level: HazardLevel,
  mode: PaletteMode,
  phase: number,
  size: number,
): void {
  const color = riskColor(level, mode);
  const outline = OUTLINE[mode];
  const n = COUNT[type][level];
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const strokeTwice = (path: () => void, width: number, alpha: number) => {
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = outline;
    ctx.lineWidth = width + 1.6;
    ctx.beginPath();
    path();
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    path();
    ctx.stroke();
  };

  for (let i = 0; i < n; i++) {
    const p = (phase + i / n) % 1;
    const alpha = fade(p);
    const x0 = size * (0.14 + 0.72 * spread(i));
    if (type === 'rain') {
      const len = size * (0.16 + 0.025 * level);
      const y = -len + p * (size + len);
      const x = x0 + p * size * 0.12;
      strokeTwice(
        () => {
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * 0.28, y + len);
        },
        size * 0.06,
        alpha,
      );
    } else if (type === 'snow') {
      const r = size * (0.04 + 0.006 * level);
      const y = p * size;
      const x = x0 + Math.sin(2 * Math.PI * (p * 1.4 + i * 0.37)) * size * 0.07;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(x, y, r + 0.9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      const len = size * (0.3 + 0.04 * level);
      const y = size * (0.2 + 0.6 * spread(i + 3));
      const x = -len + p * (size + len);
      const head = size * 0.07;
      strokeTwice(
        () => {
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y);
          // A small chevron at the head keeps the direction readable in static mode.
          ctx.moveTo(x + len - head, y - head * 0.8);
          ctx.lineTo(x + len, y);
          ctx.lineTo(x + len - head, y + head * 0.8);
        },
        size * 0.055,
        alpha,
      );
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Drives all weather icons from one capped-rate frame counter. The map is asked to repaint only
 * when the counter advances, and the loop stops entirely when there is nothing to animate, the
 * tab is hidden, the map is off screen, animations are off, or reduced motion is preferred.
 */
export class WeatherClock {
  frame = 0;
  private raf: number | null = null;
  private last = 0;
  private readonly symbolCounts = new Map<string, number>();
  private readonly flags = {
    enabled: true,
    hasSymbols: false,
    pageVisible: true,
    mapVisible: true,
    reducedMotion: false,
  };

  private readonly repaint: () => void;
  private readonly fps: number;

  constructor(repaint: () => void, fps = ANIMATION_FPS) {
    this.repaint = repaint;
    this.fps = fps;
  }

  get running(): boolean {
    const f = this.flags;
    return f.enabled && f.hasSymbols && f.pageVisible && f.mapVisible && !f.reducedMotion;
  }

  set(partial: Partial<WeatherClock['flags']>): void {
    const wasReduced = this.flags.reducedMotion;
    Object.assign(this.flags, partial);
    if (this.flags.reducedMotion && !wasReduced) {
      this.frame = 0; // static icons show the resting arrangement
      this.repaint();
    }
    this.sync();
  }

  /** Each symbol source reports how many weather symbols it shows; zero everywhere = idle. */
  setSymbolCount(source: string, count: number): void {
    this.symbolCounts.set(source, count);
    this.flags.hasSymbols = [...this.symbolCounts.values()].some((n) => n > 0);
    this.sync();
  }

  private sync(): void {
    if (this.running && this.raf === null) {
      this.raf = requestAnimationFrame(this.tick);
    } else if (!this.running && this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private tick = (now: number) => {
    // 2 ms tolerance so a 60 Hz display lands on every second or third vsync.
    if (now - this.last >= 1000 / this.fps - 2) {
      this.last = now;
      this.frame += 1;
      this.repaint();
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}

/**
 * One animated icon per hazard type, level and theme. `render()` redraws a small 2D canvas only
 * when the clock has advanced; the canvas then reaches the GPU through MapLibre's WebGL image
 * path (one texSubImage2D per atlas slot, premultiplied by the driver). Handing over pixel
 * arrays instead made MapLibre premultiply them in JavaScript for every tile's icon atlas on
 * every frame, which dominated the animation's CPU profile.
 */
class HazardImage implements StyleImageInterface {
  width = CANVAS;
  height = CANVAS;
  data: StyleImageWebGLData;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private drawnFrame = -1;
  private readonly type: HazardType;
  private readonly level: HazardLevel;
  private readonly mode: PaletteMode;
  private readonly clock: WeatherClock;

  constructor(type: HazardType, level: HazardLevel, mode: PaletteMode, clock: WeatherClock) {
    this.type = type;
    this.level = level;
    this.mode = mode;
    this.clock = clock;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS;
    this.canvas.height = CANVAS;
    this.ctx = this.canvas.getContext('2d')!;
    this.draw();
    this.data = { renderWithWebGL: (target) => this.upload(target) };
  }

  render(): boolean {
    if (this.clock.frame === this.drawnFrame) return false;
    this.draw();
    return true;
  }

  private draw(): void {
    this.drawnFrame = this.clock.frame;
    const phase = (this.clock.frame / ANIMATION_FPS / PERIOD_S[this.type]) % 1;
    drawHazard(this.ctx, this.type, this.level, this.mode, phase, CANVAS);
  }

  private upload({ gl, texture, x, y }: StyleImageWebGLTarget): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
}

export const HAZARD_IMAGE_PREFIX = 'wx-';

export function hazardImageId(type: HazardType, level: HazardLevel, mode: PaletteMode): string {
  return `${HAZARD_IMAGE_PREFIX}${type}-${level}-${mode}`;
}

/**
 * Registers hazard images on demand through MapLibre's missing-image resolver (in MapLibre 6
 * the `styleimagemissing` event can no longer supply the image). This also re-creates them after
 * a style switch (theme change) with that theme's colours.
 */
export function registerHazardImages(map: MapLibreMap, clock: WeatherClock): () => void {
  map.setMissingStyleImageResolver((id) => {
    const m = /^wx-(rain|snow|wind)-([1-4])-(light|dark)$/.exec(id);
    if (!m || map.hasImage(id)) return;
    const image = new HazardImage(
      m[1] as HazardType,
      Number(m[2]) as HazardLevel,
      m[3] as PaletteMode,
      clock,
    );
    map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
  });
  return () => map.setMissingStyleImageResolver(null);
}
