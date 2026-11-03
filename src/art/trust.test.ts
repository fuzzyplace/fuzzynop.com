import { describe, expect, it } from 'vitest';
import {
  ALONE_CAP,
  BANDS,
  FULL,
  SHAKEN,
  START,
  UNEASY,
  advance,
  band,
  classify,
  fearAt,
  freeze,
  initTrust,
  keepGap,
  nextChange,
  nudge,
  observe,
  pesterDist,
  scare,
  tap,
  thaw,
  uneasy,
  type Cond,
  type Sense,
  type Trust,
} from './trust';

const S = 1000;
const sense = (o: Partial<Sense>): Sense => ({ d: 150, speed: 0, approach: 0, still: 2, touch: false, ...o });
/** Seconds under `cond` from `t` until trust reaches `v` (or Infinity). */
const until = (t: Trust, cond: Cond, v: number) => {
  const o = observe(t, t.at, cond);
  for (let s = 0; s <= 120; s += 0.05) if (advance(o, t.at + s * S).v >= v) return s;
  return Infinity;
};

describe('trust', () => {
  it('starts wary: keeps his distance and swats', () => {
    const t = initTrust(0);
    expect(t.v).toBe(START);
    expect(band(t, 0)).toBe('wary');
    expect(pesterDist(t, 0)).toBe(60);
    expect(keepGap(t, 0)).toBeGreaterThan(keepGap(nudge(t, 0, 0.4), 0));
  });

  it('calm attention: tolerant in 1.5–3 s, full trust in 6–10 s', () => {
    const t = initTrust(0);
    expect(until(t, 'calm', BANDS[0])).toBeGreaterThanOrEqual(1.5);
    expect(until(t, 'calm', BANDS[0])).toBeLessThanOrEqual(3);
    expect(until(t, 'calm', FULL)).toBeGreaterThanOrEqual(6);
    expect(until(t, 'calm', FULL)).toBeLessThanOrEqual(10);
    expect(advance(observe(t, 0, 'calm'), 10 * S).full).toBe(true);
  });

  it('ordinary mouse movement around him earns too, a little slower; a pat earns fastest', () => {
    const t = initTrust(0);
    const easy = until(t, 'easy', FULL);
    expect(easy).toBeGreaterThan(until(t, 'calm', FULL));
    expect(easy).toBeLessThanOrEqual(10);
    expect(until(t, 'pat', FULL)).toBeLessThan(until(t, 'calm', FULL));
  });

  it('the level after a long sleep equals the level stepped frame by frame', () => {
    const t0 = observe(scare(nudge(initTrust(0), 0, 0.5), 0), 0, 'calm');
    let t = t0;
    for (let ms = 16; ms <= 40 * S; ms += 16) t = observe(t, ms, 'calm');
    const once = advance(t0, t.at);
    expect(once.v).toBeCloseTo(t.v, 3);
    expect(once.fear).toBeCloseTo(t.fear, 6);
  });

  it('left alone he warms up a little, never fully', () => {
    const t = observe(initTrust(0), 0, 'alone');
    const later = advance(t, 3600 * S);
    expect(later.v).toBe(ALONE_CAP);
    expect(later.v).toBeLessThan(BANDS[1]);
    expect(advance(t, 10 * S).v).toBeGreaterThan(START);
    expect(advance(t, 10 * S).v).toBeLessThan(BANDS[0]); // not tolerant just for being ignored a moment
  });

  it('rough movement and chasing cost trust; neutral costs nothing', () => {
    const t = nudge(initTrust(0), 0, 0.4);
    expect(advance(observe(t, 0, 'rough'), 1 * S).v).toBeLessThan(t.v);
    expect(advance(observe(t, 0, 'chase'), 1 * S).v).toBeLessThan(advance(observe(t, 0, 'rough'), 1 * S).v);
    expect(advance(observe(t, 0, 'rough'), 1 * S).v).toBeGreaterThan(t.v - 0.25); // a burst doesn't undo it all
    expect(advance(observe(t, 0, 'neutral'), 60 * S).v).toBe(t.v);
  });

  it('a grab: trust drops sharply, he is shaken for 8–15 s, then recovers', () => {
    const warm = nudge(initTrust(0), 0, 0.8);
    expect(band(warm, 0)).toBe('warm');
    const t = observe(scare(warm, 0), 0, 'calm');
    expect(t.v).toBeLessThan(warm.v * 0.4);
    expect(t.fear).toBe(1);
    expect(band(t, 0)).toBe('shaken');
    expect(pesterDist(t, 0)).toBeGreaterThan(60); // startles sooner
    expect(keepGap(t, 0)).toBeGreaterThan(keepGap(initTrust(0), 0)); // keeps well away
    expect(band(t, 8 * S)).toBe('shaken');
    expect(band(t, 15 * S)).not.toBe('shaken');
    expect(uneasy(t, 12 * S)).toBe(true);
    expect(uneasy(t, 25 * S)).toBe(false);
    // fear holds the calm gain back
    const unafraid = observe(nudge(initTrust(0), 0, t.v - START), 0, 'calm');
    expect(advance(t, 6 * S).v).toBeLessThan(advance(unafraid, 6 * S).v);
    // and with calm attention he's back to trusting you within half a minute
    expect(advance(t, 30 * S).v).toBeGreaterThanOrEqual(BANDS[1]);
  });

  it('held in the hand: fear does not fade and nothing is earned', () => {
    const t = observe(scare(initTrust(0), 0), 0, 'held');
    expect(fearAt(t, 30 * S)).toBe(1);
    expect(advance(t, 30 * S).v).toBe(t.v);
  });

  it('touch: a few gentle taps nearby make him tolerant; hammering and far-off taps do not', () => {
    let t = initTrust(0);
    t = tap(t, 0, 150);
    expect(t.v).toBeGreaterThan(START + 0.1);
    const v = t.v;
    t = tap(t, 200, 150); // too soon
    expect(t.v).toBeLessThan(v);
    expect(tap(initTrust(0), 0, 500).v).toBe(START);
    expect(tap(initTrust(0), 0, 20).v).toBe(START); // on him: that's a grab, not a tap
    let g = initTrust(0);
    for (let i = 0; i < 3; i++) g = tap(g, i * S, 120);
    expect(band(g, 3 * S)).toBe('tolerant');
  });

  it('touch: lingering on a section builds trust slowly', () => {
    const t = initTrust(0);
    const linger = until(t, 'linger', BANDS[0]);
    expect(linger).toBeGreaterThan(until(t, 'calm', BANDS[0]) * 2);
    expect(linger).toBeLessThan(15);
    expect(classify(sense({ touch: true, linger: true }))).toBe('linger');
    expect(classify(sense({ touch: true }))).toBe('alone');
  });

  it('classify', () => {
    expect(classify(sense({ d: null }))).toBe('alone');
    expect(classify(sense({ d: 400 }))).toBe('alone');
    expect(classify(sense({ still: 3 }))).toBe('calm');
    expect(classify(sense({ d: 30, still: 3 }))).toBe('calm'); // resting right beside him
    expect(classify(sense({ still: 0, speed: 200 }))).toBe('calm');
    expect(classify(sense({ still: 0, speed: 500 }))).toBe('calm'); // gentle, ordinary movement
    expect(classify(sense({ still: 0, speed: 150, d: 30 }))).toBe('calm');
    expect(classify(sense({ still: 0, speed: 400, d: 30 }))).toBe('neutral'); // poking right at him
    expect(classify(sense({ still: 0, speed: 1000 }))).toBe('easy');
    expect(classify(sense({ still: 0, speed: 2500 }))).toBe('rough');
    expect(classify(sense({ still: 0, speed: 600, approach: 600, d: 100 }))).toBe('chase');
    expect(classify(sense({ still: 0, speed: 600, approach: 300, d: 100 }))).toBe('calm'); // coming over, not at him
    expect(classify(sense({ still: 0, speed: 100, pat: true }))).toBe('pat');
  });

  it('nextChange: when the band changes or fear fades, under the current condition', () => {
    const t = observe(initTrust(0), 0, 'calm');
    const s = nextChange(t, 0)!;
    expect(band(t, (s - 0.1) * S)).toBe('wary');
    expect(band(t, s * S)).toBe('tolerant');
    const shaken = observe(scare(initTrust(0), 0), 0, 'neutral');
    const f = nextChange(shaken, 0)!;
    expect(fearAt(shaken, (f - 0.1) * S)).toBeGreaterThan(SHAKEN);
    expect(fearAt(shaken, f * S)).toBeLessThan(SHAKEN);
    const f2 = nextChange(shaken, f * S)!;
    expect(fearAt(shaken, (f + f2) * S)).toBeLessThan(UNEASY);
    expect(nextChange(observe(initTrust(0), 0, 'neutral'), 0)).toBeNull();
    expect(nextChange(observe(nudge(initTrust(0), 0, 1), 0, 'calm'), 0)).toBeNull();
    const r = observe(nudge(initTrust(0), 0, 0.3), 0, 'rough'); // 0.45: drops into wary
    const d = nextChange(r, 0)!;
    expect(band(r, (d + 0.01) * S)).toBe('wary');
  });

  it('freeze / thaw: a reload keeps trust; fear keeps fading while away; junk is ignored', () => {
    const t = observe(nudge(initTrust(0), 0, 0.6), 0, 'neutral');
    const saved = freeze(t, 1000, 50_000);
    const back = thaw(JSON.parse(JSON.stringify(saved)), 20, 51_000)!;
    expect(back.v).toBeCloseTo(t.v, 2);
    expect(band(back, 20)).toBe('warm');
    const scared = thaw(freeze(scare(t, 0), 0, 0), 0, 30_000)!;
    expect(scared.fear).toBeLessThan(0.05);
    expect(thaw(null, 0, 0)).toBeNull();
    expect(thaw({ v: 'x', fear: 0, full: false, wall: 0 }, 0, 0)).toBeNull();
    expect(thaw({ v: 2, fear: 0, full: false, wall: 0 }, 0, 0)).toBeNull();
  });
});
