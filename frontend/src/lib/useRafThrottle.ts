import { useCallback, useEffect, useRef } from 'react';

/** Calls `fn` with the latest value at most once per animation frame. */
export function useRafThrottle<T>(fn: (value: T) => void): (value: T) => void {
  const frame = useRef<number | null>(null);
  const latest = useRef<T | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return useCallback((value: T) => {
    latest.current = value;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      fnRef.current(latest.current as T);
    });
  }, []);
}
