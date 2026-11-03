import { describe, expect, it } from 'vitest';
import { JUMP, PLACE, PLATE_MAX, inkCue, linesDone, plateCues, puppetCues, writtenCue, type PlanLike } from './events';
import { SOUNDS } from './mix';

const names = (prev: string | null, m: string) => puppetCues(prev, m).map((c) => c.name);

describe('puppetCues', () => {
  it('the claw: a clamp as it closes on him, a release as it lets go', () => {
    expect(names('grabbed', 'carried')).toEqual(['clamp']);
    expect(names('carried', 'falling')).toEqual(['release']);
    expect(names('carried', 'carried')).toEqual([]);
    expect(names('idle', 'grabbed')).toEqual([]); // the claw is still on its way
    expect(names('grabbed', 'falling')).toEqual([]); // let go before it closed: nothing to release
  });
  it('a soft thud when he lands after a fall, not when he vanishes mid-fall', () => {
    expect(names('falling', 'idle')).toEqual(['land']);
    expect(names('falling', 'teleport')).toEqual([]);
  });
  it('a flourish as a stunt starts, and nothing as it ends', () => {
    expect(names('idle', 'stunt')).toEqual(['stunt']);
    expect(names('stunt', 'idle')).toEqual([]);
  });
  it('nothing on the first frame seen, or for his everyday moods', () => {
    expect(names(null, 'carried')).toEqual([]);
    expect(names(null, 'stunt')).toEqual([]);
    for (const m of ['walking', 'hopping', 'sitting', 'exploring', 'fidget', 'swatting', 'teleport']) expect(names('idle', m)).toEqual([]);
    for (const m of ['walking', 'hopping', 'sitting']) expect(names(m, 'idle')).toEqual([]);
  });
});

describe('inkCue', () => {
  it('ink out as he runs off into it, ink in as he starts to gather', () => {
    expect(inkCue(undefined, true)?.name).toBe('inkOut');
    expect(inkCue(true, true)).toBeNull(); // still in it (gone counts as out)
    expect(inkCue(true, false)?.name).toBe('inkIn');
    expect(inkCue(false, false)).toBeNull();
    expect(inkCue(false, undefined)).toBeNull(); // done gathering: silent
  });
  it('a gather with no ink-out before it still sounds; nothing on the first frame seen', () => {
    expect(inkCue(undefined, false)?.name).toBe('inkIn');
    expect(inkCue(null, true)).toBeNull();
    expect(inkCue(null, false)).toBeNull();
  });
});

describe('writtenCue', () => {
  it('a scratch as each tagline line is finished', () => {
    expect(linesDone([1, 0.4, 0])).toBe(1);
    expect(writtenCue(0, [1, 0, 0])?.name).toBe('scratch');
    expect(writtenCue(1, [1, 0.9, 0])).toBeNull(); // mid-line
    expect(writtenCue(1, [1, 1, 0])?.name).toBe('scratch');
  });
  it('nothing for lines already written when sound started', () => {
    expect(writtenCue(null, [1, 1, 1])).toBeNull();
    expect(writtenCue(3, [1, 1, 1])).toBeNull();
  });
});

const plan = (tPs: number[], mode: 'carry' | 'deal' = 'deal', landed = -1): PlanLike => ({
  w: 800,
  landed,
  groups: tPs.map((tP, i) => ({ box: { x: i * 100, w: 80 }, mode, tP })),
});

describe('plateCues', () => {
  it('one tick per thing placed, in order, body lines included', () => {
    const cs = plateCues(plan([0.5, 0.9]), 0, 1);
    expect(cs.map((c) => c.name)).toEqual(['tick', 'tick']);
    expect(cs[0].at).toBe(0);
    expect(cs[1].at).toBeGreaterThan(0);
  });
  it('the sheet landing is a thud, first', () => {
    const cs = plateCues(plan([0.5], 'deal', 0.3), 0, 1);
    expect(cs.map((c) => c.name)).toEqual(['sheet', 'tick']);
  });
  it('titles sit lower and fuller than body lines', () => {
    const [carry] = plateCues(plan([0.5], 'carry'), 0, 1);
    const [deal] = plateCues(plan([0.5], 'deal'), 0, 1);
    expect(carry.rate!).toBeLessThan(deal.rate!);
    expect(carry.gain!).toBeGreaterThan(deal.gain!);
    expect(PLACE.carry.rate).toBeLessThan(PLACE.deal.rate);
  });
  it('pans each piece gently by where it sits', () => {
    const cs = plateCues(plan([0.2, 0.3, 0.4]), 0, 1);
    for (const c of cs) expect(Math.abs(c.pan!)).toBeLessThanOrEqual(0.35);
    expect(cs[0].pan!).toBeLessThan(cs[2].pan!);
  });
  it('a piece sounds exactly once across frames', () => {
    const p = plan([0.5]);
    expect(plateCues(p, 0, 0.5)).toHaveLength(1);
    expect(plateCues(p, 0.5, 0.6)).toHaveLength(0);
  });
  it('scrolling back is silent', () => {
    expect(plateCues(plan([0.5], 'deal', 0.2), 1, 0)).toEqual([]);
  });
  it('a fast scroll never stacks more than a few; a jump sounds once', () => {
    const many = plan([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(plateCues(many, 0, 1).length).toBeLessThanOrEqual(PLATE_MAX);
    expect(plateCues(many, 0, JUMP + 0.1)).toHaveLength(1);
  });
  it('ignores bad clocks', () => {
    expect(plateCues(plan([0.5]), NaN, 1)).toEqual([]);
  });
  it('only names sounds that exist', () => {
    const all = [
      ...plateCues(plan([0.5, 0.6], 'carry', 0.2), 0, 1),
      ...puppetCues('carried', 'falling'),
      ...puppetCues('grabbed', 'carried'),
      ...puppetCues('falling', 'idle'),
      ...puppetCues('idle', 'stunt'),
      inkCue(undefined, true)!,
      inkCue(true, false)!,
      writtenCue(0, [1])!,
    ];
    for (const c of all) expect(SOUNDS[c.name]).toBeDefined();
  });
});
