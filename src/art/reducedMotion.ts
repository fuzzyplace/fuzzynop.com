import { useSyncExternalStore } from 'react';

/**
 * `prefers-reduced-motion: reduce`, live. (Replaces motion's hook of the same name, so the art
 * engine doesn't pull the animation library into the bundle for a media query.)
 */
const QUERY = '(prefers-reduced-motion: reduce)';
let mq: MediaQueryList | null = null;
const media = () => (mq ??= window.matchMedia(QUERY));
const subscribe = (cb: () => void) => {
  const m = media();
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media().matches,
    () => false,
  );
}
