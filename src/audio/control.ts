import type { Engine } from './engine';

/**
 * Sound on or off: the visitor's choice (localStorage, guarded), the AudioContext (created only
 * inside a user gesture: the toggle's click, or the first press / key after a reload with sound
 * on) and the engine chunk (imported then, never before). Shared by the toggle and the dev board.
 */

const KEY = 'fz:sound';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function store(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // private mode / blocked storage: the choice lasts this page only
  }
}

type Ctor = typeof AudioContext;
let ac: AudioContext | null = null;
let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;
/** Reduced motion: off by default, whatever was stored (the visitor can still turn it on). */
let on = stored() && !reduced();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const isOn = () => on;
export function subscribe(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}

/** Call inside a user gesture: creates (or resumes) the context there, then loads the engine. */
function wake(): Promise<Engine> | null {
  if (!ac) {
    const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!C) return null;
    ac = new C({ latencyHint: 'interactive' });
  }
  void ac.resume();
  loading ??= import('./engine').then((m) => (engine = m.getEngine(ac!)));
  return loading;
}

export async function setSound(next: boolean): Promise<Engine | null> {
  on = next;
  store(next);
  emit();
  if (!next) {
    engine?.setOn(false);
    return engine;
  }
  const e = await wake();
  if (e && on) e.setOn(true);
  return e;
}

/** Sound was left on: start it on the visitor's first press or key (browsers won't before). */
export function armOnGesture() {
  if (!on || ac) return () => {};
  const go = () => {
    off();
    if (on) void setSound(true);
  };
  const opts = { capture: true, once: true } as const;
  const off = () => {
    window.removeEventListener('pointerdown', go, opts);
    window.removeEventListener('keydown', go, opts);
  };
  window.addEventListener('pointerdown', go, opts);
  window.addEventListener('keydown', go, opts);
  return off;
}
