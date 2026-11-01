/**
 * The title stunt: what the character does on the hero tagline once the arm has written it.
 * Pure: a seeded program of beats; the stage plays it (his route and pose per beat) and applies
 * `lettersAt` to the title through targets.ts `setGlyphs` (then `resetGlyphs` at the cleanup beat).
 *
 * Each page load gets a new seed, so a new variation: 2 or 3 of
 *   walk  - walk along the title's top while the letters sag under his feet
 *   poke  - poke a letter so it jiggles
 *   flick - crouch and flick a comma (it spins and settles)
 *   sit   - sit on top of the title for a moment
 *   swing - hang from a letter and swing, the letter rocking with him
 *   hang  - hang off the last "n" of "Bogeyman" (the letter tilts with his weight), then drop
 * chained in a sensible order (no repeats), ≤ ~12 s. Mobile: one of poke/flick/hang/sit, ≤ ~5 s.
 * Every letter effect is enveloped to identity by the end of its beat, and the program always ends
 * with a cleanup beat, so the title is left exactly as found.
 */
import { rng } from './geometry';
import { sag, type GlyphPose, type TitleMap } from './glyphs';

export type Variation = 'walk' | 'poke' | 'flick' | 'sit' | 'swing' | 'hang';
export const VARIATIONS: readonly Variation[] = ['walk', 'poke', 'flick', 'sit', 'swing', 'hang'];
export type BeatKind = 'glance' | 'approach' | 'move' | 'hop' | 'walk' | 'crouch' | 'poke' | 'flick' | 'watch' | 'sit' | 'stand' | 'swing' | 'hang' | 'drop' | 'cleanup';
/** Pose names for the stage to map onto poses.ts actions. */
export type StuntPose = 'look' | 'run' | 'climb' | 'walk' | 'crouch' | 'poke' | 'flick' | 'sit' | 'stand' | 'hang' | 'swing' | 'drop' | 'land';
export type Fx = 'sag' | 'tilt' | 'swing' | 'jiggle' | 'flick';
/** A letter effect over a beat. `keys`: the letters it moves (a sag runs along them in order). */
export type LetterFx = { fx: Fx; keys: string[]; amp: number; dir: 1 | -1 };
export type Beat = { kind: BeatKind; variation: Variation | null; t0: number; dur: number; glyph: string | null; pose: StuntPose; letters: LetterFx[] };
export type StuntProgram = { seed: number; mobile: boolean; variations: Variation[]; beats: Beat[]; total: number };

/** What the title offers (letter keys "line:index"), from the tagline and, if measured, its map. */
export type StuntSite = {
  walk: string[]; // the letters he walks along, left to right ([] = no walk)
  poke: string[]; // letters he may poke
  commas: string[];
  swing: string[]; // letters he can swing from (clear hang points)
  hang: string | null; // the last "n" of "Bogeyman", if hanging there covers nothing
  sit: string | null; // a letter on the top row he can sit on
};

export const MAX_DESKTOP = 12; // s
export const MAX_MOBILE = 5; // s
const WEIGHT: Record<Variation, number> = { walk: 3, hang: 3, poke: 2, flick: 2, swing: 1.5, sit: 1.5 };
const MOBILE_OK: readonly Variation[] = ['poke', 'flick', 'hang', 'sit'];
const ORDER: readonly Variation[] = ['walk', 'poke', 'flick', 'sit', 'swing', 'hang']; // hang ends at the ground

/** A fresh seed per page load. */
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

const keysOf = (line: string, li: number, pred: (ch: string) => boolean) =>
  [...line].flatMap((ch, i) => (pred(ch) ? [`${li}:${i}`] : []));
const isLetter = (ch: string) => /\p{L}/u.test(ch);

/**
 * The stunt site for a tagline. Without a map every option is assumed available; with one (targets.ts
 * `titleMap`), walking needs free letter tops (falls back to the longest free shelf when the word
 * itself is covered by the row above), hanging and swinging need a clear hang point, sitting a stand
 * spot on the top row.
 */
export function siteFor(tagline: readonly string[], map?: TitleMap | null): StuntSite {
  const li = tagline.length - 1;
  const last = tagline[li] ?? '';
  const from = last.lastIndexOf(' ') + 1;
  const word = keysOf(last, li, isLetter).filter((k) => Number(k.split(':')[1]) >= from);
  const commas = tagline.flatMap((line, i) => keysOf(line, i, (ch) => ch === ','));
  const lastN = [...word].reverse().find((k) => last[Number(k.split(':')[1])] === 'n') ?? null;
  if (!map) return { walk: word, poke: word, commas, swing: word.slice(-1), hang: lastN, sit: tagline[0] ? `0:${Math.floor(tagline[0].indexOf(' ') / 2)}` : null };
  const free = new Set(map.tops.filter((t) => t.free).map((t) => t.key));
  const longest = [...map.shelves].sort((a, b) => b.keys.length - a.keys.length)[0];
  const walk = word.length && word.every((k) => free.has(k)) ? word : (longest?.keys ?? []);
  const hangs = map.hangs.filter((h) => h.side === 1).map((h) => h.key);
  const top = map.stands.filter((s) => s.row === 0);
  return {
    walk: walk.length >= 3 ? walk : [],
    poke: word,
    commas,
    swing: hangs.filter((k) => k !== lastN),
    hang: lastN && hangs.includes(lastN) ? lastN : null,
    sit: top.length ? top[Math.floor(top.length / 2)].key : null,
  };
}

function available(v: Variation, s: StuntSite) {
  switch (v) {
    case 'walk':
      return s.walk.length > 0;
    case 'poke':
      return s.poke.length > 0;
    case 'flick':
      return s.commas.length > 0;
    case 'sit':
      return !!s.sit;
    case 'swing':
      return s.swing.length > 0;
    case 'hang':
      return !!s.hang;
  }
}

type Draft = Omit<Beat, 't0'>;
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];

function beatsFor(v: Variation, s: StuntSite, r: () => number): Draft[] {
  const dir: 1 | -1 = r() < 0.5 ? -1 : 1;
  const b = (kind: BeatKind, dur: number, pose: StuntPose, glyph: string | null, letters: LetterFx[] = []): Draft => ({ kind, variation: v, dur, pose, glyph, letters });
  switch (v) {
    case 'walk':
      return [b('hop', 0.4, 'climb', s.walk[0]), b('walk', 2.4, 'walk', s.walk[s.walk.length - 1], [{ fx: 'sag', keys: s.walk, amp: 3, dir: 1 }])];
    case 'poke': {
      const g = pick(r, s.poke);
      return [b('move', 0.6, 'walk', g), b('poke', 0.4, 'poke', g), b('watch', 0.9, 'look', g, [{ fx: 'jiggle', keys: [g], amp: 4, dir }])];
    }
    case 'flick': {
      const g = pick(r, s.commas);
      return [b('move', 0.6, 'walk', g), b('crouch', 0.4, 'crouch', g), b('flick', 0.3, 'flick', g), b('watch', 1.0, 'look', g, [{ fx: 'flick', keys: [g], amp: 22, dir }])];
    }
    case 'sit':
      return [b('move', 0.8, 'climb', s.sit), b('sit', 2.2, 'sit', s.sit, [{ fx: 'sag', keys: [s.sit!], amp: 1.5, dir: 1 }]), b('stand', 0.4, 'stand', s.sit)];
    case 'swing': {
      const g = pick(r, s.swing);
      return [b('move', 0.6, 'walk', g), b('crouch', 0.4, 'crouch', g), b('swing', 2.0, 'swing', g, [{ fx: 'swing', keys: [g], amp: 4, dir }]), b('stand', 0.5, 'climb', g)];
    }
    case 'hang':
      return [b('move', 0.6, 'walk', s.hang), b('crouch', 0.5, 'crouch', s.hang), b('hang', 1.8, 'hang', s.hang, [{ fx: 'tilt', keys: [s.hang!], amp: 4, dir: 1 }]), b('drop', 0.5, 'drop', s.hang)];
  }
}

/**
 * A stunt program for this page load. Desktop chains 2-3 variations (weighted, no repeats) in a
 * spatial order and fits them in MAX_DESKTOP; mobile plays one in MAX_MOBILE. Always ends with a
 * cleanup beat (letters home, he drops to the ground). An empty site gives just glance + cleanup.
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

  let body = chosen.flatMap((v) => beatsFor(v, site, r));
  const first = body[0]?.glyph ?? null;
  const intro: Draft[] = [
    { kind: 'glance', variation: null, dur: mobile ? 0.4 : 0.6, pose: 'look', glyph: first, letters: [] },
    ...(chosen.length ? [{ kind: 'approach' as const, variation: null, dur: mobile ? 1.4 : 2.2, pose: 'run' as const, glyph: first, letters: [] }] : []),
  ];
  const ended = chosen[chosen.length - 1] === 'hang';
  const cleanup: Draft = { kind: 'cleanup', variation: null, dur: mobile ? 0.6 : 0.9, pose: ended ? 'land' : 'drop', glyph: null, letters: [] };
  const room = (mobile ? MAX_MOBILE : MAX_DESKTOP) - [...intro, cleanup].reduce((a, b) => a + b.dur, 0);
  const used = body.reduce((a, b) => a + b.dur, 0);
  if (used > room) body = body.map((b) => ({ ...b, dur: (b.dur * room) / used }));

  let t = 0;
  const beats = [...intro, ...body, cleanup].map((d) => {
    const beat = { ...d, t0: t };
    t += d.dur;
    return beat;
  });
  return { seed, mobile, variations: chosen, beats, total: t };
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
