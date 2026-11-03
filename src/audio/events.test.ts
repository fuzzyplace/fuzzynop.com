import { describe, expect, it } from 'vitest';
import { JUMP, PLACE, PLATE_MAX, linesDone, pickCue, plateCues, writtenCue, type PlanLike } from './events';
import { MOUTH_JITTER, MOUTHS, RANGE, SOUNDS } from './mix';

describe('pickCue', () => {
  it('pops once as the claw closes on him, and for nothing else', () => {
    expect(pickCue('grabbed', 'carried')).toEqual({ name: 'pick' });
    expect(pickCue('carried', 'carried')).toBeNull();
    expect(pickCue(null, 'carried')).toBeNull(); // first frame seen
    expect(pickCue('idle', 'grabbed')).toBeNull(); // the claw is still on its way
    expect(pickCue('carried', 'falling')).toBeNull(); // let go: silent
    for (const m of ['idle', 'walking', 'hopping', 'sitting', 'teleport', 'stunt', 'swatting']) expect(pickCue('idle', m)).toBeNull();
  });
});

describe('writtenCue', () => {
  it('pops as each tagline line is finished', () => {
    expect(linesDone([1, 0.4, 0])).toBe(1);
    expect(writtenCue(0, [1, 0, 0])?.name).toBe('pop');
    expect(writtenCue(1, [1, 0.9, 0])).toBeNull(); // mid-line
    expect(writtenCue(1, [1, 1, 0])?.name).toBe('pop');
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
  it('one pop per thing placed, in order, body lines included', () => {
    const cs = plateCues(plan([0.5, 0.9]), 0, 1);
    expect(cs.map((c) => c.name)).toEqual(['pop', 'pop']);
    expect(cs[0].at).toBe(0);
    expect(cs[1].at).toBeGreaterThan(0);
  });
  it('the sheet landing pops too, lowest of all', () => {
    const [sheet] = plateCues(plan([], 'deal', 0.3), 0, 1);
    expect(sheet.rate).toBe(PLACE.sheet.rate);
    expect(PLACE.sheet.rate).toBeLessThan(PLACE.carry.rate);
    expect(PLACE.carry.rate).toBeLessThan(PLACE.deal.rate);
  });
  it('every placement pop settles between 170 and 470 Hz, clear of the 150 Hz floor, at any mouth and any variation', () => {
    const v = 2 ** (RANGE.semis / 12);
    for (const k of ['sheet', 'carry', 'deal'] as const) {
      for (const m of MOUTHS) {
        expect(m.f * (1 - MOUTH_JITTER) * PLACE[k].rate / v).toBeGreaterThanOrEqual(170);
        expect(m.f * (1 + MOUTH_JITTER) * PLACE[k].rate * v).toBeLessThanOrEqual(470);
      }
    }
  });
  it('titles sit rounder and fuller than body lines', () => {
    const [carry] = plateCues(plan([0.5], 'carry'), 0, 1);
    const [deal] = plateCues(plan([0.5], 'deal'), 0, 1);
    expect(carry.rate!).toBeLessThan(deal.rate!);
    expect(carry.gain!).toBeGreaterThan(deal.gain!);
  });
  it('a piece pops exactly once across frames', () => {
    const p = plan([0.5]);
    expect(plateCues(p, 0, 0.5)).toHaveLength(1);
    expect(plateCues(p, 0.5, 0.6)).toHaveLength(0);
  });
  it('scrolling back is silent', () => {
    expect(plateCues(plan([0.5], 'deal', 0.2), 1, 0)).toEqual([]);
  });
  it('a fast scroll never stacks more than a few; a jump pops once', () => {
    const many = plan([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(plateCues(many, 0, 1).length).toBeLessThanOrEqual(PLATE_MAX);
    expect(plateCues(many, 0, JUMP + 0.1)).toHaveLength(1);
  });
  it('ignores bad clocks', () => {
    expect(plateCues(plan([0.5]), NaN, 1)).toEqual([]);
  });
  it('only names sounds that exist', () => {
    for (const c of plateCues(plan([0.5, 0.6], 'carry', 0.2), 0, 1)) expect(SOUNDS[c.name]).toBeDefined();
  });
});
