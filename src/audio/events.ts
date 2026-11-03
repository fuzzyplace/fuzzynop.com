import type { SoundName } from './mix';

/**
 * What the page is doing, turned into sound cues (pure, tested in events.test.ts). The engine feeds
 * these from the bus hooks; nothing here touches Web Audio or the DOM.
 */

export type Cue = { name: SoundName; gain?: number; rate?: number; at?: number; pan?: number };

// ---- the character (puppet-machine.ts modes, and his ink while he teleports) ----

/**
 * Cues for one frame of him, from what changed since the last frame. Nothing on the first frame
 * seen (`prev` null): sound that starts mid-scene doesn't narrate what already happened.
 * - the claw closes on him (→ carried): clamp; it lets go (carried → anything): release
 * - he lands after a fall (falling → anything but teleport): land
 * - a stunt starts (→ stunt): a small flourish
 */
export function puppetCues(prev: string | null, mode: string): Cue[] {
  if (prev === null || prev === mode) return [];
  const out: Cue[] = [];
  if (prev === 'carried') out.push({ name: 'release' });
  if (mode === 'carried') out.push({ name: 'clamp' });
  if (prev === 'falling' && mode !== 'teleport') out.push({ name: 'land' });
  if (mode === 'stunt') out.push({ name: 'stunt' });
  return out;
}

/**
 * His ink: `true` while he runs off into it, `false` while he gathers back out, undefined otherwise.
 * Into ink: inkOut; starting to gather: inkIn (panned where he reappears). First frame seen: nothing.
 */
export function inkCue(prev: boolean | undefined | null, ink: boolean | undefined): Cue | null {
  if (prev === null || prev === ink) return null;
  if (ink === true) return { name: 'inkOut' };
  if (ink === false) return { name: 'inkIn' };
  return null;
}

// ---- the hero tagline (Hero.tsx: the arm writes it line by line) ----

/** Lines fully written now (reveal fractions at 1). */
export const linesDone = (q: readonly number[]) => q.reduce((n, x) => n + (x >= 1 ? 1 : 0), 0);

/** A nib scratch as the arm finishes each line (none for lines already written when sound started). */
export function writtenCue(prev: number | null, q: readonly number[]): Cue | null {
  return prev !== null && linesDone(q) > prev ? { name: 'scratch' } : null;
}

// ---- plate assembly (assembly.ts plans) ----

export type PlanLike = {
  w: number;
  landed: number;
  groups: { box: { x: number; w: number }; mode: 'carry' | 'deal'; tP: number }[];
};

/** Plan seconds of a jump (nav link, focus) rather than playback: only the last piece sounds. */
export const JUMP = 1.5;
/** At most this many sounds for one frame's worth of clock. */
export const PLATE_MAX = 3;
/** How each kind of placement sits: carried pieces (titles, CTA, badges) lower and fuller, body lines small. */
export const PLACE = { carry: { rate: 0.85, gain: 1 }, deal: { rate: 1, gain: 0.7 } } as const;

/**
 * Cues for an assembly clock moving from t0 to t1: a felt thud as the sheet lands, and a small tick
 * as each piece is put in its slot. Forwards only; scrolling back is silent.
 */
export function plateCues(p: PlanLike, t0: number, t1: number): Cue[] {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return [];
  const hit = (t: number) => t > t0 && t <= t1;
  const all: (Cue & { t: number })[] = [];
  if (hit(p.landed)) all.push({ name: 'sheet', t: p.landed });
  for (const g of p.groups) {
    if (!hit(g.tP)) continue;
    const pan = p.w > 0 ? (((g.box.x + g.box.w / 2) / p.w) * 2 - 1) * 0.35 : 0;
    all.push({ name: 'tick', ...PLACE[g.mode], pan, t: g.tP });
  }
  if (!all.length) return [];
  all.sort((a, b) => a.t - b.t);
  const keep = t1 - t0 > JUMP ? all.slice(-1) : all.slice(-PLATE_MAX);
  return keep.map(({ t: _t, ...c }, i) => ({ ...c, at: i * 0.055 }));
}
