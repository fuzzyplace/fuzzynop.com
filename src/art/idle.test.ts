import { describe, expect, it } from 'vitest';
import { rng } from './geometry';
import { FIDGETS, QUIET, REST_AFTER, decideIdle, idleDelay, kickAt, pickFidget } from './idle';

describe('idle', () => {
  it('with the pointer around he only fidgets (never wanders off)', () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) expect(decideIdle({ quiet: QUIET - 0.5, explored: 9, rand: r }).kind).toBe('fidget');
  });

  it('left alone he mostly explores; sometimes the claw has an idea', () => {
    const r = rng(5);
    const kinds = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const k = decideIdle({ quiet: 20, explored: 0, rand: r }).kind;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    expect(kinds.get('explore')!).toBeGreaterThan(600);
    expect(kinds.get('claw')!).toBeGreaterThan(50);
    expect(kinds.get('rest')).toBeUndefined();
  });

  it('after a few finds he looks for a seat', () => {
    const r = rng(8);
    let rest = 0;
    for (let i = 0; i < 200; i++) if (decideIdle({ quiet: 30, explored: REST_AFTER, rand: r }).kind === 'rest') rest++;
    expect(rest).toBeGreaterThan(120);
  });

  it('never the same fidget twice running; all of them turn up', () => {
    const r = rng(11);
    const seen = new Set<string>();
    let last = pickFidget(r);
    for (let i = 0; i < 300; i++) {
      const f = pickFidget(r, last);
      expect(f).not.toBe(last);
      seen.add(f);
      last = f;
    }
    expect(seen.size).toBe(FIDGETS.length);
  });

  it('delays are a few seconds, shorter once he is on his own', () => {
    const r = rng(2);
    for (let i = 0; i < 50; i++) {
      const d = idleDelay('fidget', 1, r);
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(8);
      expect(idleDelay('fidget', 30, r)).toBeLessThan(3.5);
    }
  });

  it('a leg swing dies away', () => {
    expect(kickAt(0)).toBe(0);
    expect(kickAt(1)).toBe(0);
    expect(Math.abs(kickAt(0.1))).toBeGreaterThan(Math.abs(kickAt(0.85)));
  });
});
