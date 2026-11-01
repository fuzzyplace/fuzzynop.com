/**
 * What he does with himself when nothing is asking anything of him. Pure: the Puppeteer asks
 * `decideIdle` at the time a timer it set (with `idleDelay`) wakes the stage, then plays the result.
 *
 * - The pointer is around (moved in the last QUIET s): he stays put and fidgets now and then.
 * - It's been quiet a while: he explores — goes and looks at something (explore.ts). Every so often
 *   the claw interrupts with an idea of its own (it's a bit possessive).
 * - After a few explorations he finds somewhere to sit, legs over the edge, for a while.
 *
 * No timers here and no clock reads: everything is a function of the inputs, so it's testable.
 */
import type { Action } from './poses';

export type Fidget = Extract<Action, 'look' | 'scratch' | 'shift' | 'glasses' | 'lookUp' | 'crouch'>;
export const FIDGETS: readonly Fidget[] = ['look', 'scratch', 'shift', 'glasses', 'lookUp', 'crouch'];
const FIDGET_WEIGHT: Record<Fidget, number> = { look: 1.4, scratch: 0.8, shift: 1.2, glasses: 1, lookUp: 0.7, crouch: 0.5 };

export const QUIET = 5; // s without pointer attention before he wanders off on his own
export const REST_AFTER = 3; // explorations before he looks for a seat
export const SIT_FOR: [number, number] = [16, 28]; // s sat before he gets up again
export const CLAW_CHANCE = 0.08; // of a quiet decision going to the claw instead of to him

export type IdleChoice = { kind: 'fidget'; fidget: Fidget } | { kind: 'explore' } | { kind: 'rest' } | { kind: 'claw' };
export type IdleCtx = {
  quiet: number; // s since the pointer last moved / tapped / the page scrolled
  explored: number; // explorations since he last sat (or since the user was last around)
  last?: Fidget; // the previous fidget (not twice in a row)
  rand: () => number;
};

/** A weighted fidget, never the same as `last`. */
export function pickFidget(rand: () => number, last?: Fidget): Fidget {
  const pool = FIDGETS.filter((f) => f !== last);
  const total = pool.reduce((t, f) => t + FIDGET_WEIGHT[f], 0);
  let r = rand() * total;
  for (const f of pool) {
    r -= FIDGET_WEIGHT[f];
    if (r <= 0) return f;
  }
  return pool[pool.length - 1];
}

export function decideIdle(c: IdleCtx): IdleChoice {
  if (c.quiet < QUIET) return { kind: 'fidget', fidget: pickFidget(c.rand, c.last) };
  const r = c.rand();
  if (r < CLAW_CHANCE) return { kind: 'claw' };
  if (c.explored >= REST_AFTER && r < 0.85) return { kind: 'rest' };
  if (r > 0.86) return { kind: 'fidget', fidget: pickFidget(c.rand, c.last) }; // a pause between finds
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
