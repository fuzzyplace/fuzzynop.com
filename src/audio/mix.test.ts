import { describe, expect, it } from 'vitest';
import { BED, CAPS, CEILING_HZ, FLOOR_HZ, GRAIN_JITTER, GRAINS, LAYER_GAIN, MASTER, MAX_VOICES, PAN_WIDTH, RANGE, SOUND_NAMES, SOUNDS, VoicePool, nextShape, panFor, spec, variation } from './mix';

describe('the palette', () => {
  it('has every cue, and each one is short (the bed is the only thing that lingers)', () => {
    expect([...SOUND_NAMES].sort()).toEqual(['clamp', 'hover', 'inkIn', 'inkOut', 'land', 'release', 'scratch', 'sheet', 'stunt', 'tick', 'ui'].sort());
    for (const n of SOUND_NAMES) expect(SOUNDS[n].dur).toBeLessThanOrEqual(1);
  });
  it('is quiet and dark: low master, lowpassed under 3 kHz, rumble below the floor only', () => {
    expect(MASTER).toBeLessThanOrEqual(0.35);
    for (const g of Object.values(LAYER_GAIN)) expect(g).toBeLessThanOrEqual(0.6);
    expect(CEILING_HZ).toBeLessThanOrEqual(3000);
    expect(FLOOR_HZ).toBeLessThan(60);
    expect(BED.level * MASTER).toBeLessThan(0.2);
  });
  it('the hover tick is dry; everything else has a little room', () => {
    expect(SOUNDS.hover.room).toBe(0);
    for (const n of SOUND_NAMES) if (n !== 'hover') expect(SOUNDS[n].room).toBeGreaterThan(0);
  });
  it('every grain is small, low and muted: under 1.3 kHz, lowpassed under 2.2 kHz, gone in 30 ms', () => {
    const hi = 1 + GRAIN_JITTER;
    for (const g of GRAINS) {
      expect(g.f * hi).toBeLessThan(1300);
      expect(g.lp * hi).toBeLessThan(2200);
      expect(g.len * hi).toBeLessThan(0.03);
      expect(g.knock * hi).toBeLessThan(350);
    }
  });
});

describe('nextShape', () => {
  it('never takes the same grain twice in a row, and uses them all', () => {
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const { i: k } = nextShape(GRAINS, last, GRAIN_JITTER);
      expect(k).not.toBe(last);
      seen.add(k);
      last = k;
    }
    expect(seen.size).toBe(GRAINS.length);
  });
  it('nudges each one within its jitter, and never the same twice', () => {
    for (let i = 0; i < 300; i++) {
      const { i: k, s } = nextShape(GRAINS, i % GRAINS.length, GRAIN_JITTER);
      const b = GRAINS[k];
      for (const key of Object.keys(b) as (keyof typeof b)[]) expect(Math.abs(s[key] / b[key] - 1)).toBeLessThanOrEqual(GRAIN_JITTER + 1e-9);
    }
    const a = nextShape(GRAINS, 0, GRAIN_JITTER).s;
    const b = nextShape(GRAINS, 0, GRAIN_JITTER).s;
    expect(a.f === b.f && a.len === b.len).toBe(false);
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
  it('rate-limits the hover tick so running the pointer along the tree never machine-guns', () => {
    const p = new VoicePool();
    let n = 0;
    for (let t = 0; t < 1; t += 0.016) if (p.admit('hover', t)) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(1 / spec('hover').gap));
  });
  it('a tick due too soon after one scheduled later waits for its gap instead of being lost', () => {
    const p = new VoicePool();
    p.admit('tick', 0.055); // a staggered cue from the last frame, due ahead of now
    expect(p.admit('tick', 0.016)).toBeNull(); // no wait allowed: dropped
    const held = p.admit('tick', 0.016, undefined, 0.15);
    expect(held?.at).toBeCloseTo(0.055 + spec('tick').gap);
    expect(p.admit('tick', 0.02, undefined, 0.01)).toBeNull(); // too far to wait
  });
  it('caps a layer, and only something more important gets in', () => {
    const p = new VoicePool();
    expect(p.admit('tick', 0, 10)).not.toBeNull();
    expect(p.admit('tick', 0.2, 10)).not.toBeNull();
    expect(p.admit('tick', 0.4, 10)).not.toBeNull();
    expect(p.count('place')).toBe(CAPS.place);
    expect(p.admit('tick', 0.6, 10)).toBeNull(); // same priority: dropped
    const hit = p.admit('sheet', 0.6, 10); // more important: evicts a tick
    expect(hit?.evict).not.toBeNull();
    expect(p.count('place')).toBe(CAPS.place);
  });
  it('the claw wins over a landing when the body layer is full', () => {
    const p = new VoicePool();
    p.admit('land', 0, 10);
    p.admit('stunt', 0, 10);
    expect(p.admit('clamp', 0.1, 10)?.evict).not.toBeNull();
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
