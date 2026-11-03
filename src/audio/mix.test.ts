import { describe, expect, it } from 'vitest';
import { CAPS, MAX_VOICES, PAN_WIDTH, RANGE, SOUND_NAMES, SOUNDS, VoicePool, panFor, spec, variation } from './mix';

describe('the palette', () => {
  it('is only ticks: short, and nothing that lingers', () => {
    expect(SOUND_NAMES.sort()).toEqual(['pick', 'tick', 'ui']);
    for (const n of SOUND_NAMES) expect(SOUNDS[n].dur).toBeLessThanOrEqual(0.06);
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
    expect(p.admit('tick', 0)).not.toBeNull();
    expect(p.admit('tick', spec('tick').gap / 2)).toBeNull();
    expect(p.admit('tick', spec('tick').gap + 0.01)).not.toBeNull();
  });
  it('caps a layer, and only something more important gets in', () => {
    const p = new VoicePool();
    expect(p.admit('tick', 0, 10)).not.toBeNull();
    expect(p.admit('tick', 0.2, 10)).not.toBeNull();
    expect(p.count('tick')).toBe(CAPS.tick);
    expect(p.admit('tick', 0.4, 10)).toBeNull(); // same priority: dropped
    const hit = p.admit('pick', 0.4, 10); // more important: evicts a tick
    expect(hit?.evict).not.toBeNull();
    expect(p.count('tick')).toBe(CAPS.tick);
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
    const a = p.admit('tick', 0, 5)!;
    const b = p.admit('ui', 0, 5)!;
    expect(a.duck).toBe(1);
    expect(b.duck).toBeLessThan(a.duck);
  });
});
