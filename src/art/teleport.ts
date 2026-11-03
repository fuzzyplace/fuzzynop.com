/**
 * Teleporting: he runs off into ink and gathers himself again somewhere else. Pure: no DOM, no
 * clock. The stage starts a hop with `startHop`, reads `hopPhase` each frame (the Character draws
 * the ink by `Pose.ink`), and picks where he reappears with `chooseDest`.
 *
 *   out  (OUT s): the body slumps and runs off him in drops that fall and splat; a puddle, drying
 *   gone (a beat, longer when he's going far)
 *   in   (IN s): drops rise from a puddle at the new spot and gather into him
 *   then he shakes himself off (poses.ts 'shake'), played by the stage as an ordinary act.
 *
 * When: there's no way to walk / jump / climb there; he's been off screen a few seconds and wants
 * company; the surface under him is going (a plate taken apart); slipping in and out of a plate; or
 * on a whim (desires.ts `vanish`, at most every WHIM_GAP s).
 */
import type { Pt } from './geometry';

export const OUT = 0.5; // s (v2.9, was 0.7: less of a read-through spent in ink)
export const IN = 0.55; // s (was 0.75)
export type Hop = { at: number; out: number; gap: number; in: number; instant: boolean };
export type HopPhase = { phase: 'out' | 'gone' | 'in' | 'done'; k: number };

/** A hop starting at `now` (ms). `far`: px between the spots (a longer beat in between); `instant`: reduced motion or nobody sees it. */
export function startHop(now: number, far: number, instant = false): Hop {
  if (instant) return { at: now, out: 0, gap: 0, in: 0, instant: true };
  // a short hop (a nook to the next one in the same plate) is quicker still
  const k = far < 320 ? 0.72 : 1;
  return { at: now, out: OUT * k, gap: Math.min(0.4, 0.1 + far / 2400), in: IN * k, instant: false };
}
export function hopPhase(h: Hop, now: number): HopPhase {
  if (h.instant) return { phase: 'done', k: 1 };
  const t = (now - h.at) / 1000;
  if (t < h.out) return { phase: 'out', k: t / h.out };
  if (t < h.out + h.gap) return { phase: 'gone', k: (t - h.out) / Math.max(1e-6, h.gap) };
  if (t < h.out + h.gap + h.in) return { phase: 'in', k: (t - h.out - h.gap) / h.in };
  return { phase: 'done', k: 1 };
}
export const hopDur = (h: Hop) => h.out + h.gap + h.in;

/** Somewhere he could reappear (document px, feet). `inside`: a nook in a plate. */
export type Spot = {
  id: string;
  i: number;
  x: number;
  y: number;
  inside: boolean;
  /**
   * While the page scrolls: s he'd have in view there once gathered, at today's scroll speed (the
   * stage works it out, pinned plates included). Absent: the page is still (or it isn't known).
   */
  stay?: number;
};
export type DestOpts = {
  focus: Pt | null; // where the visitor's attention is (pointer, last tap), document px; null = the middle of the view
  view: { left: number; right: number; top: number; bottom: number }; // document px, already clear of the header
  me: Pt | null; // where he is now (null = nowhere on screen)
  recent?: readonly string[]; // spots he's just been (less appealing)
  prefer?: 'inside' | 'outside';
  rand: () => number;
  near?: number; // px from the focus he likes to land (default 220): close enough to be company, not on top of you
  /**
   * The visitor is scrolling (1 down, -1 up): spots that the scroll is about to carry out of view
   * (within `px` of the view's top going down, of its bottom going up) are less appealing.
   */
  drift?: { dir: 1 | -1; px: number };
};

/** s he must still have in view once gathered somewhere while the page scrolls (or it isn't worth going) */
export const STAY_MIN = 0.3;
/** s of staying in view past which a spot is no better for it */
export const STAY_FULL = 5;

/** The best spot to reappear at, or null if none is on screen. */
export function chooseDest(spots: readonly Spot[], o: DestOpts): Spot | null {
  const f = o.focus ?? { x: (o.view.left + o.view.right) / 2, y: (o.view.top + o.view.bottom) / 2 };
  const near = o.near ?? 220;
  let best: Spot | null = null;
  let bestS = -Infinity;
  for (const s of spots) {
    if (s.x < o.view.left || s.x > o.view.right || s.y < o.view.top || s.y > o.view.bottom) continue;
    if (o.me && Math.hypot(s.x - o.me.x, s.y - o.me.y) < 60) continue; // somewhere else, not a step away
    const d = Math.hypot(s.x - f.x, (s.y - f.y) * 1.3);
    if (d < 70) continue; // never right under your pointer
    let score = -Math.abs(d - near) / 160;
    if (o.recent?.includes(s.id)) score -= 1.2;
    if (o.prefer === 'inside') score += s.inside ? 1.5 : -0.8;
    if (o.prefer === 'outside') score += s.inside ? -1 : 0.3;
    if (s.stay !== undefined) {
      // the scroll is moving: somewhere it'll keep him in view a while, never somewhere it takes him straight out of it
      if (s.stay < STAY_MIN) continue;
      score += 2.5 * Math.min(1, s.stay / STAY_FULL);
    } else if (o.drift) {
      const room = o.drift.dir > 0 ? s.y - o.view.top : o.view.bottom - s.y;
      score -= 1.6 * Math.max(0, 1 - room / o.drift.px);
    }
    score += o.rand() * 0.8;
    if (score > bestS) {
      bestS = score;
      best = s;
    }
  }
  return best;
}
