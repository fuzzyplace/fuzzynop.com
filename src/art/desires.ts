/**
 * What he feels like doing: a handful of needs that rise and fall over time, and a weighted choice
 * among the things he could do now that serve them. Pure: no DOM, no clock; the stage advances the
 * needs by elapsed time (so they keep changing while the loop sleeps), asks `choose` whenever he's
 * free to decide, and `satisfy`s the need an activity served once he's done it.
 *
 * - curiosity: go and look at things (explore), slip inside a plate and poke about its margins.
 * - mischief: probe the page's parts, play with a title's letters.
 * - company: go to the visitor, greet them, sit near. Rises fast while he's off screen (he wants to
 *   be where you are) and when you've stopped moving somewhere away from him.
 * - show-off: the title stunt and tricks (a vanishing act). More when he's warm to you and watched.
 * - rest: sit, nap, watch. Builds while he's busy, eases while he rests.
 *
 * Mood (trust band) shapes everything: shaken he only keeps still and watches; wary he keeps to
 * small, safe things; warm he plays. He never does the same thing twice in a row (moodVariety).
 */
import { clamp } from './geometry';
import { pickVaried } from './moodVariety';

export type Need = 'curiosity' | 'mischief' | 'company' | 'showoff' | 'rest';
export const NEEDS: readonly Need[] = ['curiosity', 'mischief', 'company', 'showoff', 'rest'];
export type Needs = Record<Need, number>;
export type Activity = 'fidget' | 'explore' | 'inside' | 'probe' | 'letters' | 'stunt' | 'visit' | 'sit' | 'nap' | 'watch' | 'vanish';
export const ACTIVITIES: readonly Activity[] = ['fidget', 'explore', 'inside', 'probe', 'letters', 'stunt', 'visit', 'sit', 'nap', 'watch', 'vanish'];
export type Band = 'shaken' | 'wary' | 'tolerant' | 'warm';
/** What the visitor's pointer is doing, as far as he's concerned. */
export type Cursor = 'gone' | 'near' | 'watching' | 'resting' | 'touch';

/** How much of each need an activity takes care of (0..1). */
export const SERVES: Record<Activity, Partial<Needs>> = {
  fidget: { rest: 0.08, curiosity: 0.04 },
  explore: { curiosity: 0.5 },
  inside: { curiosity: 0.55, rest: 0.12 },
  probe: { mischief: 0.6, showoff: 0.12 },
  letters: { mischief: 0.55, showoff: 0.25 },
  stunt: { showoff: 0.85, mischief: 0.2 },
  visit: { company: 0.7 },
  sit: { rest: 0.5, company: 0.08 },
  nap: { rest: 0.85 },
  watch: { rest: 0.25, company: 0.2 },
  vanish: { showoff: 0.3, curiosity: 0.25 },
};
const BASE: Record<Activity, number> = { fidget: 0.12, explore: 0.04, inside: 0.03, probe: 0.02, letters: 0.02, stunt: 0, visit: 0.02, sit: 0.02, nap: 0, watch: 0.05, vanish: 0.01 };

export const START: Needs = { curiosity: 0.5, mischief: 0.25, company: 0.3, showoff: 0.35, rest: 0.1 };

export type GrowCtx = { band: Band; cursor: Cursor; offscreen: boolean; busy: boolean };
/** per-second rise of each need, before mood */
const RATE: Needs = { curiosity: 0.02, mischief: 0.011, company: 0.008, showoff: 0.007, rest: 0.006 };
const MOOD: Record<Band, Needs> = {
  shaken: { curiosity: 0.2, mischief: 0, company: 0.2, showoff: 0, rest: 1.6 },
  wary: { curiosity: 0.8, mischief: 0.35, company: 0.45, showoff: 0.2, rest: 1 },
  tolerant: { curiosity: 1, mischief: 1, company: 1, showoff: 0.9, rest: 1 },
  warm: { curiosity: 1, mischief: 1.4, company: 1.5, showoff: 1.6, rest: 0.9 },
};

/** Needs after `dt` seconds of this situation. */
export function grow(n: Needs, dt: number, c: GrowCtx): Needs {
  const out = { ...n };
  for (const k of NEEDS) {
    let r = RATE[k] * MOOD[c.band][k];
    if (k === 'company') {
      if (c.offscreen) r += 0.09; // you're somewhere else: he'd rather be there too
      else if (c.cursor === 'resting') r += 0.02; // you stopped, away from him
      else if (c.cursor === 'near') r = -0.05; // you're right here
    }
    if (k === 'showoff') r *= c.cursor === 'gone' ? 0.3 : c.cursor === 'watching' || c.cursor === 'resting' ? 1.4 : 1;
    if (k === 'curiosity' && (c.cursor === 'gone' || c.cursor === 'resting')) r *= 1.3; // left to himself
    if (k === 'rest') r = c.busy ? r * 2 : r * 0.6;
    out[k] = clamp(n[k] + r * dt);
  }
  return out;
}

/** Done `a`: the needs it served ease off (by `amount` 0..1 of the full effect, for a cut-short one). */
export function satisfy(n: Needs, a: Activity, amount = 1): Needs {
  const out = { ...n };
  const s = SERVES[a];
  for (const k of NEEDS) out[k] = clamp(n[k] - (s[k] ?? 0) * amount);
  if (a !== 'sit' && a !== 'nap' && a !== 'watch' && a !== 'fidget') out.rest = clamp(out.rest + 0.06 * amount); // busy things tire him a little
  return out;
}

export type ChoiceCtx = {
  band: Band;
  cursor: Cursor;
  quiet: number; // s since the visitor last moved / tapped / scrolled
  can: Partial<Record<Activity, boolean>>; // what's possible from here, now
};

/** Each activity's appeal now (0 = not an option). */
export function appeal(n: Needs, c: ChoiceCtx): Record<Activity, number> {
  const w = {} as Record<Activity, number>;
  for (const a of ACTIVITIES) {
    if (a !== 'fidget' && !c.can[a]) {
      w[a] = 0;
      continue;
    }
    const s = SERVES[a];
    let v = BASE[a];
    for (const k of NEEDS) v += (s[k] ?? 0) * n[k] * n[k] * 2.2; // strong needs dominate
    w[a] = v;
  }
  // mood
  if (c.band === 'shaken') {
    for (const a of ACTIVITIES) if (a !== 'fidget' && a !== 'watch' && a !== 'sit') w[a] = 0;
  } else if (c.band === 'wary') {
    w.letters *= 0.35;
    w.stunt = 0;
    w.probe *= 0.6;
    w.visit *= 0.3;
    w.vanish *= 0.5;
  } else if (c.band === 'warm') {
    w.visit *= 1.3;
    w.stunt *= 1.3;
  }
  // the visitor
  if (c.cursor === 'near') {
    w.explore *= 0.4;
    w.inside *= 0.4;
    w.vanish *= 0.2;
    w.visit = 0; // already here
    w.fidget *= 1.6;
    w.watch *= 1.5;
  }
  if (c.cursor === 'gone') w.visit = 0;
  if (c.quiet < 3) {
    // you're busy moving about: he's more likely to stay put and keep an eye on you
    w.fidget *= 1.5;
    w.watch *= 1.3;
    w.nap *= 0.3;
  }
  if (c.quiet > 20) w.nap *= 1.6;
  return w;
}

/**
 * What he'll do now: weighted by `appeal`, never the activity he did last (nor the one before, when
 * there's anything else on offer).
 */
export function choose(n: Needs, c: ChoiceCtx, recent: readonly Activity[], rand: () => number): Activity {
  const w = appeal(n, c);
  return pickVaried(w, recent, rand, 2) ?? 'fidget';
}

/** Seconds until he next decides, after finishing `what` (a little chance, so it never ticks). */
export function nextIn(what: 'settled' | 'fidget' | 'activity' | 'arrived' | 'nothing', rand: () => number): number {
  const r = rand();
  switch (what) {
    case 'settled':
      return 1.8 + r * 2.6;
    case 'fidget':
      return 1.6 + r * 2.8;
    case 'activity':
      return 1.2 + r * 2.4;
    case 'arrived':
      return 0.9 + r * 1.6;
    case 'nothing':
      return 3 + r * 3;
  }
}

/** A teleport on a whim: at least this long since the last one (unless he needs it to get somewhere). */
export const WHIM_GAP = 20;
