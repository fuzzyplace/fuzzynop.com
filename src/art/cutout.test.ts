import { describe, expect, it } from 'vitest';
import { TEAR_DEPTH, cutLayout, hashSeed, tornPath } from './cutout';

const verts = (d: string) =>
  [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe('tornPath', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const s = hashSeed('practice');
    expect(tornPath(720, 480, s)).toBe(tornPath(720, 480, s));
    expect(tornPath(720, 480, s)).not.toBe(tornPath(720, 480, hashSeed('contact')));
    expect(cutLayout(s)).toEqual(cutLayout(s));
  });

  it('stays inside the plate and never tears deeper than the cap', () => {
    for (const [w, h] of [[342, 610], [720, 480], [1100, 360], [180, 120]]) {
      for (let seed = 1; seed < 40; seed++) {
        const d = tornPath(w, h, seed);
        const v = verts(d);
        expect(v.length).toBeGreaterThan(8);
        expect(d.endsWith('Z')).toBe(true);
        for (const [x, y] of v) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(w);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(h);
          expect(Math.min(x, w - x, y, h - y)).toBeLessThanOrEqual(TEAR_DEPTH + 0.05);
        }
      }
    }
  });

  it('handles unmeasured and tiny plates', () => {
    expect(tornPath(0, 300, 1)).toBe('');
    expect(() => tornPath(20, 10, 3)).not.toThrow();
    const { rot } = cutLayout(7);
    expect(Math.abs(rot)).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(rot)).toBeLessThanOrEqual(1.5);
  });
});
