import { describe, expect, it } from 'vitest';
import { KERN, glyphKey, mapTitle, parseGlyphKey, rowsOf, sag, SAG_MAX, shelfY, splitLine, type GlyphBox } from './glyphs';

/** A fake monospace title: each letter `adv` wide, caps `cap` tall, lowercase `xh` tall. */
function fakeTitle(rows: string[][], { adv = 60, cap = 84, xh = 60, pitch = 122, top = 400 } = {}) {
  const out: GlyphBox[] = [];
  rows.forEach((row, r) => {
    const [line, text, from] = [Number(row[0]), row[1], Number(row[2] ?? 0)];
    const baseline = top + r * pitch;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      if (ch === ' ') continue;
      const tall = /[A-Z]/.test(ch) || /[bdfhklt]/.test(ch);
      const low = ch === ',';
      out.push({
        key: glyphKey(line, from + k),
        line,
        i: from + k,
        ch,
        left: k * adv,
        right: (k + 1) * adv,
        top: baseline - (low ? 12 : tall ? cap : xh),
        bottom: baseline + (/[gyp,]/.test(ch) ? 22 : 0),
        baseline,
      });
    }
  });
  return out;
}

describe('splitLine', () => {
  it('keeps indices aligned with the source line and drops spaces', () => {
    const words = splitLine('Red Teamer,');
    expect(words.map((w) => w.map((c) => c.ch).join(''))).toEqual(['Red', 'Teamer,']);
    expect(words[1][0]).toMatchObject({ ch: 'T', i: 4 });
    for (const w of words) for (const c of w) expect('Red Teamer,'[c.i]).toBe(c.ch);
  });
  it('restores pair kerning as a margin after the first letter of a pair', () => {
    const [team] = splitLine('Team');
    expect(team[0].kern).toBe(KERN.Te);
    expect(team.slice(1).every((c) => c.kern === 0)).toBe(true);
    const [, builder] = splitLine('Team Builder,');
    expect(builder[builder.length - 2]).toMatchObject({ ch: 'r', kern: KERN['r,'] });
    expect(builder[builder.length - 1]).toMatchObject({ ch: ',', kern: 0, kernBefore: KERN['r,'] });
    expect(team[1]).toMatchObject({ ch: 'e', kernBefore: KERN.Te });
  });
  it('never kerns across a space', () => {
    expect(splitLine('T e').flat().every((c) => c.kern === 0 && c.kernBefore === 0)).toBe(true);
  });
});

describe('glyph keys', () => {
  it('round-trips', () => {
    expect(parseGlyphKey(glyphKey(2, 20))).toEqual({ line: 2, i: 20 });
    expect(parseGlyphKey('x')).toBeNull();
  });
});

describe('mapTitle', () => {
  const body = { w: 30, h: 70 };
  // the tagline as it wraps at 1440: four rows, "Bogeyman" alone on the last
  const title = fakeTitle([
    ['0', 'Team Builder,'],
    ['1', 'Red Teamer,'],
    ['2', 'Professional'],
    ['2', 'Bogeyman', '13'],
  ]);

  it('groups wrapped lines into visual rows', () => {
    const rows = rowsOf(title);
    expect(rows).toHaveLength(4);
    expect(rows[3].glyphs.map((g) => g.ch).join('')).toBe('Bogeyman');
  });

  it('a row fully under a wider row above has no foothold; the top row is free', () => {
    const m = mapTitle(title, [], body);
    expect(m.tops.filter((t) => t.row === 3 && t.free)).toEqual([]);
    expect(m.tops.filter((t) => t.row === 0).every((t) => t.free)).toBe(true);
    // word gap breaks the shelf: "Team" and "Builder" are separate runs
    expect(m.shelves.filter((s) => s.row === 0).map((s) => s.keys.length)).toEqual([4, 7]);
  });

  it('a short row above leaves the longer row below free past its end', () => {
    const t = fakeTitle([
      ['0', 'Red'],
      ['1', 'Bogeyman'],
    ]);
    const m = mapTitle(t, [], body);
    const bogey = m.tops.filter((x) => x.row === 1);
    expect(bogey.filter((x) => x.free).map((x) => x.ch).join('')).toBe('eyman');
  });

  it('never offers a foothold whose air overlaps an obstacle (the eyebrow)', () => {
    const eyebrow = { left: 0, right: 200, top: 280, bottom: 296 };
    const m = mapTitle(title, [eyebrow], body);
    expect(m.tops.filter((t) => t.row === 0 && t.free && t.x0 < 200).length).toBe(0);
    for (const s of m.stands.filter((x) => x.row === 0)) expect(s.x - body.w / 2).toBeGreaterThanOrEqual(200 - 0.01);
    expect(m.stands.length).toBeGreaterThan(0);
  });

  it('hang points: the outer top corner of a row-end letter, body clear of every other glyph', () => {
    const m = mapTitle(title, [], body);
    const n = title.find((g) => g.key === '2:20')!; // last "n" of Bogeyman
    expect(n.ch).toBe('n');
    expect(m.hangs).toContainEqual({ key: '2:20', x: n.right, y: n.top, side: 1 });
    // "Red Teamer," ends left of "Professional": a body hung off its "r" would cover "Professional"
    expect(m.hangs.find((h) => h.key === '1:9' && h.side === 1)).toBeUndefined();
  });

  it('stand spots sit on the highest letter under the feet', () => {
    const m = mapTitle(title, [], body);
    for (const s of m.stands) {
      const row = title.find((g) => g.key === s.key)!.baseline;
      const under = title.filter((g) => g.baseline === row && g.right > s.x - body.w / 2 && g.left < s.x + body.w / 2);
      expect(s.y).toBe(Math.min(...under.map((g) => g.top)));
    }
  });

  it('shelfY follows the letter tops', () => {
    const m = mapTitle(title, [], body);
    const team = m.shelves[0];
    expect(shelfY(team, 30)).toBe(title[0].top); // the T
    expect(shelfY(team, 90)).toBe(title[1].top); // the e
    expect(shelfY(team, 10_000)).toBeNull();
  });
});

describe('sag', () => {
  it('is at most 3px, full under the feet, 0 beyond the radius', () => {
    expect(sag(100, 100)).toBe(SAG_MAX);
    expect(sag(100, 100, { max: 9 })).toBe(SAG_MAX);
    expect(sag(100, 200, { radius: 60 })).toBe(0);
    const mid = sag(100, 130, { radius: 60 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(SAG_MAX);
  });
  it('falls off monotonically', () => {
    let last = Infinity;
    for (let d = 0; d <= 60; d += 5) {
      const v = sag(0, d);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
});
