import { describe, expect, it } from 'vitest';
import { CAPS, MAX_VOICES, MOUTH_JITTER, MOUTHS, PAN_WIDTH, RANGE, SOUND_NAMES, SOUNDS, VoicePool, nextMouth, panFor, spec, variation } from './mix';

describe('the palette', () => {
  it('is only pops: short, and nothing that lingers', () => {
    expect([...SOUND_NAMES].sort()).toEqual(['pick', 'pop', 'ui']);
    for (const n of SOUND_NAMES) expect(SOUNDS[n].dur).toBeLessThanOrEqual(0.18);
  });
  it('every mouth is low and round: settles between 200 and 450 Hz, rings under 1 kHz, gone in under 0.1 s', () => {
    for (const m of MOUTHS) {
      const hi = 1 + MOUTH_JITTER;
      const lo = 1 - MOUTH_JITTER;
      expect(m.f * lo).toBeGreaterThanOrEqual(200);
      expect(m.f * hi).toBeLessThanOrEqual(450);
      expect(m.body * hi).toBeLessThan(1000);
      expect(m.d * hi).toBeLessThan(0.1);
    }
  });
});

describe('nextMouth', () => {
  it('never takes the same mouth twice in a row, and uses them all', () => {
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const { i: k } = nextMouth(last);
      expect(k).not.toBe(last);
      seen.add(k);
      last = k;
    }
    expect(seen.size).toBe(MOUTHS.length);
  });
  it('nudges each one within its jitter, and never the same twice', () => {
    for (let i = 0; i < 300; i++) {
      const { i: k, m } = nextMouth(i % MOUTHS.length);
      const b = MOUTHS[k];
      for (const key of ['f', 'body', 'q', 'd', 'click'] as const) expect(Math.abs(m[key] / b[key] - 1)).toBeLessThanOrEqual(MOUTH_JITTER + 1e-9);
      expect(Math.abs((m.drop - 1) / (b.drop - 1) - 1)).toBeLessThanOrEqual(MOUTH_JITTER + 1e-9);
    }
    const a = nextMouth(0).m;
    const b = nextMouth(0).m;
    expect(a.f === b.f && a.body === b.body).toBe(false);
  });
});

describe('variation', () => {
  it('stays inside its ranges', () => {
    for (let i = 0; i < 500; i++) {
      const v = variation();
      expect(Math.abs(12 * Math.log2(v.rate))).toBeLessThanOrEqual(RANGE.semis + 1e-9);
      expect(Math.abs(20 * Math.log10(v.gain))).toBeLessThanOrEqual(RANGE.db + 1e-9);
      expect(v.delay).toBeGreaterThanOrEqual(0);
      expect(v.delay).toBeLessThanOrEqual(RANGE.delay);
      expect(Math.abs(v.bright - 1)).toBeLessThanOrEqual(RANGE.bright + 1e-9);
    }
  });
  it('hits its edges and its middle', () => {
    expect(variation(() => 0.5).rate).toBe(1);
    expect(12 * Math.log2(variation(() => 1).rate)).toBeCloseTo(RANGE.semis);
    expect(12 * Math.log2(variation(() => 0).rate)).toBeCloseTo(-RANGE.semis);
  });
  it('never repeats exactly', () => {
    const a = variation();
    const b = variation();
    expect(a.rate === b.rate && a.gain === b.gain).toBe(false);
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
    expect(p.admit('pop', 0)).not.toBeNull();
    expect(p.admit('pop', spec('pop').gap / 2)).toBeNull();
    expect(p.admit('pop', spec('pop').gap + 0.01)).not.toBeNull();
  });
  it('a pop due too soon after one scheduled later waits for its gap instead of being lost', () => {
    const p = new VoicePool();
    p.admit('pop', 0.055); // a staggered cue from the last frame, due ahead of now
    expect(p.admit('pop', 0.016)).toBeNull(); // no wait allowed: dropped
    const held = p.admit('pop', 0.016, undefined, 0.15);
    expect(held?.at).toBeCloseTo(0.055 + spec('pop').gap);
    expect(p.admit('pop', 0.02, undefined, 0.01)).toBeNull(); // too far to wait
  });
  it('caps a layer, and only something more important gets in', () => {
    const p = new VoicePool();
    expect(p.admit('pop', 0, 10)).not.toBeNull();
    expect(p.admit('pop', 0.2, 10)).not.toBeNull();
    expect(p.admit('pop', 0.4, 10)).not.toBeNull();
    expect(p.count('pop')).toBe(CAPS.pop);
    expect(p.admit('pop', 0.6, 10)).toBeNull(); // same priority: dropped
    const hit = p.admit('pick', 0.6, 10); // more important: evicts a pop
    expect(hit?.evict).not.toBeNull();
    expect(p.count('pop')).toBe(CAPS.pop);
  });
  it('never more than the cap at once, and voices free up when they end', () => {
    const p = new VoicePool();
    let t = 0;
    for (let i = 0; i < 20; i++) for (const n of SOUND_NAMES) p.admit(n, (t += 0.5), 50);
    expect(p.size).toBeLessThanOrEqual(MAX_VOICES);
    p.admit('ui', 1000);
    expect(p.size).toBe(1);
  });
  it('ducks a newcomer more the busier it is', () => {
    const p = new VoicePool();
    const a = p.admit('pop', 0, 5)!;
    const b = p.admit('ui', 0, 5)!;
    expect(a.duck).toBe(1);
    expect(b.duck).toBeLessThan(a.duck);
  });
});
