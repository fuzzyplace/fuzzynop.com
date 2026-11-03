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

// ---- plate assembly (assembly.ts plans) ----

export type PlanLike = {
  w: number;
  groups: { box: { x: number; w: number }; mode: 'carry' | 'deal'; tP: number }[];
};

/** Plan seconds of a jump (nav link, focus) rather than playback: only the last piece ticks. */
export const JUMP = 1.5;
/** At most this many ticks for one frame's worth of clock. */
export const PLATE_MAX = 2;

/**
 * Ticks for an assembly clock moving from t0 to t1: one as each key piece lands in its slot (the
 * carried ones: titles, the CTA, the badge row; body lines are placed in silence, or a plate would
 * chatter). Forwards only; scrolling back is silent.
 */
export function plateCues(p: PlanLike, t0: number, t1: number): Cue[] {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return [];
  const all: (Cue & { t: number })[] = [];
  for (const g of p.groups) {
    if (g.mode !== 'carry' || !(g.tP > t0 && g.tP <= t1)) continue;
    const pan = p.w > 0 ? (((g.box.x + g.box.w / 2) / p.w) * 2 - 1) * 0.3 : 0;
    all.push({ name: 'tick', pan, t: g.tP });
  }
  if (!all.length) return [];
  all.sort((a, b) => a.t - b.t);
  const keep = t1 - t0 > JUMP ? all.slice(-1) : all.slice(-PLATE_MAX);
  return keep.map(({ t: _t, ...c }, i) => ({ ...c, at: i * 0.05 }));
}
