import { WeatherClock } from './weatherAnimation';

describe('WeatherClock', () => {
  let callbacks: FrameRequestCallback[];
  beforeEach(() => {
    callbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      callbacks = [];
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Run the latest scheduled frame callback at time `t`. */
  const frameAt = (t: number) => callbacks.splice(0).forEach((cb) => cb(t));

  it('only runs while enabled, visible and showing symbols', () => {
    const clock = new WeatherClock(() => {});
    expect(clock.running).toBe(false); // nothing to animate yet
    clock.setSymbolCount('grid', 3);
    expect(clock.running).toBe(true);
    clock.set({ pageVisible: false });
    expect(clock.running).toBe(false);
    clock.set({ pageVisible: true, mapVisible: false });
    expect(clock.running).toBe(false);
    clock.set({ mapVisible: true, enabled: false });
    expect(clock.running).toBe(false);
    clock.set({ enabled: true });
    clock.setSymbolCount('grid', 0);
    expect(clock.running).toBe(false);
  });

  it('caps the frame rate and repaints only when the frame advances', () => {
    const repaint = vi.fn();
    const clock = new WeatherClock(repaint, 24);
    clock.setSymbolCount('route', 1);
    frameAt(41.7); // first frame after ~1/24 s
    frameAt(50); // too soon
    frameAt(66);
    expect(clock.frame).toBe(1);
    frameAt(83.4);
    expect(clock.frame).toBe(2);
    expect(repaint).toHaveBeenCalledTimes(2);
  });

  it('shows a static frame under reduced motion', () => {
    const repaint = vi.fn();
    const clock = new WeatherClock(repaint, 24);
    clock.setSymbolCount('route', 1);
    frameAt(42);
    clock.set({ reducedMotion: true });
    expect(clock.running).toBe(false);
    expect(clock.frame).toBe(0);
    expect(repaint).toHaveBeenCalledTimes(2); // one animated frame, one redraw to the static pose
  });
});
