import { describe, expect, it } from 'vitest';
import { glyphKey, mapTitle, type GlyphBox, type Rect } from './glyphs';
import { beatAt, fxPose, lettersAt, MAX_DESKTOP, MAX_MOBILE, siteFor, stuntProgram, VARIATIONS, type Station, type StuntSite } from './stunt';

const TAGLINE = ['Team Builder,', 'Red Teamer,', 'Professional Bogeyman'];
const U = 1.85; // px per character unit at desktop
const BODY = { w: 22 * U, h: 70 * U, hangUp: 22 * U, hangDown: 48 * U };

/** The tagline set as at 1440 (four rows, "Bogeyman" alone on the last), 60px per character. */
function title(): GlyphBox[] {
  const g: GlyphBox[] = [];
  const rows: [number, string, number, number][] = [
    [0, 'Team Builder,', 0, 301],
    [1, 'Red Teamer,', 0, 423],
    [2, 'Professional', 0, 545],
    [2, 'Bogeyman', 13, 659],
  ];
  for (const [line, text, from, base] of rows) {
    [...text].forEach((ch, k) => {
      if (ch === ' ') return;
      const top = ch === ',' ? base - 13 : /[A-Zbdfhiklt]/.test(ch) ? base - 84 : base - 60;
      g.push({ key: glyphKey(line, from + k), line, i: from + k, ch, left: 152 + k * 60, right: 212 + k * 60, top, bottom: ch === ',' ? base + 15 : base, baseline: base });
    });
  }
  return g;
}
const EYEBROW: Rect = { left: 152, right: 330, top: 160, bottom: 175 };
const LEDE: Rect = { left: 152, right: 677, top: 711, bottom: 740 };
const header = (bottom: number): Rect => ({ left: -1e6, right: 1e6, top: -1e6, bottom });
const site = siteFor(TAGLINE, mapTitle(title(), [EYEBROW, LEDE, header(76)], BODY), U);
const seeds = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

describe('siteFor (measured)', () => {
  it('stands only on the top row, hangs off the open row ends', () => {
    expect(site.walk).toEqual(Array.from({ length: 7 }, (_, k) => `0:${5 + k}`)); // "Builder"
    expect(site.poke).toContainEqual({ stand: '0:6', target: '0:5' }); // stand on the u, poke the B
    expect(site.poke.every((p) => p.stand.startsWith('0:'))).toBe(true);
    expect(site.seat).toBe('0:9'); // the d, legs over the e
    expect(site.comma).toBe('0:12'); // "Builder," (the comma after "Teamer" would hang him over "Professional")
    expect(site.swing).toEqual(['2:11']); // the l of "Professional"
    expect(site.hang).toBe('2:20'); // the last n
  });

  it('the top row under the header: only the hangs are left', () => {
    const s = siteFor(TAGLINE, mapTitle(title(), [EYEBROW, LEDE, header(120)], BODY), U);
    expect(s.walk).toEqual([]);
    expect(s.poke).toEqual([]);
    expect(s.seat).toBeNull();
    expect(s.hang).toBe('2:20');
  });

  it('no hang off the n when the lede is right under it', () => {
    const s = siteFor(TAGLINE, mapTitle(title(), [EYEBROW, { ...LEDE, right: 1200, top: 680 }, header(76)], BODY), U);
    expect(s.hang).toBeNull();
  });
});

describe('siteFor (text only)', () => {
  it('guesses from the letters', () => {
    const s = siteFor(TAGLINE);
    expect(s.hang).toBe('2:20');
    expect(s.comma).toBe('0:12');
    expect(s.walk[0]).toBe('0:5');
  });
});

const isTop = (s: Station) => s.at === 'top' || s.at === 'seat';

describe('stuntProgram', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(stuntProgram(42, site)).toEqual(stuntProgram(42, site));
    const combos = new Set(seeds.map((s) => stuntProgram(s, site).variations.join('+')));
    expect(combos.size).toBeGreaterThan(10);
    const used = new Set(seeds.flatMap((s) => stuntProgram(s, site).variations));
    expect([...used].sort()).toEqual([...VARIATIONS].sort());
  });

  it('desktop: 2-3 distinct variations, ≤ 12 s, thinking first, a look back, then cleanup', () => {
    for (const s of seeds) {
      const p = stuntProgram(s, site);
      expect(p.variations.length).toBeGreaterThanOrEqual(2);
      expect(p.variations.length).toBeLessThanOrEqual(3);
      expect(new Set(p.variations).size).toBe(p.variations.length);
      expect(p.total).toBeLessThanOrEqual(MAX_DESKTOP + 1e-9);
      expect(p.beats.slice(0, 2).map((b) => b.kind)).toEqual(['glance', 'consider']);
      expect(p.beats.slice(-2).map((b) => b.kind)).toEqual(['lookback', 'cleanup']);
      p.beats.forEach((b, i) => i && expect(b.t0).toBeCloseTo(p.beats[i - 1].t0 + p.beats[i - 1].dur, 9));
    }
  });

  it('a continuous route: each beat starts where the last ended, from the ground, never back up to the top row', () => {
    for (const s of seeds) {
      const p = stuntProgram(s, site);
      expect(p.beats[0].from).toEqual({ at: 'ground' });
      let hung = false;
      p.beats.forEach((b, i) => {
        if (i) expect(b.from).toEqual(p.beats[i - 1].to);
        if (b.to.at === 'hang') hung = true;
        if (hung) expect(isTop(b.to)).toBe(false);
      });
      // the first move off the ground is the claw's boost, after a few strides
      const k = p.beats.findIndex((b) => b.to.at !== 'ground');
      expect(p.beats[k].kind).toBe('boost');
      expect(p.beats[k - 1].kind).toBe('approach');
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
    const bare: StuntSite = { walk: [], poke: [{ stand: '0:6', target: '0:5' }], seat: null, comma: null, swing: [], hang: null };
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

  it('effects stay small: sag ≤ 3px, tilt/swing/jiggle ≤ 4°', () => {
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
