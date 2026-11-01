import { describe, expect, it } from 'vitest';
import { WALK, clampTo, gait, lookAngle, perchExtent, settledWalk, stepWalk, type WalkState } from './walk';

const still = (x: number): WalkState => ({ x, v: 0, phase: 0, walking: false });
function run(s: WalkState, goal: number, e = perchExtent(1000, 40), secs = 30, dt = 1 / 60) {
  let vmax = 0;
  let steps = 0;
  for (let t = 0; t < secs; t += dt) {
    s = stepWalk(s, goal, dt, e);
    vmax = Math.max(vmax, Math.abs(s.v));
    steps++;
    if (settledWalk(s)) break;
  }
  return { s, vmax, secs: steps * dt };
}

describe('perchExtent', () => {
  it('keeps a margin each side', () => {
    expect(perchExtent(400, 36)).toEqual({ lo: 36, hi: 364 });
  });
  it('narrows to a span when given', () => {
    expect(perchExtent(1440, 40, { center: 1300, half: 260 })).toEqual({ lo: 1040, hi: 1400 });
  });
  it('collapses to the middle when too narrow', () => {
    expect(perchExtent(50, 36)).toEqual({ lo: 25, hi: 25 });
  });
});

describe('stepWalk', () => {
  it('walks to the goal, stops within the arrival radius, never exceeds vmax', () => {
    const { s, vmax, secs } = run(still(100), 600);
    expect(Math.abs(600 - s.x)).toBeLessThanOrEqual(WALK.arrive);
    expect(s.v).toBe(0);
    expect(vmax).toBeLessThanOrEqual(WALK.vmax + 1e-9);
    // ~500 px at 60 px/s plus easing in and out
    expect(secs).toBeGreaterThan(500 / WALK.vmax);
    expect(secs).toBeLessThan(500 / WALK.vmax + 2);
  });

  it('eases in: starts slow', () => {
    const s = stepWalk(still(100), 600, 1 / 60, perchExtent(1000, 40));
    expect(s.v).toBeGreaterThan(0);
    expect(s.v).toBeLessThan(5);
  });

  it('does not start for a goal inside the restart radius (no jitter)', () => {
    const s = stepWalk(still(100), 100 + WALK.restart - 1, 1 / 60, perchExtent(1000, 40));
    expect(s.walking).toBe(false);
    expect(s.x).toBe(100);
  });

  it('stops at the perch edge when the goal is beyond it', () => {
    const e = perchExtent(1000, 40);
    const { s } = run(still(500), 5000, e);
    expect(s.x).toBeLessThanOrEqual(e.hi);
    expect(e.hi - s.x).toBeLessThanOrEqual(WALK.arrive);
    const back = run(still(500), -5000, e).s;
    expect(back.x).toBeGreaterThanOrEqual(e.lo);
  });

  it('never leaves the extent even if it starts outside or moves fast', () => {
    const e = perchExtent(300, 40);
    let s: WalkState = { x: 250, v: 60, phase: 0, walking: true };
    for (let i = 0; i < 600; i++) {
      s = stepWalk(s, 9999, 1 / 60, e);
      expect(s.x).toBeLessThanOrEqual(e.hi);
    }
    expect(clampTo(-10, e)).toBe(e.lo);
  });

  it('advances the gait by distance, not time', () => {
    const idle = stepWalk({ ...still(100), phase: 0.3 }, 105, 1, perchExtent(1000, 40));
    expect(idle.phase).toBe(0.3);
    let s = still(100);
    let walked = 0;
    for (let i = 0; i < 120; i++) {
      const n = stepWalk(s, 900, 1 / 60, perchExtent(1000, 40));
      walked += Math.abs(n.x - s.x);
      s = n;
    }
    expect(s.phase).toBeCloseTo((walked / WALK.cycle) % 1, 6);
  });
});

describe('gait', () => {
  it('keeps the planted foot still on the ground (no foot sliding)', () => {
    // body moves forward d px; planted foot moves back d px relative to the hip
    const stride = 14;
    const scale = 1.85;
    const cycle = 2 * stride * scale;
    for (const p of [0.05, 0.2, 0.35]) {
      const dp = 0.01;
      const a = gait(p, 1, stride).footL;
      const b = gait(p + dp, 1, stride).footL;
      expect(a.lift).toBe(0);
      const bodyPx = dp * cycle;
      const footWorldPx = bodyPx + (b.x - a.x) * scale;
      expect(Math.abs(footWorldPx)).toBeLessThan(1e-9);
    }
  });
  it('alternates the feet: one planted while the other swings', () => {
    const g = gait(0.7, 1, 14);
    expect(g.footR.lift).toBe(0);
    expect(g.footL.lift).toBeGreaterThan(0);
    const h = gait(0.2, 1, 14);
    expect(h.footL.lift).toBe(0);
    expect(h.footR.lift).toBeGreaterThan(0);
  });
  it('is the rest pose at zero amplitude', () => {
    const g = gait(0.37, 0, 14);
    expect([g.footL.x, g.footL.lift, g.footR.x, g.footR.lift, g.bob, g.arm].every((v) => v === 0 || Object.is(v, -0))).toBe(true);
  });
});

describe('lookAngle', () => {
  it('tilts up toward a cursor above, less so below, and is capped', () => {
    expect(lookAngle(100, -400)).toBeLessThan(0);
    expect(lookAngle(100, 400)).toBeGreaterThan(0);
    expect(Math.abs(lookAngle(0, -1e6))).toBeLessThanOrEqual(0.16);
    expect(lookAngle(0, 0)).toBe(0);
  });
});
