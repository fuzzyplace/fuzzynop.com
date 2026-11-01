/**
 * The hero title as terrain for the character. Pure: no DOM, no clock.
 *
 * Two jobs:
 * 1. Typesetting the split title (`splitLine`). Every letter of the tagline is its own span. At rest
 *    the spans are inline (identical setting to unsplit text); a letter the character moves becomes
 *    an inline-block for the duration (transforms need a box), which drops the font's pair kerning
 *    at its edges. `KERN` puts it back as negative margins (em), so a moving letter starts exactly
 *    where it was (measured: ≤ 1px per line at 375 and 1440).
 * 2. Reading the title as a place (`mapTitle`): from per-glyph ink boxes (document px, measured by
 *    targets.ts `measureTitle`) and the text around it, where he can stand (letter tops with his
 *    full height clear above), where he can hang (a letter's top corner with his body clear below),
 *    and safe stand spots that cover nothing a reader needs. `sag` is how far a letter dips under
 *    his feet (≤ 3px).
 */

export type Rect = { left: number; top: number; right: number; bottom: number };
/** A letter's pose: px offsets (+y = down), degrees (+ = clockwise), pivot as a fraction of its box (default bottom centre). */
export type GlyphPose = { x?: number; y?: number; rot?: number; ox?: number; oy?: number };

/**
 * Pair kerning of the display face (Chakra Petch 400) in em, for the pairs in the tagline, measured
 * with canvas `measureText` (width("ab") - width("a") - width("b")). A pair missing here is set
 * unkerned (at most ~0.1em off), never wrong in any other way.
 */
export const KERN: Readonly<Record<string, number>> = {
  Te: -0.09,
  'r,': -0.06,
  Pr: -0.01,
  ro: -0.025,
  fe: -0.02,
};

/** kern: pair kerning (em) with the next letter; kernBefore: with the previous one. */
export type SplitChar = { ch: string; i: number; kern: number; kernBefore: number };
export type SplitWord = SplitChar[];

/**
 * One tagline line as words of characters. `i` is the character's index in the line (spaces
 * included, so `data-glyph="line:i"` matches `line[i]`). Spaces are not glyphs: they stay plain
 * text between the words (so the line breaks where it did).
 *
 * At rest a letter span is plain inline (the line shapes as one run: font kerning intact, find in
 * page works). Only while a letter moves is it an inline-block, which loses the kerning on both
 * sides of it; `kern` / `kernBefore` (em) are the margins that put it back (CSS vars on the span).
 */
export function splitLine(line: string, kern: Readonly<Record<string, number>> = KERN): SplitWord[] {
  const words: SplitWord[] = [];
  let cur: SplitWord | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') {
      cur = null;
      continue;
    }
    if (!cur) words.push((cur = []));
    const next = line[i + 1];
    const prev = line[i - 1];
    cur.push({ ch, i, kern: next && next !== ' ' ? (kern[ch + next] ?? 0) : 0, kernBefore: prev && prev !== ' ' ? (kern[prev + ch] ?? 0) : 0 });
  }
  return words;
}

/** `data-glyph` value of a letter: "<lineIndex>:<charIndex>". */
export const glyphKey = (line: number, i: number) => `${line}:${i}`;
export function parseGlyphKey(key: string): { line: number; i: number } | null {
  const m = /^(\d+):(\d+)$/.exec(key);
  return m ? { line: +m[1], i: +m[2] } : null;
}

/**
 * A measured letter, document px. left/right: its advance box. top/bottom: its ink (cap or x-height
 * top, descender bottom). baseline: the baseline of its visual row.
 */
export type GlyphBox = { key: string; line: number; i: number; ch: string; left: number; right: number; top: number; bottom: number; baseline: number };
/**
 * The character's body, px: w = shoulder-to-shoulder width he needs, h = feet to top of head.
 * Hanging (optional): how far his head rises above his grip (hangUp) and his feet drop below it
 * (hangDown); without them a hang box is his full height below the grip.
 */
export type Body = { w: number; h: number; hangUp?: number; hangDown?: number };

export type Row = { baseline: number; left: number; right: number; glyphs: GlyphBox[] };
/** A letter's top as a foothold: y = its ink top; free = his whole body fits above it. */
export type LetterTop = { key: string; ch: string; row: number; x0: number; x1: number; y: number; free: boolean };
/** A run of adjacent free letter tops in one row (no word gap): somewhere he can walk. */
export type Shelf = { row: number; left: number; right: number; keys: string[]; profile: { x0: number; x1: number; y: number }[] };
/** Where his hands can grip: a letter's top corner. side: which way his body hangs (+1 = right of x). */
export type Hang = { key: string; x: number; y: number; side: 1 | -1 };
/** A spot (feet) on a shelf where his body box covers no text. */
export type Stand = { key: string; x: number; y: number; row: number };
export type TitleMap = { rows: Row[]; tops: LetterTop[]; shelves: Shelf[]; hangs: Hang[]; stands: Stand[] };

const LETTER = /\p{L}/u;
const hit = (a: Rect, b: Rect, eps = 0.5) => a.left < b.right - eps && a.right > b.left + eps && a.top < b.bottom - eps && a.bottom > b.top + eps;
const inkRect = (g: GlyphBox): Rect => ({ left: g.left, right: g.right, top: g.top, bottom: g.bottom });

/** Group glyphs into visual rows by baseline (a wrapped tagline line becomes two rows), top to bottom. */
export function rowsOf(glyphs: GlyphBox[], tol = 2): Row[] {
  const rows: Row[] = [];
  for (const g of [...glyphs].sort((a, b) => a.baseline - b.baseline || a.left - b.left)) {
    const r = rows.find((x) => Math.abs(x.baseline - g.baseline) <= tol);
    if (r) r.glyphs.push(g);
    else rows.push({ baseline: g.baseline, left: 0, right: 0, glyphs: [g] });
  }
  for (const r of rows) {
    r.glyphs.sort((a, b) => a.left - b.left);
    r.left = r.glyphs[0].left;
    r.right = r.glyphs[r.glyphs.length - 1].right;
  }
  return rows.sort((a, b) => a.baseline - b.baseline);
}

export type MapOpts = {
  /** px between two letters' advance boxes that still counts as one walkable run (word gaps break it) */
  join?: number;
  /** px of clear air he keeps above his head */
  headroom?: number;
};

/**
 * The title as terrain. `obstacles`: other text a reader needs (eyebrow, lede, header strip), which
 * he must never cover. Every glyph's ink box is an obstacle too, except the letter under his feet or
 * in his hands.
 */
export function mapTitle(glyphs: GlyphBox[], obstacles: Rect[], body: Body, opts: MapOpts = {}): TitleMap {
  const join = opts.join ?? 2;
  const headroom = opts.headroom ?? 4;
  const rows = rowsOf(glyphs);
  const solids = glyphs.map((g) => ({ g, r: inkRect(g) }));
  const blocked = (box: Rect, except: string) => obstacles.some((o) => hit(box, o)) || solids.some(({ g, r }) => g.key !== except && hit(box, r));

  const tops: LetterTop[] = [];
  rows.forEach((row, ri) => {
    for (const g of row.glyphs) {
      if (!LETTER.test(g.ch)) continue;
      const air: Rect = { left: g.left, right: g.right, top: g.top - body.h - headroom, bottom: g.top };
      tops.push({ key: g.key, ch: g.ch, row: ri, x0: g.left, x1: g.right, y: g.top, free: !blocked(air, g.key) });
    }
  });

  const shelves: Shelf[] = [];
  let run: Shelf | null = null;
  for (const t of tops) {
    const joins = run && run.row === t.row && t.x0 - run.right <= join;
    if (!t.free) {
      run = null;
      continue;
    }
    if (!joins || !run) shelves.push((run = { row: t.row, left: t.x0, right: t.x1, keys: [], profile: [] }));
    run.right = t.x1;
    run.keys.push(t.key);
    run.profile.push({ x0: t.x0, x1: t.x1, y: t.y });
  }

  // hang: grip a row-end letter's (or a row-end comma's) outer top corner; his body hangs beside the
  // row, clear of all text
  const hangs: Hang[] = [];
  const up = body.hangUp ?? 0;
  const down = body.hangDown ?? body.h;
  rows.forEach((row) => {
    const letters = row.glyphs.filter((g) => LETTER.test(g.ch));
    const last = row.glyphs[row.glyphs.length - 1];
    const ends: [GlyphBox | undefined, 1 | -1][] = [
      [last && last.ch === ',' ? last : letters[letters.length - 1], 1],
      [letters[0], -1],
    ];
    for (const [g, side] of ends) {
      if (!g) continue;
      const x = side === 1 ? g.right : g.left;
      const top = g.top - up;
      const bottom = g.top + down;
      const box: Rect = side === 1 ? { left: x, right: x + body.w, top, bottom } : { left: x - body.w, right: x, top, bottom };
      if (!blocked(box, g.key)) hangs.push({ key: g.key, x, y: g.top, side });
    }
  });

  // stand spots: his body box centred on x, every ~quarter body width along each shelf
  const stands: Stand[] = [];
  for (const s of shelves) {
    const step = Math.max(4, body.w / 4);
    for (let x = s.left + body.w / 2; x <= s.right - body.w / 2 + 0.01; x += step) {
      const under = s.profile.filter((p) => x + body.w / 2 > p.x0 && x - body.w / 2 < p.x1);
      const y = Math.min(...under.map((p) => p.y)); // the highest letter top under his feet
      const key = s.keys[s.profile.findIndex((p) => x >= p.x0 && x <= p.x1)] ?? s.keys[0];
      const box: Rect = { left: x - body.w / 2, right: x + body.w / 2, top: y - body.h - headroom, bottom: y };
      const others = solids.filter(({ g }) => !s.keys.includes(g.key));
      if (!obstacles.some((o) => hit(box, o)) && !others.some(({ r }) => hit(box, r))) stands.push({ key, x, y, row: s.row });
    }
  }
  return { rows, tops, shelves, hangs, stands };
}

/** The letter top under x on a shelf (his feet's y while he walks it), or null off the shelf. */
export function shelfY(s: Shelf, x: number): number | null {
  const p = s.profile.find((q) => x >= q.x0 && x <= q.x1);
  if (p) return p.y;
  if (x < s.left || x > s.right) return null;
  // in a hairline gap between two letters: the higher of the two neighbours
  const near = s.profile.reduce((a, b) => (Math.abs((b.x0 + b.x1) / 2 - x) < Math.abs((a.x0 + a.x1) / 2 - x) ? b : a));
  return near.y;
}

export const SAG_MAX = 3;
/**
 * How far (px, ≥ 0 = down) a letter centred at `x` dips with his feet at `feetX`: full under his
 * feet, a smooth cosine falloff to 0 at `radius`. Never more than `max` (clamped to SAG_MAX).
 */
export function sag(x: number, feetX: number, opts: { max?: number; radius?: number } = {}): number {
  const max = Math.min(SAG_MAX, Math.max(0, opts.max ?? SAG_MAX));
  const radius = Math.max(1, opts.radius ?? 60);
  const d = Math.abs(x - feetX);
  if (d >= radius) return 0;
  return max * (0.5 + 0.5 * Math.cos((Math.PI * d) / radius));
}
