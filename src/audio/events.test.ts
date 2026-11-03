import { describe, expect, it } from 'vitest';
import { JUMP, PLATE_MAX, pickCue, plateCues, type PlanLike } from './events';
import { SOUNDS } from './mix';

describe('pickCue', () => {
  it('ticks once as the claw closes on him, and for nothing else', () => {
    expect(pickCue('grabbed', 'carried')).toEqual({ name: 'pick' });
    expect(pickCue('carried', 'carried')).toBeNull();
    expect(pickCue(null, 'carried')).toBeNull(); // first frame seen
    expect(pickCue('idle', 'grabbed')).toBeNull(); // the claw is still on its way
    expect(pickCue('carried', 'falling')).toBeNull(); // let go: silent
    for (const m of ['idle', 'walking', 'hopping', 'sitting', 'teleport', 'stunt', 'swatting']) expect(pickCue('idle', m)).toBeNull();
  });
});

const plan = (tPs: number[], mode: 'carry' | 'deal' = 'carry'): PlanLike => ({
  w: 800,
  groups: tPs.map((tP, i) => ({ box: { x: i * 100, w: 80 }, mode, tP })),
});

describe('plateCues', () => {
  it('one tick per piece placed, in order', () => {
    const cs = plateCues(plan([0.5, 0.9]), 0, 1);
    expect(cs.map((c) => c.name)).toEqual(['tick', 'tick']);
    expect(cs[0].at).toBe(0);
    expect(cs[1].at).toBeGreaterThan(0);
  });
  it('a piece ticks exactly once across frames', () => {
    const p = plan([0.5]);
    expect(plateCues(p, 0, 0.5)).toHaveLength(1);
    expect(plateCues(p, 0.5, 0.6)).toHaveLength(0);
  });
  it('scrolling back is silent', () => {
    expect(plateCues(plan([0.5]), 1, 0)).toEqual([]);
  });
  it('only the key pieces tick (titles, CTA, badges); body lines are silent', () => {
    expect(plateCues(plan([0.5], 'carry'), 0, 1)).toHaveLength(1);
    expect(plateCues(plan([0.5], 'deal'), 0, 1)).toEqual([]);
  });
  it('a fast scroll never stacks more than a couple; a jump ticks once', () => {
    const many = plan([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(plateCues(many, 0, 1).length).toBeLessThanOrEqual(PLATE_MAX);
    expect(plateCues(many, 0, JUMP + 0.1)).toHaveLength(1);
  });
  it('ignores bad clocks', () => {
    expect(plateCues(plan([0.5]), NaN, 1)).toEqual([]);
  });
  it('only names sounds that exist', () => {
    for (const c of plateCues(plan([0.5, 0.6]), 0, 1)) expect(SOUNDS[c.name]).toBeDefined();
  });
});
