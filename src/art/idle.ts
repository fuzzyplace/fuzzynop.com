/**
 * What he does with himself when nothing is asking anything of him. Pure: the Puppeteer asks
 * `decideIdle` at the time a timer it set (with `idleDelay`) wakes the stage, then plays the result.
 *
 * - The pointer is around (moved in the last QUIET s): he stays put and fidgets now and then.
 * - It's been quiet a while: he explores — goes and looks at something (explore.ts). Every so often
 *   (v2.7: the stage now asks desires.ts; this stays as the simple fallback model.)
 * - After a few explorations he finds somewhere to sit, legs over the edge, for a while.
 *
 * No timers here and no clock reads: everything is a function of the inputs, so it's testable.
 */
import { pickVaried } from './moodVariety';
import type { Action } from './poses';

/** On-the-spot things he does. `step` isn't a pose: the Puppeteer walks him a pace toward what he faces. */
export type Fidget = Extract<Action, 'look' | 'scratch' | 'shift' | 'glasses' | 'lookUp' | 'crouch' | 'cower' | 'blink' | 'tilt' | 'wave'> | 'step';
/** The everyday pool (cower and wave only come with a mood). */
export const FIDGETS: readonly Fidget[] = ['look', 'scratch', 'shift', 'glasses', 'lookUp', 'crouch', 'blink', 'tilt', 'step'];
const FIDGET_WEIGHT: Record<Fidget, number> = {
  look: 1.4,
  scratch: 0.8,
  shift: 1.2,
  glasses: 1,
  lookUp: 0.7,
  crouch: 0.5,
  blink: 0.8,
  tilt: 0.8,
  step: 0.5,
  cower: 0,
  wave: 0,
};
/**
 * How he feels about the pointer (trust.ts `band`) reweights the fidgets: wary = nervous glances
 * round, a blink, no stepping closer; shaken = mostly cowering; tolerant = curious head tilts, the
 * odd step toward what he's looking at; warm = easy, looks up and waves (at the pointer: the
 * Puppeteer faces him to it).
 */
export type Feel = 'shaken' | 'wary' | 'tolerant' | 'warm';
const FEEL_WEIGHT: Record<Feel, Partial<Record<Fidget, number>>> = {
  shaken: { cower: 4, look: 1.6, shift: 0.6, scratch: 0, glasses: 0.4, lookUp: 0, crouch: 0, blink: 0.8, tilt: 0, step: 0 },
  wary: { look: 3, glasses: 1.4, shift: 1.4, crouch: 0.2, blink: 1.2, tilt: 0.25, step: 0, lookUp: 0.3 },
  tolerant: { tilt: 1.7, step: 1.1 },
  warm: { lookUp: 1.3, wave: 1.5, glasses: 0.6, look: 0.8, tilt: 1, step: 0.8 },
};
const ALL: readonly Fidget[] = [...FIDGETS, 'cower', 'wave'];

export const QUIET = 5; // s without pointer attention before he wanders off on his own
export const REST_AFTER = 3; // explorations before he looks for a seat
export const SIT_FOR: [number, number] = [16, 28]; // s sat before he gets up again

export type IdleChoice = { kind: 'fidget'; fidget: Fidget } | { kind: 'explore' } | { kind: 'rest' };
export type IdleCtx = {
  quiet: number; // s since the pointer last moved / tapped / the page scrolled
  explored: number; // explorations since he last sat (or since the user was last around)
  recent?: readonly Fidget[]; // the last few fidgets, most recent first (none of the last two again)
  rand: () => number;
  feel?: Feel; // trust band
  stay?: boolean; // he won't wander off: still shaken, or the pointer is resting near him
};

/** A weighted fidget, never one of the last two (shaken: never the last one; his pool is small). */
export function pickFidget(rand: () => number, recent: Fidget | readonly Fidget[] = [], feel: Feel = 'tolerant'): Fidget {
  const w: Partial<Record<Fidget, number>> = {};
  for (const f of ALL) w[f] = FEEL_WEIGHT[feel][f] ?? FIDGET_WEIGHT[f];
  const r = typeof recent === 'string' ? [recent] : recent;
  return pickVaried(w, r, rand, feel === 'shaken' ? 1 : 2) ?? 'look';
}

export function decideIdle(c: IdleCtx): IdleChoice {
  if (c.quiet < QUIET || c.stay) return { kind: 'fidget', fidget: pickFidget(c.rand, c.recent, c.feel) };
  const r = c.rand();
  if (c.explored >= REST_AFTER && r < 0.85) return { kind: 'rest' };
  if (r > 0.86) return { kind: 'fidget', fidget: pickFidget(c.rand, c.recent, c.feel) }; // a pause between finds
  return { kind: 'explore' };
}

/** Seconds until the next idle decision, after `what` just happened. */
export function idleDelay(what: 'settled' | 'fidget' | 'activity' | 'attention' | 'nothing', quiet: number, rand: () => number): number {
  const r = rand();
  switch (what) {
    case 'settled': // just came to rest (stopped walking, landed)
      return 2.2 + r * 2.8;
    case 'fidget':
      return quiet < QUIET ? 3.2 + r * 4 : 1.4 + r * 2;
    case 'activity': // finished doing something at a point of interest
      return 1.2 + r * 2.2;
    case 'attention': // the pointer just moved: wait for it to settle, then maybe fidget
      return 3 + r * 3.5;
    case 'nothing': // tried to explore, nowhere to go
      return 4 + r * 4;
  }
}

/** Sitting: seconds until his legs next swing. */
export const kickDelay = (rand: () => number) => 1.6 + rand() * 3.4;
export const KICK = 1.1; // s per swing of the legs
/** -1..1 shin swing at progress k of a kick (a couple of swings, dying away). */
export const kickAt = (k: number) => (k <= 0 || k >= 1 ? 0 : Math.sin(k * Math.PI * 4) * (1 - k));
