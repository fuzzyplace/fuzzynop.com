import { describe, expect, it } from 'vitest';
import { CAPS, MAX_VOICES, MOOD, PAN_WIDTH, RANGE, SOUND_NAMES, VoicePool, panFor, spec, variation, type Band } from './mix';

const seq = (xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('variation', () => {
  it('stays inside its ranges for every mood', () => {
    for (const b of Object.keys(MOOD) as Band[]) {
      const m = MOOD[b];
      for (let i = 0; i < 500; i++) {
        const v = variation(b);
        const semis = 12 * Math.log2(v.rate);
        expect(Math.abs(semis)).toBeLessThanOrEqual(RANGE.semis * m.spread + 1e-9);
        expect(v.delay).toBeGreaterThanOrEqual(0);
        expect(v.delay).toBeLessThanOrEqual(RANGE.delay * m.spread);
        const db = 20 * Math.log10(v.gain / m.gain);
        expect(Math.abs(db)).toBeLessThanOrEqual(RANGE.db + 1e-9);
        expect(v.bright).toBeGreaterThanOrEqual((1 - RANGE.bright) * m.bright - 1e-9);
        expect(v.bright).toBeLessThanOrEqual((1 + RANGE.bright) * m.bright + 1e-9);
      }
    }
  });
  it('never repeats exactly', () => {
    const a = variation('tolerant');
    const b = variation('tolerant');
    expect(a.rate === b.rate && a.gain === b.gain).toBe(false);
  });
  it('shaken is shakier and spreads wider; warm is softer and darker', () => {
    const lo = seq([0]);
    const hi = seq([1]);
    expect(variation('shaken', hi).rate).toBeGreaterThan(variation('tolerant', hi).rate);
    expect(variation('shaken', lo).shake).toBe(1);
    expect(variation('warm', lo).soft).toBe(1);
    expect(variation('warm', () => 0.5).bright).toBeLessThan(variation('tolerant', () => 0.5).bright);
    expect(variation('nope' as Band, () => 0.5).rate).toBe(1); // unknown mood: neutral
  });
});

describe('panFor', () => {
  it('follows x gently, never hard', () => {
    expect(panFor(0, 1000)).toBeCloseTo(-PAN_WIDTH);
    expect(panFor(500, 1000)).toBeCloseTo(0);
    expect(panFor(1000, 1000)).toBeCloseTo(PAN_WIDTH);
    expect(panFor(-500, 1000)).toBeCloseTo(-PAN_WIDTH);
    expect(panFor(NaN, 1000)).toBe(0);
    expect(panFor(10, 0)).toBe(0);
  });
});

describe('VoicePool', () => {
  it('keeps the same sound apart by its gap', () => {
    const p = new VoicePool();
    expect(p.admit('land', 0)).not.toBeNull();
    expect(p.admit('land', spec('land').gap / 2)).toBeNull();
    expect(p.admit('land', spec('land').gap + 0.01)).not.toBeNull();
  });
  it('caps a layer, and only something more important gets in', () => {
    const p = new VoicePool();
    const low = ['step', 'scratch', 'rustle', 'scrabble'] as const; // all priority 1, body
    low.forEach((n) => expect(p.admit(n, 0, 10)).not.toBeNull());
    expect(p.count('body')).toBe(CAPS.body);
    expect(p.admit('sigh', 0.01, 10)).toBeNull(); // same priority: dropped
    const hit = p.admit('land', 0.01, 10); // priority 3: evicts one
    expect(hit?.evict).not.toBeNull();
    expect(p.count('body')).toBe(CAPS.body);
  });
  it('never more than the cap at once, and voices free up when they end', () => {
    const p = new VoicePool();
    let t = 0;
    for (const n of SOUND_NAMES) for (let i = 0; i < 4; i++) p.admit(n, (t += 0.001), 5);
    expect(p.size).toBeLessThanOrEqual(MAX_VOICES);
    p.admit('ui', 100);
    expect(p.size).toBe(1);
  });
  it('ducks a newcomer more the busier it is', () => {
    const p = new VoicePool();
    const a = p.admit('step', 0, 5)!;
    p.admit('click', 0, 5);
    p.admit('ui', 0, 5);
    const b = p.admit('slap', 0, 5)!;
    expect(a.duck).toBe(1);
    expect(b.duck).toBeLessThan(a.duck);
  });
});
