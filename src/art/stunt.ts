/**
 * The title stunt: what the character does on the hero tagline once the arm has written it.
 * Pure: a seeded program of beats; the stage (stuntDriver.ts) plays it (where he is and how he holds
 * himself per beat) and applies `lettersAt` to the title through targets.ts `setGlyphs` (then
 * `resetGlyphs` when it's over or interrupted).
 *
 * The title as a place (measured at 375 and 1440): "Professional Bogeyman" wraps, and every row
 * below the first sits under a wider row with less than his height between them, so the only
 * letter tops he can stand on are on the top row ("Builder", clear of the eyebrow). The right ends
 * of the rows are open: he can hang off a row-end letter (the "l" of "Professional", the last "n"
 * of "Bogeyman") or a row-end comma with nothing covered. So, each page load, 2 or 3 of
 *   walk  - walk along the top row while the letters sag under his feet
 *   poke  - stand on a short letter and poke the taller one beside it: it jiggles
 *   sit   - sit on a tall letter, legs over the shorter one after it, and look round
 *   flick - drop off the end of the top row and catch its comma: it flicks round under him
 *   swing - hang from a row-end letter and swing, the letter rocking with him
 *   hang  - hang off the last "n" of "Bogeyman" (the letter leans with his weight), then drop
 * chained top to bottom (no repeats, ≤ 12 s). Mobile: one of poke / flick / hang / sit, ≤ 5 s.
 * Around them: a glance at the title and a beat of consideration first, a look back at the visitor
 * after. Every letter effect is enveloped to identity by the end of its beat, so the title is left
 * exactly as found.
 */
import { rng } from './geometry';
import { sag, type GlyphBox, type GlyphPose, type TitleMap } from './glyphs';

export type Variation = 'walk' | 'poke' | 'sit' | 'flick' | 'swing' | 'hang';
export const VARIATIONS: readonly Variation[] = ['walk', 'poke', 'sit', 'flick', 'swing', 'hang'];
/** Where he is: on the ground, standing on a top-row letter, sat on one, hanging from a row end. */
export type Station = { at: 'ground' } | { at: 'top'; key: string } | { at: 'seat'; key: string } | { at: 'hang'; key: string };
export type BeatKind =
  | 'glance' // looks up at the title, at where he's going
  | 'consider' // a beat: head tilts, thinking it over
  | 'approach' // a few running strides toward it
  | 'boost' // the claw scoops him up and sets him on his first spot
  | 'step' // walks along the top row to another letter
  | 'walk' // walks the top row, letters sagging under him
  | 'poke' // pokes a letter
  | 'watch' // watches what he did
  | 'sit' // sits down on a letter
  | 'perch' // sat, looks round, legs swinging
  | 'stand' // gets up
  | 'drop' // steps off / lets go and drops onto a lower row end, catching it
  | 'flick' // the comma he caught flicks round under him
  | 'swing' // swings from a letter
  | 'hang' // hangs off a letter, his weight leaning it
  | 'release' // lets go and drops to the ground
  | 'lookback' // looks back at the visitor ("did you see that")
  | 'cleanup'; // over: letters home (the stage takes him home)
export type Fx = 'sag' | 'tilt' | 'swing' | 'jiggle' | 'flick';
/** A letter effect over a beat. `keys`: the letters it moves (a sag runs along them in order). */
export type LetterFx = { fx: Fx; keys: string[]; amp: number; dir: 1 | -1 };
export type Beat = { kind: BeatKind; variation: Variation | null; t0: number; dur: number; from: Station; to: Station; glyph: string | null; letters: LetterFx[] };
export type StuntProgram = { seed: number; mobile: boolean; variations: Variation[]; beats: Beat[]; total: number };

/** What the title offers (letter keys "line:index"), from the tagline and, if measured, its map. */
export type StuntSite = {
  walk: string[]; // top-row letters he walks along, left to right ([] = no walk)
  poke: { stand: string; target: string }[]; // stand on a short letter, poke the taller one beside it
  seat: string | null; // a top-row letter he can sit on, legs over the lower one after it
  comma: string | null; // a row-end comma he can catch and hang from
  swing: string[]; // row-end letters he can hang and swing from (clear below and beside)
  hang: string | null; // the last "n" of "Bogeyman", if hanging there covers nothing
};

export const MAX_DESKTOP = 12; // s
export const MAX_MOBILE = 5; // s
const WEIGHT: Record<Variation, number> = { walk: 3, hang: 3, poke: 2, flick: 2, swing: 1.5, sit: 1.5 };
const MOBILE_OK: readonly Variation[] = ['poke', 'flick', 'hang', 'sit'];
const ORDER: readonly Variation[] = ['walk', 'poke', 'sit', 'flick', 'swing', 'hang']; // top row down to the ground

/** A fresh seed per page load. */
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

const isLetter = (ch: string) => /\p{L}/u.test(ch);
/** Letters whose top stands above the x-height (the i's dot counts). */
const tall = (ch: string) => /[A-Zbdfhiklt]/.test(ch);
const idx = (key: string) => Number(key.split(':')[1]);
const line = (key: string) => Number(key.split(':')[0]);
/** Same word, next to each other. */
const besides = (a: string, b: string, text: string) => line(a) === line(b) && Math.abs(idx(a) - idx(b)) === 1 && text[Math.min(idx(a), idx(b))] !== ' ' && text[Math.max(idx(a), idx(b))] !== ' ';

/**
 * The stunt site for a tagline. Without a map it's a best guess from the text (row 0 is the first
 * line, its last word is clear to stand on). With one (`mapTitle` with his body, the header and the
 * eyebrow / lede as obstacles), everything comes from what's actually free. `unit`: px per character
 * unit (his scale), for how far a poke or his shins reach.
 */
export function siteFor(tagline: readonly string[], map?: TitleMap | null, unit = 1): StuntSite {
  const li = tagline.length - 1;
  const last = tagline[li] ?? '';
  const word = (text: string, l: number) => {
    const from = text.lastIndexOf(' ') + 1;
    return [...text].flatMap((ch, i) => (i >= from && isLetter(ch) ? [`${l}:${i}`] : []));
  };
  const lastN = [...word(last, li)].reverse().find((k) => last[idx(k)] === 'n') ?? null;
  if (!map) {
    const top = tagline[0] ?? '';
    const w0 = word(top, 0);
    const ch = (k: string) => top[idx(k)];
    const poke = w0.flatMap((k) => w0.filter((j) => besides(k, j, top) && !tall(ch(k)) && tall(ch(j))).map((j) => ({ stand: k, target: j })));
    const seat = [...w0].reverse().find((k) => tall(ch(k)) && top[idx(k) + 1] && !tall(top[idx(k) + 1])) ?? null;
    const words = last.split(' ');
    const prev = words.length > 1 ? `${li}:${last.lastIndexOf(' ') - 1}` : null;
    return { walk: w0, poke, seat, comma: top.endsWith(',') ? `0:${top.length - 1}` : null, swing: prev ? [prev] : [], hang: lastN };
  }
  const glyph = new Map<string, GlyphBox>(map.rows.flatMap((r) => r.glyphs.map((g) => [g.key, g] as const)));
  const free = map.tops.filter((t) => t.free && t.row === 0);
  const freeKeys = new Set(free.map((t) => t.key));
  const shelf = map.shelves.filter((s) => s.row === 0).sort((a, b) => b.keys.length - a.keys.length)[0];
  const text = (k: string) => tagline[line(k)] ?? '';
  const poke: StuntSite['poke'] = [];
  for (const t of free) {
    for (const d of [-1, 1]) {
      const k = `${line(t.key)}:${idx(t.key) + d}`;
      const g = glyph.get(k);
      if (!g || !isLetter(g.ch) || !besides(t.key, k, text(t.key))) continue;
      const up = t.y - g.top; // how much taller the neighbour is
      if (up >= 6 * unit && up <= 30 * unit) poke.push({ stand: t.key, target: k });
    }
  }
  const seats = free.filter((t) => {
    const next = glyph.get(`${line(t.key)}:${idx(t.key) + 1}`);
    return !!next && isLetter(next.ch) && next.top - t.y >= 8 * unit; // shins over a letter, never over a comma
  });
  const right = map.hangs.filter((h) => h.side === 1);
  const commas = right.filter((h) => glyph.get(h.key)?.ch === ',').sort((a, b) => a.y - b.y);
  const letters = right.filter((h) => isLetter(glyph.get(h.key)?.ch ?? ''));
  return {
    walk: shelf && shelf.keys.length >= 3 && shelf.keys.every((k) => freeKeys.has(k)) ? shelf.keys : [],
    poke,
    seat: seats.length ? seats[seats.length - 1].key : null,
    comma: commas[0]?.key ?? null,
    swing: letters.map((h) => h.key).filter((k) => k !== lastN),
    hang: lastN && letters.some((h) => h.key === lastN) ? lastN : null,
  };
}

function available(v: Variation, s: StuntSite) {
  switch (v) {
    case 'walk':
      return s.walk.length > 0;
    case 'poke':
      return s.poke.length > 0;
    case 'sit':
      return !!s.seat;
    case 'flick':
      return !!s.comma;
    case 'swing':
      return s.swing.length > 0;
    case 'hang':
      return !!s.hang;
  }
}

type Draft = Omit<Beat, 't0'>;
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];
const same = (a: Station, b: Station) => a.at === b.at && (a.at === 'ground' || (b.at !== 'ground' && a.key === b.key));

/**
 * A stunt program for this page load. Desktop chains 2-3 variations (weighted, no repeats) top to
 * bottom and fits them in MAX_DESKTOP; mobile plays one in MAX_MOBILE. He starts on the ground;
 * he ends on the ground (after a hang) or wherever the last one left him (the stage's claw fetches
 * him). Always ends with a look back and a cleanup beat. An empty site gives glance + cleanup.
 */
export function stuntProgram(seed: number, site: StuntSite, opts: { mobile?: boolean } = {}): StuntProgram {
  const mobile = !!opts.mobile;
  const r = rng(seed);
  const pool = VARIATIONS.filter((v) => available(v, site) && (!mobile || MOBILE_OK.includes(v)));
  const want = mobile ? 1 : r() < 0.55 ? 2 : 3;
  const chosen: Variation[] = [];
  while (chosen.length < want && pool.length) {
    const total = pool.reduce((a, v) => a + WEIGHT[v], 0);
    let x = r() * total;
    const i = pool.findIndex((v) => (x -= WEIGHT[v]) < 0);
    chosen.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0]);
  }
  chosen.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const ground: Station = { at: 'ground' };
  let cur: Station = ground;
  const body: Draft[] = [];
  const beat = (kind: BeatKind, v: Variation | null, dur: number, to: Station, glyph: string | null = null, letters: LetterFx[] = []) => {
    body.push({ kind, variation: v, dur, from: cur, to, glyph, letters });
    cur = to;
  };
  const dir = (): 1 | -1 => (r() < 0.5 ? -1 : 1);
  /** Get from where he is to `to` (false: he can't, from here). */
  const travel = (to: Station, v: Variation): boolean => {
    if (same(cur, to)) return true;
    if (cur.at === 'ground') {
      if (to.at === 'ground') return true;
      beat('approach', v, mobile ? 0.5 : 0.8, ground);
      beat('boost', v, mobile ? 1 : 1.3, to.at === 'seat' ? { at: 'top', key: to.key } : to, to.key);
      if (to.at === 'seat') beat('sit', v, 0.5, to, to.key);
      return true;
    }
    if (cur.at === 'hang') {
      if (to.at !== 'hang') return false; // never back up to the top row
      beat('drop', v, 0.65, to, to.key);
      return true;
    }
    // on the top row
    if (cur.at === 'seat' && !(to.at === 'seat' && to.key === cur.key)) beat('stand', v, 0.4, { at: 'top', key: cur.key });
    if (to.at === 'hang') {
      beat('drop', v, 0.75, to, to.key);
      return true;
    }
    if (to.at === 'ground' || cur.at !== 'top') return true;
    if (cur.key !== to.key) beat('step', v, Math.min(1.4, Math.max(0.45, 0.3 * Math.abs(idx(cur.key) - idx(to.key)))), { at: 'top', key: to.key });
    if (to.at === 'seat') beat('sit', v, 0.5, to, to.key);
    return true;
  };
  const played: Variation[] = [];
  for (const v of chosen) {
    const mark = body.length;
    const at: Station = cur;
    let ok = true;
    switch (v) {
      case 'walk':
        ok = travel({ at: 'top', key: site.walk[0] }, v);
        if (ok) beat('walk', v, 2.4, { at: 'top', key: site.walk[site.walk.length - 1] }, null, [{ fx: 'sag', keys: site.walk, amp: 3, dir: 1 }]);
        break;
      case 'poke': {
        const p = pick(r, site.poke);
        ok = travel({ at: 'top', key: p.stand }, v);
        if (ok) {
          beat('poke', v, 0.55, cur, p.target);
          beat('watch', v, 0.9, cur, p.target, [{ fx: 'jiggle', keys: [p.target], amp: 4, dir: idx(p.target) > idx(p.stand) ? 1 : -1 }]);
        }
        break;
      }
      case 'sit':
        ok = travel({ at: 'seat', key: site.seat! }, v);
        if (ok) beat('perch', v, 1.9, cur, site.seat, [{ fx: 'sag', keys: [site.seat!], amp: 1.5, dir: 1 }]);
        break;
      case 'flick':
        ok = travel({ at: 'hang', key: site.comma! }, v);
        if (ok) beat('flick', v, 1.2, cur, site.comma, [{ fx: 'flick', keys: [site.comma!], amp: 22, dir: 1 }]);
        break;
      case 'swing': {
        const g = cur.at === 'hang' && site.swing.includes(cur.key) ? cur.key : pick(r, site.swing);
        ok = travel({ at: 'hang', key: g }, v);
        if (ok) beat('swing', v, 2, cur, g, [{ fx: 'swing', keys: [g], amp: 4, dir: dir() }]);
        break;
      }
      case 'hang':
        ok = travel({ at: 'hang', key: site.hang! }, v);
        if (ok) {
          beat('hang', v, 1.8, cur, site.hang, [{ fx: 'tilt', keys: [site.hang!], amp: 4, dir: 1 }]);
          beat('release', v, 0.7, ground);
        }
        break;
    }
    if (ok) played.push(v);
    else {
      body.length = mark; // can't get there from here: skip it
      cur = at;
    }
  }
  if (cur.at === 'hang') beat('release', null, 0.7, ground);

  const first = body.find((b) => b.glyph)?.glyph ?? null;
  const intro: Draft[] = [
    { kind: 'glance', variation: null, dur: mobile ? 0.45 : 0.7, from: ground, to: ground, glyph: first, letters: [] },
    ...(played.length ? [{ kind: 'consider' as const, variation: null, dur: mobile ? 0.35 : 0.8, from: ground, to: ground, glyph: first, letters: [] }] : []),
  ];
  const outro: Draft[] = [
    ...(played.length ? [{ kind: 'lookback' as const, variation: null, dur: mobile ? 0.4 : 0.7, from: cur, to: cur, glyph: null, letters: [] }] : []),
    { kind: 'cleanup', variation: null, dur: mobile ? 0.3 : 0.5, from: cur, to: cur, glyph: null, letters: [] },
  ];
  // the travel at the start (approach, boost) keeps its pace; the rest squeezes to fit
  const lead = body.findIndex((b) => b.kind !== 'approach' && b.kind !== 'boost');
  const fixed = [...intro, ...outro, ...body.slice(0, Math.max(0, lead))].reduce((a, b) => a + b.dur, 0);
  const room = (mobile ? MAX_MOBILE : MAX_DESKTOP) - fixed;
  const rest = body.slice(Math.max(0, lead));
  const used = rest.reduce((a, b) => a + b.dur, 0);
  const k = used > room ? room / used : 1;
  const all = [...intro, ...body.slice(0, Math.max(0, lead)), ...rest.map((b) => ({ ...b, dur: b.dur * k })), ...outro];

  let t = 0;
  const beats = all.map((d) => {
    const b = { ...d, t0: t };
    t += d.dur;
    return b;
  });
  return { seed, mobile, variations: played, beats, total: t };
}

/** The beat at time t (s from the start) and how far through it (0..1); null once the program is over. */
export function beatAt(p: StuntProgram, t: number): { beat: Beat; index: number; u: number } | null {
  if (t >= p.total || !p.beats.length) return null;
  const tt = Math.max(0, t);
  const index = Math.max(0, p.beats.findIndex((b) => tt < b.t0 + b.dur));
  const beat = p.beats[index];
  return { beat, index, u: beat.dur > 0 ? Math.min(1, (tt - beat.t0) / beat.dur) : 1 };
}

/** 0 at both ends of a beat, 1 in the middle: every effect starts and ends at identity. */
const envelope = (u: number) => Math.max(0, Math.min(1, u / 0.12, (1 - u) / 0.18));

/** One letter's pose under an effect at beat progress u (dur = the beat's length, s). Pure. */
export function fxPose(f: LetterFx, key: string, u: number, dur: number): GlyphPose {
  const e = envelope(u);
  const s = u * dur; // seconds into the beat
  switch (f.fx) {
    case 'sag': {
      // his feet run along the keys; letters dip under them (≤ 3px, glyphs.sag), in index units
      const j = f.keys.indexOf(key);
      const feet = u * Math.max(0, f.keys.length - 1);
      return { y: sag(j, feet, { max: f.amp, radius: 1.5 }) * e };
    }
    case 'tilt': // his weight on the top-right corner: the letter leans on its bottom-left, sways a little
      return { rot: f.dir * f.amp * e * (0.75 + 0.25 * Math.sin(s * Math.PI * 2 * 0.8)), ox: 0, oy: 1 };
    case 'swing': // rocks on its base with him
      return { rot: f.dir * f.amp * e * Math.sin(s * Math.PI * 2 * 0.9) };
    case 'jiggle':
      return { rot: f.dir * f.amp * Math.sin(s * Math.PI * 2 * 3) * Math.exp(-3 * u) * e };
    case 'flick': // a quick spin round its middle, then it settles
      return { rot: f.dir * f.amp * Math.exp(-5 * u) * Math.cos(s * Math.PI * 2 * 1.6) * e, ox: 0.5, oy: 0.7 };
  }
}

/**
 * Every letter the program touches, posed for time t (identity where nothing acts on it right now).
 * Empty after the program, and during the cleanup beat (the stage calls resetGlyphs then).
 */
export function lettersAt(p: StuntProgram, t: number): Map<string, GlyphPose> {
  const out = new Map<string, GlyphPose>();
  const at = beatAt(p, t);
  if (!at || at.beat.kind === 'cleanup') return out;
  for (const b of p.beats) for (const f of b.letters) for (const k of f.keys) out.set(k, {});
  for (const f of at.beat.letters) for (const k of f.keys) out.set(k, fxPose(f, k, at.u, at.beat.dur));
  return out;
}
