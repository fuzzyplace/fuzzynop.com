import { describe, expect, it } from 'vitest';
import { rng } from './geometry';
import { noteRecent, pickVaried, variety } from './moodVariety';

describe('moodVariety', () => {
  it('never picks one of the last `avoid` while there is anything else', () => {
    const r = rng(1);
    const w = { a: 5, b: 1, c: 1, d: 1 };
    let recent: (keyof typeof w)[] = [];
    for (let i = 0; i < 500; i++) {
      const k = pickVaried(w, recent, r, 2)!;
      expect(recent.slice(0, 2)).not.toContain(k);
      recent = noteRecent(recent, k);
    }
  });

  it('respects weights among what is allowed', () => {
    const r = rng(2);
    const n = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 2000; i++) n[pickVaried({ a: 8, b: 1, c: 1 }, [], r)!]++;
    expect(n.a).toBeGreaterThan(1400);
    expect(n.b).toBeGreaterThan(100);
  });

  it('skips zero weights and relaxes the oldest ban first when the pool is small', () => {
    const r = rng(3);
    expect(pickVaried({ a: 0, b: 2 }, [], r)).toBe('b');
    expect(pickVaried({ a: 0 }, [], r)).toBeUndefined();
    // two options, avoid 2: alternates instead of getting stuck
    expect(pickVaried({ a: 1, b: 1 }, ['a', 'b'], r)).toBe('b');
    expect(pickVaried({ a: 1 }, ['a'], r)).toBe('a'); // only one thing to do
  });

  it('variety() keeps its own memory: no two in a row', () => {
    const v = variety<'x' | 'y' | 'z'>(1);
    const r = rng(4);
    let last: string | undefined;
    for (let i = 0; i < 200; i++) {
      const k = v.pick({ x: 3, y: 1, z: 1 }, r);
      expect(k).not.toBe(last);
      last = k;
    }
    expect(v.recent.length).toBe(3);
  });

  it('noteRecent: most recent first, deduplicated, capped', () => {
    expect(noteRecent(['b', 'a'], 'a', 3)).toEqual(['a', 'b']);
    expect(noteRecent(['c', 'b', 'a'], 'd', 3)).toEqual(['d', 'c', 'b']);
  });
});
