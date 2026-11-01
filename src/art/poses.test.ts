import { describe, expect, it } from 'vitest';
import { ACT_DUR, FLIP, FOOT_Y, SIT_DY, TURN, actPose, base, envelope, sitLegs, turnPose, type Action } from './poses';

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

  it('envelope is 0 at the ends and 1 in the middle', () => {
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
    expect(envelope(0.5)).toBe(1);
  });
});
