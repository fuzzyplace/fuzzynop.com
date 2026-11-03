import { describe, expect, it } from 'vitest';
import { rng } from './geometry';
import { FIDGETS, QUIET, REST_AFTER, decideIdle, idleDelay, kickAt, pickFidget, type Fidget } from './idle';
import { noteRecent } from './moodVariety';

describe('idle', () => {
  it('with the pointer around he only fidgets (never wanders off)', () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) expect(decideIdle({ quiet: QUIET - 0.5, explored: 9, rand: r }).kind).toBe('fidget');
  });

  it('left alone he mostly explores; the claw never has an idea', () => {
    const r = rng(5);
    const kinds = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const k = decideIdle({ quiet: 20, explored: 0, rand: r }).kind;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    expect(kinds.get('explore')!).toBeGreaterThan(600);
    expect(kinds.get('claw')).toBeUndefined();
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

  it('with a memory: none of the last two again, in any mood; shaken never twice running', () => {
    const r = rng(12);
    for (const feel of ['wary', 'tolerant', 'warm'] as const) {
      let recent: Fidget[] = [];
      for (let i = 0; i < 300; i++) {
        const f = pickFidget(r, recent, feel);
        expect(recent.slice(0, 2)).not.toContain(f);
        recent = noteRecent(recent, f);
      }
    }
    let recent: Fidget[] = [];
    for (let i = 0; i < 200; i++) {
      const f = pickFidget(r, recent, 'shaken');
      expect(f).not.toBe(recent[0]);
      recent = noteRecent(recent, f);
    }
  });

  it('moods change what he does: tolerant tilts his head and steps closer, warm waves, wary never steps in', () => {
    const r = rng(13);
    const count = (feel: 'wary' | 'tolerant' | 'warm', f: Fidget) => {
      let n = 0;
      for (let i = 0; i < 600; i++) if (pickFidget(r, undefined, feel) === f) n++;
      return n;
    };
    expect(count('tolerant', 'tilt')).toBeGreaterThan(count('wary', 'tilt') * 3);
    expect(count('warm', 'wave')).toBeGreaterThan(60);
    expect(count('tolerant', 'wave')).toBe(0);
    expect(count('wary', 'step')).toBe(0);
    expect(count('tolerant', 'step')).toBeGreaterThan(30);
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

  it('trust colours the fidgets: shaken he mostly cowers, wary he glances round, never cowers otherwise', () => {
    const r = rng(21);
    const count = (feel: 'shaken' | 'wary' | 'tolerant' | 'warm') => {
      const n = new Map<string, number>();
      for (let i = 0; i < 600; i++) {
        const f = pickFidget(r, undefined, feel);
        n.set(f, (n.get(f) ?? 0) + 1);
      }
      return n;
    };
    expect(count('shaken').get('cower')!).toBeGreaterThan(300);
    expect(count('shaken').get('scratch')).toBeUndefined();
    expect(count('tolerant').get('cower')).toBeUndefined();
    expect(count('wary').get('look')!).toBeGreaterThan(count('tolerant').get('look')!);
  });

  it('he stays put (fidgets only) while asked to, however quiet it is', () => {
    const r = rng(4);
    for (let i = 0; i < 100; i++) expect(decideIdle({ quiet: 60, explored: 9, rand: r, stay: true }).kind).toBe('fidget');
  });
});
