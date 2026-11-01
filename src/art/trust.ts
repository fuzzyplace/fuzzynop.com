/**
 * How much the character trusts the visitor's pointer, 0..1, and how shaken he is, 0..1. Pure: no
 * DOM, no clock reads. The Puppeteer classifies what the pointer is doing (`classify`) and reports
 * it with `observe`; the level between two observations is closed-form arithmetic over the time
 * that passed under the earlier condition, so the stage loop can sleep for minutes and wake to the
 * right value (`nextChange` says when it next matters).
 *
 * - He starts wary. A calm presence (near-ish and moving gently, or resting) earns trust slowly:
 *   about a minute of it from wary to full. Being left alone warms him up a little, never fully.
 * - Fast, erratic movement near him and chasing him cost a little; so does each swatting episode.
 * - Being grabbed spikes fear and knocks trust down sharply. Fear fades over ~half a minute and holds
 *   the trust gain back while it does.
 *
 * Behaviour reads off `band` (and the helpers below it): how close he lets the pointer come, whether
 * he swats, whether he wanders.
 */
export type Cond =
  | 'calm' // near-ish and gentle, or resting near him
  | 'alone' // no pointer about (touch between taps, mouse far / gone)
  | 'neutral' // around, neither calm nor rough
  | 'rough' // fast, erratic movement near him
  | 'chase' // coming at him
  | 'held'; // in your hand: fear doesn't fade, nothing is earned

export type Trust = {
  v: number; // trust at `at`
  fear: number; // fear at `at` (fades exponentially from there)
  at: number; // ms
  cond: Cond; // what has been going on since `at`
  tapAt: number; // ms of the last tap counted (touch)
  full: boolean; // has reached FULL at least once
};

export const START = 0.15;
export const FULL = 0.95;
export const CALM_FULL = 60; // s of calm from START to 1 (no fear)
export const CALM_RATE = (1 - START) / CALM_FULL; // per s
export const ALONE_RATE = CALM_RATE / 3.5; // per s, left alone
export const ALONE_CAP = 0.75; // being left alone never earns full trust
export const ROUGH_RATE = 0.08; // per s lost to fast movement near him
export const CHASE_RATE = 0.14; // per s lost while coming at him
export const SWAT_COST = 0.03; // per swatting episode
export const TAP_GAIN = 0.05; // a gentle tap nearby (touch)
export const TAP_RUSH = 0.02; // lost to taps hammered in quick succession
export const TAP_GAP = 0.8; // s between taps for one to count as gentle
export const FEAR_TAU = 12; // s, fear's time constant
export const SHAKEN = 0.25; // fear above this: trembling, cowering, keeps well away, startles early
export const UNEASY = 0.1; // fear above this: no wandering off
export const BANDS = [0.4, 0.75] as const; // wary | tolerant | warm

// classify thresholds
export const NEAR = 60; // px: closer than this, moving isn't "calm" (resting still is)
export const FAR = 300; // px: further than this he's left alone
export const GENTLE = 380; // px/s
export const ERRATIC = 1100; // px/s
export const CHASE_V = 260; // px/s of approach
export const CHASE_D = 160; // px
export const REST = 0.8; // s still before a pointer counts as resting

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const initTrust = (now: number, v = START): Trust => ({ v, fear: 0, at: now, cond: 'alone', tapAt: -Infinity, full: v >= FULL });

/** Fear `dt` s after `t.at`. */
export const fearAt = (t: Trust, now: number) => (t.cond === 'held' ? t.fear : t.fear * Math.exp(-Math.max(0, now - t.at) / 1000 / FEAR_TAU));

/** ∫₀ᵀ (1 − f·e^(−s/τ))² ds: calm time, discounted by fear as it fades. */
function earned(T: number, f: number) {
  const tau = FEAR_TAU;
  return T - 2 * f * tau * (1 - Math.exp(-T / tau)) + ((f * f * tau) / 2) * (1 - Math.exp((-2 * T) / tau));
}

/** Trust after `T` s under `cond`, from v with fear f. */
function after(v: number, f: number, cond: Cond, T: number) {
  if (T <= 0) return v;
  switch (cond) {
    case 'calm':
      return clamp01(v + CALM_RATE * earned(T, f));
    case 'alone':
      return v >= ALONE_CAP ? v : Math.min(ALONE_CAP, v + ALONE_RATE * earned(T, f));
    case 'rough':
      return clamp01(v - ROUGH_RATE * T);
    case 'chase':
      return clamp01(v - CHASE_RATE * T);
    case 'neutral':
    case 'held':
      return v;
  }
}

/** Bring `t` up to `now` (under the condition that has held since `t.at`). */
export function advance(t: Trust, now: number): Trust {
  if (now <= t.at) return t;
  const v = after(t.v, t.fear, t.cond, (now - t.at) / 1000);
  return { ...t, v, fear: fearAt(t, now), at: now, full: t.full || v >= FULL };
}

/** Bring `t` up to `now`, then note what's going on from here. */
export function observe(t: Trust, now: number, cond: Cond): Trust {
  const a = advance(t, now);
  return a.cond === cond ? a : { ...a, cond };
}

/** He's been grabbed: trust drops sharply, fear spikes. */
export function scare(t: Trust, now: number): Trust {
  const a = advance(t, now);
  return { ...a, v: Math.max(0, Math.min(a.v * 0.35, a.v - 0.25)), fear: 1 };
}

/** A one-off change (a swatting episode, a tap). */
export function nudge(t: Trust, now: number, dv: number): Trust {
  const a = advance(t, now);
  const v = clamp01(a.v + dv);
  return { ...a, v, full: a.full || v >= FULL };
}

/** A touch tap `d` px from him (not on him): gentle ones earn a little; hammering costs. */
export function tap(t: Trust, now: number, d: number): Trust {
  if (d < NEAR || d > FAR) return advance(t, now);
  const gentle = (now - t.tapAt) / 1000 >= TAP_GAP;
  const n = nudge(t, now, gentle ? TAP_GAIN * (1 - fearAt(t, now)) ** 2 : -TAP_RUSH);
  return { ...n, tapAt: now };
}

export type Sense = {
  d: number | null; // px from him to the pointer; null = no pointer about
  speed: number; // px/s, smoothed
  approach: number; // px/s toward him (+) or away (−), smoothed
  still: number; // s since the pointer last moved
  touch: boolean; // the last input was touch (taps are counted by `tap`, not here)
};

/** What the pointer is doing, as far as he's concerned. */
export function classify(p: Sense): Cond {
  if (p.d === null || p.touch || p.d > FAR) return 'alone';
  if (p.still >= REST) return 'calm';
  if (p.approach > CHASE_V && p.d < CHASE_D) return 'chase';
  if (p.speed > ERRATIC) return 'rough';
  if (p.speed <= GENTLE && p.d >= NEAR) return 'calm';
  return 'neutral';
}

export type Band = 'shaken' | 'wary' | 'tolerant' | 'warm';
export function band(t: Trust, now: number): Band {
  if (fearAt(t, now) >= SHAKEN) return 'shaken';
  const v = advance(t, now).v;
  return v < BANDS[0] ? 'wary' : v < BANDS[1] ? 'tolerant' : 'warm';
}

/** px: a moving pointer this close and he swats at it (0 = he doesn't). Shaken: further, and sooner. */
export function pesterDist(t: Trust, now: number) {
  const b = band(t, now);
  return b === 'shaken' ? 60 + 60 * fearAt(t, now) : b === 'wary' ? 60 : 0;
}

/** px he keeps from the pointer along his perch (stepped, so a slow rise doesn't keep him shuffling). */
export function keepGap(t: Trust, now: number) {
  switch (band(t, now)) {
    case 'shaken':
      return 220;
    case 'wary':
      return 150;
    case 'tolerant':
      return 85;
    case 'warm':
      return 42;
  }
}

/** Fear still high enough that he won't wander off on his own. */
export const uneasy = (t: Trust, now: number) => fearAt(t, now) >= UNEASY;

/**
 * Seconds from `now` until something that changes his behaviour happens under the current
 * condition: trust crossing a band or FULL, fear dropping below SHAKEN / UNEASY. null = never.
 */
export function nextChange(t: Trust, now: number): number | null {
  const a = advance(t, now);
  let best: number | null = null;
  const take = (s: number) => {
    if (s > 0 && (best === null || s < best)) best = s;
  };
  if (a.cond !== 'held') {
    for (const th of [SHAKEN, UNEASY]) if (a.fear >= th) take(FEAR_TAU * Math.log(a.fear / th) + 0.05);
  }
  const rising = a.cond === 'calm' || a.cond === 'alone';
  if (rising) {
    const top = a.cond === 'alone' ? ALONE_CAP : 1;
    const target = [...BANDS, FULL].find((th) => th > a.v && th <= top);
    if (target !== undefined) {
      // trust rises monotonically: bisect for the crossing (fear makes it non-linear)
      let lo = 0;
      let hi = 1;
      while (after(a.v, a.fear, a.cond, hi) < target && hi < 1e5) hi *= 2;
      if (after(a.v, a.fear, a.cond, hi) >= target) {
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (after(a.v, a.fear, a.cond, mid) >= target) hi = mid;
          else lo = mid;
        }
        take(hi + 0.05);
      }
    }
  }
  return best;
}
