/**
 * The character's local behaviour on a perch: where he may stand, how he walks toward a goal,
 * and the gait that keeps his feet planted. Pure functions, no DOM — the Puppeteer owns the
 * state and the clock; phase 3 can wrap `WalkState` in its state machine unchanged.
 *
 * Units: `x` is a document-space offset in px from the perch's left edge (scroll-invariant).
 * Gait values are in character units (the Character's local coordinates, +x = forward).
 */
import { clamp } from './geometry';

export type Extent = { lo: number; hi: number };
export type WalkState = {
  x: number; // offset along the perch, px from its left edge
  v: number; // px/s, signed
  phase: number; // gait cycle 0..1, advanced by distance walked (never by time)
  walking: boolean;
};
export type WalkCfg = {
  vmax: number; // px/s
  accel: number; // px/s²
  arrive: number; // stop when within this many px of the goal
  restart: number; // start again only once the goal is this far away (hysteresis)
  cycle: number; // px walked per full gait cycle (two steps)
};

export const WALK: WalkCfg = { vmax: 60, accel: 110, arrive: 20, restart: 34, cycle: 52 };

/** Walkable offsets on a perch of `width` px: a margin each side, optionally a centred span. */
export function perchExtent(width: number, margin: number, span?: { center: number; half: number }): Extent {
  let lo = margin;
  let hi = width - margin;
  if (span) {
    lo = Math.max(lo, span.center - span.half);
    hi = Math.min(hi, span.center + span.half);
  }
  if (hi < lo) lo = hi = width / 2; // too narrow to walk: stand in the middle
  return { lo, hi };
}

export const clampTo = (x: number, e: Extent) => clamp(x, e.lo, e.hi);

/**
 * One step toward `goal` (already clamped to the extent): accelerate, cruise at vmax,
 * decelerate on a v² = 2·a·d profile so he eases to a stop inside `arrive` without overshooting.
 */
export function stepWalk(s: WalkState, goal: number, dt: number, e: Extent, cfg: WalkCfg = WALK): WalkState {
  const g = clampTo(goal, e);
  const dx = g - s.x;
  const dist = Math.abs(dx);
  let walking = s.walking || dist > cfg.restart;
  // aim to come to rest half an arrival radius short of the goal
  const room = Math.max(0, dist - cfg.arrive * 0.5);
  const want = walking ? Math.sign(dx) * Math.min(cfg.vmax, Math.sqrt(2 * cfg.accel * room)) : 0;
  const dv = clamp(want - s.v, -cfg.accel * dt, cfg.accel * dt);
  let v = s.v + dv;
  let x = s.x + v * dt;
  // never pass the goal or leave the perch
  if ((dx > 0 && x > g) || (dx < 0 && x < g)) x = g;
  if (x <= e.lo || x >= e.hi) {
    x = clampTo(x, e);
    if ((x === e.lo && v < 0) || (x === e.hi && v > 0)) v = 0;
  }
  if (walking && Math.abs(g - x) <= cfg.arrive && Math.abs(v) < 6) {
    walking = false;
    v = 0;
  }
  const moved = Math.abs(x - s.x);
  const phase = moved ? (s.phase + moved / cfg.cycle) % 1 : s.phase;
  return { x, v, phase, walking };
}

export const settledWalk = (s: WalkState) => !s.walking && s.v === 0;

/**
 * Gait at `phase` (0..1). Each foot spends half the cycle planted, sliding back under the hip
 * at exactly walking speed (so it stays still on the ground), and half swinging forward, lifted.
 * `stride` = foot travel per stance in character units; the Puppeteer derives `cycle` from it.
 */
export type Gait = { footL: { x: number; lift: number }; footR: { x: number; lift: number }; bob: number; arm: number };
export function gait(phase: number, amt: number, stride: number, lift = 3.2, bob = 1): Gait {
  const foot = (p: number) => {
    p = ((p % 1) + 1) % 1;
    if (p < 0.5) return { x: stride * (0.5 - 2 * p) * amt, lift: 0 }; // stance: front → back
    const q = (p - 0.5) * 2; // swing: back → front, arcing up
    return { x: stride * (q - 0.5) * amt, lift: Math.sin(Math.PI * q) * lift * amt };
  };
  return {
    footL: foot(phase),
    footR: foot(phase + 0.5),
    // body rides highest when the stance leg is vertical (p = 0.25, 0.75), lowest at double support
    bob: ((1 - Math.cos(4 * Math.PI * phase)) / 2) * bob * amt,
    // arms counter-swing the legs: right arm forward while the left foot is forward
    arm: Math.cos(2 * Math.PI * phase) * amt,
  };
}

/** Head tilt (radians, +x = face) to glance at a point dx/dy away in screen px, capped. */
export function lookAngle(dx: number, dy: number, max = 0.16) {
  if (Math.abs(dx) + Math.abs(dy) < 1) return 0;
  return clamp(Math.atan2(dy, Math.abs(dx) + 120) * 0.6, -max, max * 0.6);
}
