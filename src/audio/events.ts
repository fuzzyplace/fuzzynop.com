import type { SoundName } from './mix';

/**
 * What the page is doing, turned into sound cues (pure, tested in events.test.ts). The engine feeds
 * these from the bus hooks; nothing here touches Web Audio or the DOM.
 */

export type Cue = { name: SoundName; gain?: number; rate?: number; at?: number; pan?: number };

// ---- the character ----

/** The claw has closed on him (grabbed → carried): the one moment he makes a sound. */
export function pickCue(prev: string | null, mode: string): Cue | null {
  return prev !== null && prev !== mode && mode === 'carried' ? { name: 'pick' } : null;
}

// ---- the hero tagline (Hero.tsx: the arm writes it line by line) ----

/** Lines fully written now (reveal fractions at 1). */
export const linesDone = (q: readonly number[]) => q.reduce((n, x) => n + (x >= 1 ? 1 : 0), 0);

/** A pop as the arm finishes each line (none for lines already written when sound started). */
export function writtenCue(prev: number | null, q: readonly number[]): Cue | null {
  return prev !== null && linesDone(q) > prev ? { name: 'pop', rate: 0.92 } : null;
}

// ---- plate assembly (assembly.ts plans) ----

export type PlanLike = {
  w: number;
  landed: number;
  groups: { box: { x: number; w: number }; mode: 'carry' | 'deal'; tP: number }[];
};

/** Plan seconds of a jump (nav link, focus) rather than playback: only the last piece pops. */
export const JUMP = 1.5;
/** At most this many pops for one frame's worth of clock. */
export const PLATE_MAX = 3;
/** How each kind of placement sits: the sheet lowest, carried pieces (titles, CTA, badges) round, body lines small. */
export const PLACE = { sheet: { rate: 0.78, gain: 1 }, carry: { rate: 0.9, gain: 0.95 }, deal: { rate: 1.12, gain: 0.7 } } as const;

/**
 * Pops for an assembly clock moving from t0 to t1: one as the sheet lands, and one as each piece is
 * put in its slot. Forwards only; scrolling back is silent.
 */
export function plateCues(p: PlanLike, t0: number, t1: number): Cue[] {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return [];
  const hit = (t: number) => t > t0 && t <= t1;
  const all: (Cue & { t: number })[] = [];
  if (hit(p.landed)) all.push({ name: 'pop', ...PLACE.sheet, t: p.landed });
  for (const g of p.groups) {
    if (!hit(g.tP)) continue;
    const pan = p.w > 0 ? (((g.box.x + g.box.w / 2) / p.w) * 2 - 1) * 0.35 : 0;
    all.push({ name: 'pop', ...PLACE[g.mode], pan, t: g.tP });
  }
  if (!all.length) return [];
  all.sort((a, b) => a.t - b.t);
  const keep = t1 - t0 > JUMP ? all.slice(-1) : all.slice(-PLATE_MAX);
  return keep.map(({ t: _t, ...c }, i) => ({ ...c, at: i * 0.055 }));
}
