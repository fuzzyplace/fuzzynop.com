import type { Engine } from './engine';

/**
 * Sound on or off: on by default, off once the visitor turns it off (localStorage, guarded). The
 * AudioContext is created only inside a user gesture (browsers allow nothing before): the toggle's
 * click, or the visitor's first press, tap or key. The engine chunk is imported then, never before.
 * Shared by the toggle and the dev board.
 */

const KEY = 'fz:sound';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function raw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // blocked storage: the default, and the choice lasts this page only
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
/** On unless the visitor turned it off. Reduced motion: off unless they turned it on. */
let on = reduced() ? raw() === '1' : raw() !== '0';
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const isOn = () => on;
/** Sound is actually playing (the context is running), not just wanted. */
export const isRunning = () => on && ac?.state === 'running';
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
    ac.addEventListener('statechange', emit); // the toggle shows what's really happening
    // iOS: without this the ringer (silent) switch mutes Web Audio
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      // not supported: nothing to do
    }
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
  emit();
  return e;
}

/**
 * Sound is on: start it on the visitor's first gesture (browsers won't before). Not every event
 * counts as one everywhere (iOS wants the touch to end), so keep listening until the context runs.
 * A gesture only starts sound that is already on; it never overrides "off".
 */
const GESTURES = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;
export function armOnGesture() {
  if (!on || ac?.state === 'running') return () => {};
  const go = (e: Event) => {
    if (!on) return off();
    // the toggle handles its own press (otherwise its pointerdown would start sound and its click stop it)
    if (e.target instanceof Element && e.target.closest('.sfx-toggle')) return;
    void setSound(true).then(() => {
      if (ac?.state === 'running') off();
    });
  };
  const opts = { capture: true, passive: true } as const;
  const off = () => GESTURES.forEach((g) => window.removeEventListener(g, go, opts));
  GESTURES.forEach((g) => window.addEventListener(g, go, opts));
  return off;
}
