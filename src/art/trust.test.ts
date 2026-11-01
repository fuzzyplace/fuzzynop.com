import { describe, expect, it } from 'vitest';
import {
  ALONE_CAP,
  FULL,
  SHAKEN,
  START,
  UNEASY,
  advance,
  band,
  classify,
  fearAt,
  initTrust,
  keepGap,
  nextChange,
  nudge,
  observe,
  pesterDist,
  scare,
  tap,
  uneasy,
  type Sense,
} from './trust';

const S = 1000;
const sense = (o: Partial<Sense>): Sense => ({ d: 150, speed: 0, approach: 0, still: 2, touch: false, ...o });

describe('trust', () => {
  it('starts wary: keeps his distance and swats', () => {
    const t = initTrust(0);
    expect(t.v).toBe(START);
    expect(band(t, 0)).toBe('wary');
    expect(pesterDist(t, 0)).toBe(60);
    expect(keepGap(t, 0)).toBeGreaterThan(keepGap(nudge(t, 0, 0.4), 0));
  });

  it('a calm presence earns full trust in 45–90 s, not sooner', () => {
    const t = observe(initTrust(0), 0, 'calm');
    expect(advance(t, 45 * S).v).toBeLessThan(FULL);
    expect(advance(t, 90 * S).v).toBeGreaterThanOrEqual(FULL);
    expect(advance(t, 90 * S).full).toBe(true);
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
    expect(later.v).toBeLessThan(FULL);
    expect(advance(t, 30 * S).v).toBeGreaterThan(START);
    expect(advance(t, 30 * S).v).toBeLessThan(advance(observe(initTrust(0), 0, 'calm'), 30 * S).v);
  });

  it('rough movement and chasing cost a little; neutral costs nothing', () => {
    const t = nudge(initTrust(0), 0, 0.4);
    expect(advance(observe(t, 0, 'rough'), 1 * S).v).toBeLessThan(t.v);
    expect(advance(observe(t, 0, 'chase'), 1 * S).v).toBeLessThan(advance(observe(t, 0, 'rough'), 1 * S).v);
    expect(advance(observe(t, 0, 'rough'), 1 * S).v).toBeGreaterThan(t.v - 0.2); // a little
    expect(advance(observe(t, 0, 'neutral'), 60 * S).v).toBe(t.v);
  });

  it('a grab: trust drops sharply, he is shaken, and recovers slowly', () => {
    const warm = nudge(initTrust(0), 0, 0.8);
    expect(band(warm, 0)).toBe('warm');
    const t = observe(scare(warm, 0), 0, 'calm');
    expect(t.v).toBeLessThan(warm.v * 0.4);
    expect(t.fear).toBe(1);
    expect(band(t, 0)).toBe('shaken');
    expect(pesterDist(t, 0)).toBeGreaterThan(60); // startles sooner
    expect(keepGap(t, 0)).toBeGreaterThan(keepGap(initTrust(0), 0)); // keeps well away
    expect(uneasy(t, 10 * S)).toBe(true);
    expect(band(t, 20 * S)).not.toBe('shaken');
    expect(uneasy(t, 40 * S)).toBe(false);
    // fear holds the calm gain back
    const unafraid = observe(nudge(initTrust(0), 0, t.v - START), 0, 'calm');
    expect(advance(t, 20 * S).v).toBeLessThan(advance(unafraid, 20 * S).v);
  });

  it('held in the hand: fear does not fade and nothing is earned', () => {
    const t = observe(scare(initTrust(0), 0), 0, 'held');
    expect(fearAt(t, 30 * S)).toBe(1);
    expect(advance(t, 30 * S).v).toBe(t.v);
  });

  it('touch: gentle taps nearby earn trust; hammering and taps far off do not', () => {
    let t = initTrust(0);
    t = tap(t, 0, 150);
    expect(t.v).toBeGreaterThan(START);
    const v = t.v;
    t = tap(t, 200, 150); // too soon
    expect(t.v).toBeLessThan(v);
    expect(tap(initTrust(0), 0, 500).v).toBe(START);
    expect(tap(initTrust(0), 0, 20).v).toBe(START); // on him: that's a grab, not a tap
  });

  it('classify', () => {
    expect(classify(sense({ d: null }))).toBe('alone');
    expect(classify(sense({ d: 400 }))).toBe('alone');
    expect(classify(sense({ touch: true }))).toBe('alone');
    expect(classify(sense({ still: 3 }))).toBe('calm');
    expect(classify(sense({ d: 30, still: 3 }))).toBe('calm'); // resting right beside him
    expect(classify(sense({ still: 0, speed: 200 }))).toBe('calm');
    expect(classify(sense({ still: 0, speed: 200, d: 30 }))).toBe('neutral');
    expect(classify(sense({ still: 0, speed: 700 }))).toBe('neutral');
    expect(classify(sense({ still: 0, speed: 1500 }))).toBe('rough');
    expect(classify(sense({ still: 0, speed: 500, approach: 400, d: 100 }))).toBe('chase');
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
  });
});
