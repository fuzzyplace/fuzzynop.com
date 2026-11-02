import { describe, expect, it } from 'vitest';
import { ACTIVITIES, START, appeal, choose, grow, satisfy, type Activity, type ChoiceCtx } from './desires';
import { rng } from './geometry';

const all = Object.fromEntries(ACTIVITIES.map((a) => [a, true])) as Record<Activity, boolean>;
const ctx = (o: Partial<ChoiceCtx> = {}): ChoiceCtx => ({ band: 'tolerant', cursor: 'watching', quiet: 8, can: all, ...o });

describe('needs', () => {
  it('rise over time and stay in 0..1', () => {
    const n = grow(START, 60, { band: 'tolerant', cursor: 'watching', offscreen: false, busy: false });
    expect(n.curiosity).toBeGreaterThan(START.curiosity);
    expect(n.mischief).toBeGreaterThan(START.mischief);
    for (const v of Object.values(grow(START, 1e5, { band: 'warm', cursor: 'gone', offscreen: true, busy: true }))) {
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
  it('company climbs fast while he is off screen, falls with you near', () => {
    const away = grow(START, 5, { band: 'tolerant', cursor: 'watching', offscreen: true, busy: false });
    const here = grow(START, 5, { band: 'tolerant', cursor: 'near', offscreen: false, busy: false });
    expect(away.company - START.company).toBeGreaterThan(0.3);
    expect(here.company).toBeLessThan(START.company);
  });
  it('shaken, there is no mischief in him', () => {
    expect(grow(START, 100, { band: 'shaken', cursor: 'watching', offscreen: false, busy: false }).mischief).toBe(START.mischief);
  });
  it('doing something eases what it served', () => {
    const n = { ...START, mischief: 0.9 };
    expect(satisfy(n, 'letters').mischief).toBeLessThan(0.5);
    expect(satisfy(n, 'letters').rest).toBeGreaterThan(n.rest);
    expect(satisfy({ ...START, rest: 0.9 }, 'nap').rest).toBeLessThan(0.1);
  });
});

describe('choose', () => {
  it('never repeats the last thing he did', () => {
    const r = rng(7);
    let recent: Activity[] = [];
    for (let i = 0; i < 300; i++) {
      const a = choose({ ...START, curiosity: r(), mischief: r(), company: r(), showoff: r(), rest: r() }, ctx(), recent, r);
      if (recent.length) expect(a).not.toBe(recent[0]);
      recent = [a, ...recent].slice(0, 3);
    }
  });
  it('picks a varied mix over time', () => {
    const r = rng(11);
    let n = { ...START };
    let recent: Activity[] = [];
    const seen = new Set<Activity>();
    for (let i = 0; i < 80; i++) {
      n = grow(n, 8, { band: 'warm', cursor: 'watching', offscreen: false, busy: false });
      const a = choose(n, ctx({ band: 'warm' }), recent, r);
      n = satisfy(n, a);
      seen.add(a);
      recent = [a, ...recent].slice(0, 3);
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });
  it('a strong need wins most of the time', () => {
    const r = rng(3);
    let hits = 0;
    for (let i = 0; i < 200; i++) if (['probe', 'letters'].includes(choose({ curiosity: 0.1, mischief: 1, company: 0.1, showoff: 0.1, rest: 0.05 }, ctx(), [], r))) hits++;
    expect(hits).toBeGreaterThan(110);
  });
  it('never chooses what is not possible', () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const a = choose({ ...START, showoff: 1 }, ctx({ can: { fidget: true, sit: true } }), [], r);
      expect(['fidget', 'sit']).toContain(a);
    }
  });
  it('shaken he only keeps still, watches or sits', () => {
    const w = appeal({ curiosity: 1, mischief: 1, company: 1, showoff: 1, rest: 1 }, ctx({ band: 'shaken' }));
    for (const a of ACTIVITIES) if (!['fidget', 'watch', 'sit'].includes(a)) expect(w[a]).toBe(0);
  });
  it('does not go to you when you are already beside him, or gone', () => {
    expect(appeal({ ...START, company: 1 }, ctx({ cursor: 'near' })).visit).toBe(0);
    expect(appeal({ ...START, company: 1 }, ctx({ cursor: 'gone' })).visit).toBe(0);
  });
});
