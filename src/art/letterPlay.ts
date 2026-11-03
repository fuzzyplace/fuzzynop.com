/**
 * Letter play: he messes with a title word beside him and always puts it right. Pure: no DOM, no
 * clock. The stage finds a word next to where he's standing (the hero tagline's `data-glyph`
 * letters from a shelf beside a line's end, or a plate title's `data-plate-glyph` letters from the
 * nook after its last word), asks `planTrick` for a program, then each frame applies `lettersAt`
 * (targets.ts `setGlyph`) and `meAt` (his pose and a step).
 *
 * Tricks, all on the word's end nearest him:
 * - carry: picks the end letter up, holds it over his head, takes a step away with it, has a look,
 *   brings it back and sets it down.
 * - swap: swaps the last two letters over (one arcs over the other), looks at you, swaps them back.
 * - nudge: shoves the word so it sits crooked (≤ 4°), considers it, shoves it straight.
 * - stack: lifts the end letter onto the one before it, it wobbles, he steps back to admire it, then
 *   takes it down.
 * - spin: flicks the end letter so it spins a full turn on the spot.
 * Every program ends with every letter at rest (identity) by `dur`, 3-6 s; the stage springs letters
 * home (CSS) if it stops early. One word at a time, never body copy.
 */
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import type { GlyphPose } from './glyphs';
import type { AnyAction } from './poses';

export type Trick = 'carry' | 'swap' | 'nudge' | 'stack' | 'spin';
export const TRICKS: readonly Trick[] = ['carry', 'swap', 'nudge', 'stack', 'spin'];
/** A letter of the word, document px (its span's box; `top`/`bottom` = the line box is fine). */
export type LBox = { key: string; ch: string; left: number; right: number; top: number; bottom: number };
/** Where he stands: feet (document px), facing the word, his size (px per character unit). */
export type Me = { x: number; feet: number; facing: 1 | -1; scale: number };
export type Beat = { t0: number; dur: number; act: AnyAction | 'walk' | null; look: 'letter' | 'visitor' | 'word' };
export type LetterProgram = {
  trick: Trick;
  keys: string[]; // letters it moves
  dur: number; // s
  beats: Beat[];
  step: number; // px of the step away (carry / stack), signed along x
};

const LETTER = /\p{L}/u;
const cx = (g: LBox) => (g.left + g.right) / 2;
const hgt = (g: LBox) => g.bottom - g.top;

/** The word's letters on his side: [end letter, the one before it] (punctuation skipped). */
export function endLetters(word: readonly LBox[], facing: 1 | -1): [LBox, LBox | null] | null {
  const ls = word.filter((g) => LETTER.test(g.ch));
  if (!ls.length) return null;
  // facing -1: he's right of the word (looking left at it): its last letters; +1: its first
  const order = facing < 0 ? [...ls].reverse() : ls;
  return [order[0], order[1] ?? null];
}

/** Can he do `trick` with this word from here? (swap / stack need two letters) */
export function canTrick(trick: Trick, word: readonly LBox[], me: Me): boolean {
  const e = endLetters(word, me.facing);
  if (!e) return false;
  const [end, prev] = e;
  if ((trick === 'swap' || trick === 'stack') && !prev) return false;
  // his hand has to reach the end letter: it must be beside him, at about hand height
  // (beside the word's outermost mark: a comma after the letter is in the way but within reach)
  const reach = 30 * me.scale;
  const outer = me.facing < 0 ? word[word.length - 1] : word[0];
  const gap = me.facing < 0 ? me.x - outer.right : outer.left - me.x;
  const toEnd = me.facing < 0 ? me.x - end.right : end.left - me.x;
  if (gap < -2 || gap > reach || toEnd > reach * 1.6) return false;
  const shoulder = me.feet - 33 * me.scale;
  return end.bottom > shoulder - 8 * me.scale && end.top < me.feet;
}

/** A program for `trick` (null: not from here). */
export function planTrick(trick: Trick, word: readonly LBox[], me: Me, rand: () => number): LetterProgram | null {
  if (!canTrick(trick, word, me)) return null;
  const [end, prev] = endLetters(word, me.facing)!;
  const b: Beat[] = [];
  let t = 0;
  const beat = (act: Beat['act'], dur: number, look: Beat['look'] = 'letter') => {
    b.push({ t0: t, dur, act, look });
    t += dur;
  };
  const away = (-me.facing * 14 * me.scale) as number;
  let step = 0;
  const keys = [end.key];
  switch (trick) {
    case 'carry':
      beat('reach', 0.55);
      beat('heft', 0.45); // up over his head
      beat('walk', 0.7); // a step away with it
      beat('heft', 0.6 + rand() * 0.4, rand() < 0.5 ? 'visitor' : 'letter');
      beat('walk', 0.7); // back
      beat('reach', 0.6); // sets it down
      step = away;
      break;
    case 'swap':
      keys.push(prev!.key);
      beat('reach', 0.5);
      beat('tug', 0.8); // over each other
      beat('tilt', 0.9 + rand() * 0.5, 'visitor');
      beat('tug', 0.8); // and back
      beat('still', 0.35, 'word');
      break;
    case 'nudge':
      keys.splice(0, 1, ...word.map((g) => g.key));
      beat('push', 0.8);
      beat('consider', 1.2 + rand() * 0.4, 'word');
      beat('push', 0.8);
      beat('blink', 0.35, 'word');
      break;
    case 'stack':
      keys.push(prev!.key);
      beat('reach', 0.55);
      beat('heft', 0.7); // up onto the other
      beat('walk', 0.6); // steps back
      beat('watch', 0.9 + rand() * 0.5, 'word');
      beat('walk', 0.6);
      beat('reach', 0.6); // takes it down
      step = away * 0.8;
      break;
    case 'spin':
      beat('reach', 0.45);
      beat('watch', 1.25, 'letter'); // it spins
      beat('glasses', 1, rand() < 0.5 ? 'visitor' : 'letter');
      beat('still', 0.4, 'word');
      break;
  }
  return { trick, keys, dur: t, beats: b, step };
}

/** Which beat plays at t (s), and how far through it. */
export function beatAt(p: LetterProgram, t: number): { i: number; u: number } | null {
  if (t < 0 || t >= p.dur) return null;
  for (let i = 0; i < p.beats.length; i++) {
    const bt = p.beats[i];
    if (t < bt.t0 + bt.dur) return { i, u: clamp((t - bt.t0) / bt.dur) };
  }
  return null;
}

/** His step offset (px along x from where he started) at t. */
export function meAt(p: LetterProgram, t: number): { dx: number; act: AnyAction | null; k: number; look: Beat['look']; walking: boolean } {
  const h = beatAt(p, t);
  if (!h) return { dx: 0, act: null, k: 0, look: 'word', walking: false };
  const bt = p.beats[h.i];
  const walks = p.beats.map((q, i) => (q.act === 'walk' ? i : -1)).filter((i) => i >= 0);
  const out = walks[0];
  const back = walks[1];
  let dx = 0;
  if (out !== undefined && h.i > out && (back === undefined || h.i < back)) dx = p.step;
  if (h.i === out) dx = p.step * easeInOut(h.u);
  if (h.i === back) dx = p.step * (1 - easeInOut(h.u));
  return { dx, act: bt.act === 'walk' ? null : bt.act, k: h.u, look: bt.look, walking: bt.act === 'walk' };
}

/** Where his hands hold a letter over his head (letter's bottom centre), document px. */
const overhead = (me: Me, dx: number): Pt => ({ x: me.x + dx + me.facing * 1.5 * me.scale, y: me.feet - 62 * me.scale });

/**
 * Every letter the trick moves, posed at t (document px offsets, degrees). Empty once it's over
 * (all home). `word` is the same word the program was planned for.
 */
export function lettersAt(p: LetterProgram, word: readonly LBox[], me: Me, t: number): Map<string, GlyphPose> {
  const out = new Map<string, GlyphPose>();
  const h = beatAt(p, t);
  if (!h) return out;
  const [end, prev] = endLetters(word, me.facing)!;
  const at = (i: number) => p.beats[i];
  const { i, u } = h;
  const kind = at(i).act;
  const e = easeInOut(u);
  switch (p.trick) {
    case 'carry': {
      const home: GlyphPose = { x: 0, y: 0 };
      const held = (dx: number): GlyphPose => {
        const o = overhead(me, dx);
        return { x: o.x - cx(end), y: o.y - end.bottom, ox: 0.5, oy: 1 };
      };
      let pose: GlyphPose = home;
      if (i === 0) pose = { rot: -me.facing * 4 * Math.sin(u * Math.PI), ox: 0.5, oy: 1 }; // he takes hold: it rocks
      else if (i === 1) pose = mixPose(home, held(0), e);
      else if (i === p.beats.length - 1) pose = mixPose(held(0), home, e);
      else pose = held(meAt(p, t).dx);
      // a slight sway while it's held up
      if (i >= 1 && i < p.beats.length - 1) pose = { ...pose, rot: Math.sin(t * 5) * 3 };
      if (kind === 'heft' && i === 1) pose = { ...pose, y: (pose.y ?? 0) - Math.sin(u * Math.PI) * 4 };
      out.set(end.key, pose);
      break;
    }
    case 'swap': {
      const d = cx(end) - cx(prev!);
      const swapK = i === 1 ? e : i === 2 ? 1 : i === 3 ? 1 - e : 0;
      const arc = i === 1 || i === 3 ? Math.sin(u * Math.PI) : 0;
      const lift = Math.max(hgt(end), hgt(prev!)) * 0.55;
      out.set(end.key, { x: -d * swapK, y: -lift * arc, ox: 0.5, oy: 1 });
      out.set(prev!.key, { x: d * swapK, y: lift * 0.12 * arc, ox: 0.5, oy: 1 });
      if (i === 0) out.set(end.key, { rot: -me.facing * 3 * Math.sin(u * Math.PI), ox: 0.5, oy: 1 });
      break;
    }
    case 'nudge': {
      // the whole word turns about its far bottom corner (he's pushing its near end)
      const far = me.facing < 0 ? word[0] : word[word.length - 1];
      const pivot = { x: me.facing < 0 ? far.left : far.right, y: Math.max(...word.map((g) => g.bottom)) };
      const amt = i === 0 ? e : i === 1 ? 1 : i === 2 ? 1 - e : 0;
      const deg = me.facing * 4 * amt; // facing -1 pushes the right end down-left: tilts it anticlockwise
      const wob = i === 1 ? Math.sin(u * Math.PI * 3) * 0.4 * (1 - u) : 0;
      const shove = me.facing * 3 * amt;
      for (const g of word) out.set(g.key, rigid(g, pivot, deg + wob, shove));
      break;
    }
    case 'stack': {
      const onto: GlyphPose = { x: cx(prev!) - cx(end), y: prev!.top - end.bottom + hgt(end) * 0.12, ox: 0.5, oy: 1 };
      let pose: GlyphPose = {};
      if (i === 0) pose = { rot: -me.facing * 4 * Math.sin(u * Math.PI), ox: 0.5, oy: 1 };
      else if (i === 1) {
        // up and over, an arc
        const arc = Math.sin(u * Math.PI) * hgt(end) * 0.5;
        pose = { x: (onto.x ?? 0) * e, y: (onto.y ?? 0) * e - arc, ox: 0.5, oy: 1 };
      } else if (i === p.beats.length - 1) pose = mixPose(onto, { x: 0, y: 0 }, e);
      else {
        // balanced on top: a wobble that dies down
        const since = t - at(2).t0;
        pose = { ...onto, rot: Math.sin(since * 9) * 7 * Math.exp(-since * 2.2) };
      }
      out.set(end.key, pose);
      break;
    }
    case 'spin': {
      if (i === 0) out.set(end.key, { rot: -me.facing * 3 * Math.sin(u * Math.PI), ox: 0.5, oy: 1 });
      else if (i === 1) {
        const spin = easeInOut(clamp(u / 0.75));
        const settle = u > 0.75 ? Math.sin(((u - 0.75) / 0.25) * Math.PI * 2) * 6 * (1 - u) * 4 : 0;
        out.set(end.key, { rot: -me.facing * (360 * spin) + settle, y: -Math.sin(clamp(u / 0.75) * Math.PI) * hgt(end) * 0.18, ox: 0.5, oy: 0.55 });
      }
      break;
    }
  }
  return out;
}

const mixPose = (a: GlyphPose, b: GlyphPose, k: number): GlyphPose => ({
  x: lerp(a.x ?? 0, b.x ?? 0, k),
  y: lerp(a.y ?? 0, b.y ?? 0, k),
  rot: lerp(a.rot ?? 0, b.rot ?? 0, k),
  ox: b.ox ?? a.ox ?? 0.5,
  oy: b.oy ?? a.oy ?? 1,
});

/** A letter's pose for a rigid turn of its word by `deg` about `pivot` (plus a shove in x). */
function rigid(g: LBox, pivot: Pt, deg: number, shove: number): GlyphPose {
  const a = (deg * Math.PI) / 180;
  const o = { x: cx(g), y: g.bottom }; // its own origin (bottom centre)
  const rx = pivot.x + (o.x - pivot.x) * Math.cos(a) - (o.y - pivot.y) * Math.sin(a);
  const ry = pivot.y + (o.x - pivot.x) * Math.sin(a) + (o.y - pivot.y) * Math.cos(a);
  return { x: rx - o.x + shove, y: ry - o.y, rot: deg, ox: 0.5, oy: 1 };
}
