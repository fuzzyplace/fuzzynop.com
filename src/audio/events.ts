import type { SoundName } from './mix';

/**
 * What the page is doing, turned into sound cues (pure, tested in events.test.ts). The engine feeds
 * these from the bus hooks; nothing here touches Web Audio or the DOM.
 */

export type Cue = { name: SoundName; gain?: number; rate?: number; at?: number; pan?: number };

// ---- the character, frame by frame ----

export type Snap = {
  mode: string;
  x: number;
  y: number;
  hidden: boolean;
  band: string;
  patting: boolean;
  action?: string;
  phase: number;
  walk: number; // gait amplitude 0..1
  ink?: { k: number; out: boolean };
  stunt?: string;
};

/** Modes where a gait phase means feet on a surface. */
const FOOT_MODES = new Set(['walking', 'exploring', 'hopping', 'stunt', 'fidget', 'idle']);
/** Actions that are in the air or on a wall: no footsteps. */
const AIR = new Set(['jump', 'climb', 'fall', 'swat']);
/** Feet fall at these points of the gait cycle. */
const FOOTFALLS = [0, 0.5];
export const STEP_MIN_WALK = 0.25;

/** What each of his actions sounds like as it starts (missing = silent: looking, tilting, thinking). */
export const ACTION_CUE: Partial<Record<string, Cue>> = {
  jump: { name: 'scuff' },
  climb: { name: 'scrabble' },
  land: { name: 'land' },
  swat: { name: 'swish' },
  scratch: { name: 'scratch' },
  shift: { name: 'rustle', gain: 0.6 },
  glasses: { name: 'tap', gain: 0.35, rate: 1.6 },
  crouch: { name: 'rustle', gain: 0.7 },
  tap: { name: 'tap' },
  duck: { name: 'swish', gain: 0.8 },
  cower: { name: 'gasp', gain: 0.6 },
  sit: { name: 'sit' },
  wave: { name: 'rustle', gain: 0.5 },
  hop: { name: 'scuff', gain: 0.7 },
  flinch: { name: 'gasp' },
  shake: { name: 'shake' },
  lie: { name: 'sigh' },
  reach: { name: 'rustle', gain: 0.4 },
  push: { name: 'slide', gain: 0.7 },
};

/** Stunt beats (the title stunt): hanging off a letter, poking one. */
export const STUNT_CUE: Partial<Record<string, Cue>> = {
  cling: { name: 'scrabble', gain: 0.7 },
  poke: { name: 'tap' },
};

/** Footfalls crossed going from gait phase a to b (the shorter way round, so a step back counts too). */
export function footfalls(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  let d = (((b - a) % 1) + 1) % 1;
  if (d > 0.5) d -= 1; // went backwards
  if (d === 0) return 0;
  const lo = d > 0 ? a : a + d;
  const hi = d > 0 ? a + d : a;
  let n = 0;
  for (const f of FOOTFALLS) {
    // count f + k for integer k inside (lo, hi]
    const k0 = Math.ceil(lo - f);
    for (let k = k0; f + k <= hi; k++) if (f + k > lo) n++;
  }
  return n;
}

/** Cues for one drawn frame of the character, given the previous one (null = first frame seen). */
export function frameCues(prev: Snap | null, cur: Snap): Cue[] {
  if (!prev) return [];
  if (cur.hidden && prev.hidden) return [];
  const out: Cue[] = [];
  // claw: comes down on a press, grips, lets go
  if (cur.mode !== prev.mode) {
    if (cur.mode === 'grabbed') out.push({ name: 'whirr', rate: 1.15 });
    else if (cur.mode === 'carried') out.push({ name: 'click', rate: 0.8 });
    else if ((prev.mode === 'carried' || prev.mode === 'grabbed') && cur.mode === 'falling') out.push({ name: 'click', rate: 1.2 }, { name: 'rustle', gain: 0.5, at: 0.03 });
  }
  // ink: running off into drops, gathering again
  const wasOut = !!prev.ink?.out;
  const isOut = !!cur.ink?.out;
  if (isOut && !wasOut) out.push({ name: 'inkOut' });
  else if (wasOut && cur.ink && !cur.ink.out) out.push({ name: 'inkIn' });
  if (cur.hidden || isOut) return out;
  // the start of an action
  if (cur.action && cur.action !== prev.action) {
    const c = ACTION_CUE[cur.action];
    if (c) out.push({ ...c });
  }
  if (cur.stunt && cur.stunt !== prev.stunt) {
    const c = STUNT_CUE[cur.stunt];
    if (c) out.push({ ...c });
  }
  if (cur.patting && !prev.patting) out.push({ name: 'pat' });
  // footsteps: sticky, quieter as the gait eases
  if (FOOT_MODES.has(cur.mode) && cur.walk >= STEP_MIN_WALK && !AIR.has(cur.action ?? '') && !cur.ink) {
    const n = Math.min(2, footfalls(prev.phase, cur.phase));
    for (let i = 0; i < n; i++) out.push({ name: 'step', gain: 0.55 + 0.45 * Math.min(1, cur.walk), at: i * 0.07 });
  }
  return out;
}

/** He's standing (or sitting) still on screen: the breath may play. */
export function breathing(s: Snap | null, w: number, h: number): boolean {
  if (!s || s.hidden || s.ink) return false;
  if (s.mode !== 'idle' && s.mode !== 'sitting') return false;
  if (s.walk > 0.05) return false;
  return s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h;
}

/** The CSS breath (`.char-breathe`, global.css): rise over the first half (inhale), settle over the second. */
export const BREATH_PERIOD = 4.4;
/** Seconds until the next inhale and exhale, given seconds into the cycle. */
export function nextBreath(t: number, period = BREATH_PERIOD): { inhale: number; exhale: number } {
  const p = ((t % period) + period) % period;
  const inhale = p === 0 ? 0 : period - p;
  const exhale = p <= period / 2 ? period / 2 - p : period * 1.5 - p;
  return { inhale, exhale };
}

/** Named moments from the stage's event log (`note`). Most are covered by the frame; these aren't. */
export function noteCues(k: string): Cue[] {
  if (k.startsWith('letters:')) {
    const trick = k.slice(8);
    if (trick === 'stack') return [{ name: 'slide', gain: 0.7 }, { name: 'tap', at: 0.3, gain: 0.6 }];
    if (trick === 'spin') return [{ name: 'slide', rate: 1.3, gain: 0.6 }];
    return [{ name: 'slide' }];
  }
  if (k === 'turn:warm') return [{ name: 'sigh', gain: 0.6, rate: 1.1 }];
  return [];
}

// ---- probes (targets.ts) ----

export function pokeCues(kind: string, win: boolean): Cue[] {
  switch (kind) {
    case 'spin':
      return win ? [{ name: 'tap' }, { name: 'whirr', at: 0.05, rate: 1.3 }, { name: 'click', at: 0.55 }] : [{ name: 'tap' }, { name: 'settle', at: 0.18 }];
    case 'lift':
    case 'peek':
      return [{ name: 'peel', gain: 0.8 }];
    case 'tug':
      return [{ name: 'tap', gain: 0.7 }, { name: 'slide', at: 0.06, gain: 0.5, rate: 1.4 }];
    case 'rattle':
      return win ? [{ name: 'knock' }, { name: 'creak', at: 0.14 }] : [{ name: 'knock' }, { name: 'knock', at: 0.16, gain: 0.8 }];
    case 'twitch':
      return [{ name: 'whirr', rate: 1.4, gain: 0.7 }, { name: 'click', at: 0.12 }];
    case 'tap':
      return [{ name: 'knock', gain: 0.8 }];
    case 'jiggle':
      return [{ name: 'settle' }, { name: 'settle', at: 0.09, gain: 0.7 }];
    case 'flick':
      return [{ name: 'tap', rate: 1.3 }, { name: 'settle', at: 0.12 }];
    default:
      return [];
  }
}

// ---- plate assembly (assembly.ts plans) ----

export type PlanLike = {
  w: number;
  landed: number;
  end: number;
  sheet: { carry: number };
  groups: { box: { x: number; w: number }; mode: 'carry' | 'deal'; t0: number; tW: number; tP: number; tS: number }[];
};

/** Plan seconds of a jump (nav link, focus) rather than playback: only the last moment sounds. */
export const JUMP = 1.5;
export const PLATE_MAX = 4;

/**
 * Cues for an assembly clock moving from t0 to t1. Forwards: the arms arrive with the sheet (wind-up),
 * it lands (slap, ink puff), each piece is picked up (claw click), wound up, pressed (clack), settles
 * (big pieces), the arms park (click). Backwards: pieces lifted back out (click), the sheet peels off.
 */
export function plateCues(p: PlanLike, t0: number, t1: number): Cue[] {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 === t1) return [];
  const fwd = t1 > t0;
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const hit = (t: number) => (fwd ? t > lo && t <= hi : t >= lo && t < hi);
  const panOf = (x: number) => (p.w > 0 ? ((x / p.w) * 2 - 1) * 0.35 : 0);
  const all: (Cue & { t: number })[] = [];
  const add = (t: number, c: Cue) => {
    if (hit(t)) all.push({ ...c, t });
  };
  if (fwd) {
    add(p.sheet.carry, { name: 'windup', gain: 0.7 });
    add(p.landed, { name: 'slap' });
    add(p.landed + 0.04, { name: 'puff' });
    for (const g of p.groups) {
      const pan = panOf(g.box.x + g.box.w / 2);
      add(g.t0, { name: 'click', gain: 0.45, pan });
      add(g.tW, { name: 'windup', gain: 0.5, pan });
      add(g.tP, { name: 'press', gain: g.mode === 'carry' ? 1 : 0.75, pan });
      if (g.mode === 'carry') add(g.tS, { name: 'settle', gain: 0.6, pan });
    }
    add(p.end, { name: 'click', gain: 0.6, rate: 0.85 });
  } else {
    add(p.landed, { name: 'peel' });
    for (const g of p.groups) add(g.tP, { name: 'click', gain: 0.4, pan: panOf(g.box.x + g.box.w / 2) });
  }
  if (!all.length) return [];
  all.sort((a, b) => (fwd ? a.t - b.t : b.t - a.t));
  const keep = hi - lo > JUMP ? all.slice(-1) : all.slice(-PLATE_MAX);
  return keep.map(({ t: _t, ...c }, i) => ({ ...c, at: i * 0.03 }));
}

// ---- the arms (MechArm), pose by pose ----

export const ARM_FAST = 420; // px/s at the tip: faster than any idle sway
export const ARM_HOLD = 0.08; // s it has to keep moving fast before it whirrs
export const ARM_RETRIGGER = 0.3;

type ArmState = { x: number; y: number; t: number; fast: number; moving: boolean; whirred: number };

/** Tracks each arm's tip speed: a whirr when it sets off on a big move (again while it keeps going), a joint click when it stops. */
export class ArmTracker {
  private arms = new WeakMap<object, ArmState>();

  update(key: object, x: number, y: number, now: number): Cue | null {
    const a = this.arms.get(key);
    if (!a) {
      this.arms.set(key, { x, y, t: now, fast: 0, moving: false, whirred: -Infinity });
      return null;
    }
    const dt = now - a.t;
    if (dt <= 0.001) return null;
    const v = Math.hypot(x - a.x, y - a.y) / dt;
    a.x = x;
    a.y = y;
    a.t = now;
    if (dt > 0.2) {
      // it slept: no speed from a gap
      a.fast = 0;
      a.moving = false;
      return null;
    }
    if (v >= ARM_FAST) {
      a.fast += dt;
      if (a.fast >= ARM_HOLD && (!a.moving || now - a.whirred >= ARM_RETRIGGER)) {
        a.moving = true;
        a.whirred = now;
        return { name: 'whirr', rate: Math.min(1.35, 0.85 + v / 4000), gain: Math.min(1, 0.5 + v / 3000) };
      }
      return null;
    }
    a.fast = 0;
    if (a.moving && v < ARM_FAST * 0.5) {
      a.moving = false;
      return { name: 'click', gain: 0.7 };
    }
    return null;
  }
}
