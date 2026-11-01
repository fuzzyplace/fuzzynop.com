import { describe, expect, it } from 'vitest';
import { glyphKey, mapTitle, type GlyphBox } from './glyphs';
import { beatAt, fxPose, lettersAt, MAX_DESKTOP, MAX_MOBILE, siteFor, stuntProgram, VARIATIONS, type StuntSite } from './stunt';

const TAGLINE = ['Team Builder,', 'Red Teamer,', 'Professional Bogeyman'];
const site = siteFor(TAGLINE);
const seeds = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

describe('siteFor (no map)', () => {
  it('finds Bogeyman, its last n and the commas', () => {
    expect(site.walk).toEqual(Array.from({ length: 8 }, (_, k) => `2:${13 + k}`));
    expect(site.hang).toBe('2:20');
    expect(site.commas).toEqual(['0:12', '1:10']);
    expect(site.sit).toMatch(/^0:/);
  });
});

describe('siteFor (with a map)', () => {
  it('falls back to a free shelf when Bogeyman is covered by the row above', () => {
    const g: GlyphBox[] = [];
    const rows: [number, string, number][] = [
      [0, 'Team Builder,', 0],
      [1, 'Red Teamer,', 0],
      [2, 'Professional', 0],
      [2, 'Bogeyman', 13],
    ];
    rows.forEach(([line, text, from], r) => {
      const base = 400 + r * 122;
      [...text].forEach((ch, k) => {
        if (ch !== ' ') g.push({ key: glyphKey(line, from + k), line, i: from + k, ch, left: k * 60, right: k * 60 + 60, top: base - (/[A-Zbdfhklt]/.test(ch) ? 84 : ch === ',' ? 12 : 60), bottom: base, baseline: base });
      });
    });
    const s = siteFor(TAGLINE, mapTitle(g, [], { w: 30, h: 70 }));
    expect(s.walk.every((k) => k.startsWith('0:'))).toBe(true);
    expect(s.walk.length).toBeGreaterThanOrEqual(3);
    expect(s.hang).toBe('2:20'); // the n's right side is open
  });
});

describe('stuntProgram', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(stuntProgram(42, site)).toEqual(stuntProgram(42, site));
    const combos = new Set(seeds.map((s) => stuntProgram(s, site).variations.join('+')));
    expect(combos.size).toBeGreaterThan(10);
    const used = new Set(seeds.flatMap((s) => stuntProgram(s, site).variations));
    expect([...used].sort()).toEqual([...VARIATIONS].sort());
  });

  it('desktop: 2-3 distinct variations, ≤ 12 s, ends with cleanup, beats contiguous', () => {
    for (const s of seeds) {
      const p = stuntProgram(s, site);
      expect(p.variations.length).toBeGreaterThanOrEqual(2);
      expect(p.variations.length).toBeLessThanOrEqual(3);
      expect(new Set(p.variations).size).toBe(p.variations.length);
      expect(p.total).toBeLessThanOrEqual(MAX_DESKTOP + 1e-9);
      expect(p.beats[p.beats.length - 1].kind).toBe('cleanup');
      p.beats.forEach((b, i) => i && expect(b.t0).toBeCloseTo(p.beats[i - 1].t0 + p.beats[i - 1].dur, 9));
      if (p.variations.includes('hang')) expect(p.variations[p.variations.length - 1]).toBe('hang');
    }
  });

  it('mobile: one short variation, ≤ 5 s', () => {
    for (const s of seeds) {
      const p = stuntProgram(s, site, { mobile: true });
      expect(p.variations).toHaveLength(1);
      expect(['poke', 'flick', 'hang', 'sit']).toContain(p.variations[0]);
      expect(p.total).toBeLessThanOrEqual(MAX_MOBILE + 1e-9);
    }
  });

  it('only uses what the site offers', () => {
    const bare: StuntSite = { walk: [], poke: ['2:13'], commas: [], swing: [], hang: null, sit: null };
    const p = stuntProgram(7, bare);
    expect(p.variations).toEqual(['poke']);
    const none = stuntProgram(7, { ...bare, poke: [] });
    expect(none.variations).toEqual([]);
    expect(none.beats.map((b) => b.kind)).toEqual(['glance', 'cleanup']);
  });
});

describe('beatAt / lettersAt', () => {
  const p = stuntProgram(3, site);
  it('finds the beat and progress; null after the end', () => {
    const b = p.beats[2];
    const at = beatAt(p, b.t0 + b.dur / 2)!;
    expect(at.index).toBe(2);
    expect(at.u).toBeCloseTo(0.5, 6);
    expect(beatAt(p, -1)!.index).toBe(0);
    expect(beatAt(p, p.total)).toBeNull();
  });

  it('leaves every letter as found: identity at each beat boundary, nothing after', () => {
    for (const s of seeds.slice(0, 60)) {
      const q = stuntProgram(s, site);
      for (const b of q.beats) {
        for (const t of [b.t0 + 1e-6, b.t0 + b.dur - 1e-6]) {
          for (const pose of lettersAt(q, t).values()) {
            expect(Math.abs(pose.rot ?? 0)).toBeLessThan(0.05);
            expect(Math.abs(pose.y ?? 0)).toBeLessThan(0.05);
          }
        }
      }
      expect(lettersAt(q, q.total).size).toBe(0);
      expect(lettersAt(q, q.beats[q.beats.length - 1].t0 + 0.01).size).toBe(0);
    }
  });

  it('effects stay small: sag ≤ 3px, tilt/swing ≤ 4°', () => {
    for (const s of seeds.slice(0, 60)) {
      const q = stuntProgram(s, site);
      for (let t = 0; t < q.total; t += 0.05) {
        const at = beatAt(q, t)!;
        for (const f of at.beat.letters)
          for (const k of f.keys) {
            const pose = fxPose(f, k, at.u, at.beat.dur);
            expect(pose.y ?? 0).toBeLessThanOrEqual(3 + 1e-9);
            if (f.fx === 'tilt' || f.fx === 'swing' || f.fx === 'jiggle') expect(Math.abs(pose.rot ?? 0)).toBeLessThanOrEqual(4 + 1e-9);
          }
      }
    }
  });
});
