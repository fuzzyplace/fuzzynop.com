import { describe, expect, it } from 'vitest';
import { ACT_DUR, CALM_MOOD, FLIP, FOOT_Y, SIT_DY, TURN, actPose, applyMood, base, envelope, sitLegs, turnPose, type Action } from './poses';
import { HANG_HAND, stuntPose } from './poses'; // ---- stunt ----

const stand = () => base({ x: 0, lift: 0 }, { x: 0, lift: 0 }, 0);
const ACTIONS = Object.keys(ACT_DUR) as Action[];

describe('turn', () => {
  it('is quick: a few frames, not a morph', () => {
    expect(TURN).toBeGreaterThanOrEqual(0.15);
    expect(TURN).toBeLessThanOrEqual(0.25);
  });

  it('never squashes him below 0.9 wide', () => {
    for (const hop of [false, true]) for (let k = 0; k <= 1; k += 0.01) expect(turnPose(k, hop).sx).toBeGreaterThanOrEqual(0.9);
  });

  it('flips once, at FLIP, and the head leads', () => {
    expect(turnPose(FLIP - 0.01, false).flipped).toBe(false);
    expect(turnPose(FLIP, false).flipped).toBe(true);
    expect(turnPose(FLIP * 0.5, false).headBack).toBe(true); // already looking the new way
    expect(turnPose(0.9, false).headBack).toBe(false);
  });

  it('settles back to neutral', () => {
    const end = turnPose(1, false);
    expect(end.sx).toBeCloseTo(1);
    expect(end.dx).toBeCloseTo(0);
    expect(end.cross).toBeCloseTo(0);
    expect(end.lift).toBeCloseTo(0);
  });

  it('a standing turn hops, a walking one steps', () => {
    expect(turnPose(0.5, true).lift).toBeGreaterThan(1);
    expect(turnPose(0.5, false).lift).toBe(0);
    expect(turnPose(FLIP * 0.9, false).cross).toBeLessThan(-4); // front foot across
  });
});

describe('actions', () => {
  it('every on-the-spot action starts and ends at the standing pose', () => {
    const b = stand();
    for (const a of ACTIONS) {
      if (a === 'swat' || a === 'jump' || a === 'climb' || a === 'fall' || a === 'sit') continue;
      for (const k of [0, 1]) {
        const o = actPose(a, k, b);
        expect(o.dy, `${a}@${k}`).toBeCloseTo(0, 1);
        expect(o.lift, `${a}@${k}`).toBeCloseTo(0, 1);
        expect(o.handR[0], `${a}@${k}`).toBeCloseTo(b.handR[0], 0);
        expect(o.handR[1], `${a}@${k}`).toBeCloseTo(b.handR[1], 0);
      }
    }
  });

  it('does not mutate the base pose', () => {
    const b = stand();
    const copy = JSON.stringify(b);
    for (const a of ACTIONS) actPose(a, 0.5, b, 0.5);
    expect(JSON.stringify(b)).toBe(copy);
  });

  it('crouch and duck go down; tap goes up', () => {
    expect(actPose('crouch', 0.5, stand()).dy).toBeGreaterThan(6);
    expect(actPose('duck', 0.15, stand()).dy).toBeGreaterThan(5);
    expect(actPose('tap', 0.47, stand()).lift).toBeGreaterThan(6);
    expect(actPose('tap', 0.47, stand(), 0, 0.5).lift).toBeLessThan(actPose('tap', 0.47, stand()).lift);
  });

  it('looking around turns his head behind him partway through', () => {
    expect(actPose('look', 0.5, stand()).headBack).toBe(true);
    expect(actPose('look', 0.1, stand()).headBack).toBe(false);
  });

  it('sitting: body down onto the edge, shins hang below it and swing with the kick', () => {
    const sat = actPose('sit', 1, stand());
    expect(sat.dy).toBe(SIT_DY);
    expect(sat.legs?.w).toBe(1);
    const foot = sat.legs!.R[4];
    expect(foot[1]).toBeGreaterThan(FOOT_Y + 8); // below the surface
    expect(sitLegs(1).R[4][0]).not.toBeCloseTo(sitLegs(-1).R[4][0], 0);
    expect(actPose('sit', 0, stand()).legs?.w).toBe(0);
  });

  it('reactions read at a glance: flinch leans back fast, wave raises the hand, hop leaves the ground, tilt lifts the chin', () => {
    const b = stand();
    expect(actPose('flinch', 0.12, b).dx).toBeLessThan(-2.5); // recoiled within ~70 ms
    expect(actPose('flinch', 0.5, b).dx).toBeGreaterThan(actPose('flinch', 0.12, b).dx); // easing back
    expect(actPose('wave', 0.5, b).handR[1]).toBeLessThan(-15); // hand up by his head
    expect(actPose('hop', 0.5, b).lift).toBeGreaterThan(3);
    expect(actPose('tilt', 0.5, b).head).toBeLessThan(-0.15);
    expect(actPose('blink', 0.35, b).head).toBeGreaterThan(0.05);
    expect(Math.abs(actPose('blink', 0.35, b).head)).toBeLessThan(0.15); // a dip, not a nod
    expect(actPose('still', 0.5, b)).toEqual(b);
  });

  it('envelope is 0 at the ends and 1 in the middle', () => {
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
    expect(envelope(0.5)).toBe(1);
  });
});

describe('mood posture', () => {
  it('wary hunches: lower, head down, hands in; warm stands taller', () => {
    const b = stand();
    const wary = applyMood(b, { hunch: 1, open: 0, pat: 0 });
    const warm = applyMood(b, { hunch: 0, open: 1, pat: 0 });
    expect(wary.dy).toBeGreaterThan(2);
    expect(wary.head).toBeGreaterThan(0.15);
    expect(wary.handR[0]).toBeLessThan(b.handR[0] - 3);
    expect(warm.dy).toBeLessThan(0);
    expect(wary.dy - warm.dy).toBeGreaterThan(3); // the difference reads at a glance
  });

  it('a pat: he stretches up into it, chin lifting', () => {
    const p = applyMood(stand(), { hunch: 0, open: 1, pat: 1 });
    expect(p.dy).toBeLessThan(-2);
    expect(p.head).toBeLessThan(-0.4);
  });

  it('eases off under an on-the-spot action without popping, rides fully on route actions, and never under a sit', () => {
    const m = { hunch: 1, open: 0, pat: 0 };
    const b = stand();
    expect(applyMood(b, m, 'scratch', 0).dy).toBeCloseTo(applyMood(b, m).dy, 5); // same at the start of an action
    expect(applyMood(b, m, 'scratch', 0.5).dy).toBeLessThan(applyMood(b, m).dy);
    expect(applyMood(b, m, 'jump', 0.5).dy).toBeCloseTo(applyMood(b, m).dy, 5);
    const sat = actPose('sit', 1, b);
    expect(applyMood(sat, m, 'sit', 1).dy).toBe(sat.dy);
    expect(applyMood(b, CALM_MOOD)).toBe(b);
  });
});

// ---- stunt poses ----
describe('stunt poses', () => {
  it('cling: the front hand is on the grip point, every frame', () => {
    const b = stand();
    for (const k of [0, 0.3, 1]) expect(stuntPose('cling', k, b, { sway: 0.8 }).handR).toEqual(HANG_HAND);
    expect(b.handR).toEqual(stand().handR); // never mutates
  });
  it('poke: the hand reaches the target at k = 1, and comes back in regard', () => {
    const b = stand();
    const reach: [number, number] = [16, 8];
    const at = stuntPose('poke', 1, b, { reach }).handR;
    expect(at[0]).toBeCloseTo(16, 5);
    expect(at[1]).toBeCloseTo(8, 5);
    expect(stuntPose('regard', 1, b, { reach }).handR).toEqual(b.handR);
    expect(stuntPose(undefined, 0.5, b)).toBe(b);
  });
});
