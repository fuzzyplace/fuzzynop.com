/**
 * v2.13: he always appears. Pure: no DOM, no clock reads. The stage asks `unseen` each frame whether
 * he's out of sight for no good reason; once that has lasted `WATCH_AFTER` s, `overdue` says so and
 * the stage puts him back on screen (an ink-in at the best place there is, the screen floor at worst).
 *
 * Good reasons to be out of sight for a moment: mid-teleport (within the hop's own length), mid-fall
 * (within the fall's own time), in the visitor's hand (wherever they drag him), the page hidden.
 */
import type { Mode } from './puppet-machine';

/** s out of sight (for no good reason) before he's put back on screen */
export const WATCH_AFTER = 1.2;
/** s of slack past a hop's or a fall's own length before it counts as stuck */
export const SLACK = 0.35;

export type Sight = {
  mode: Mode;
  hidden: boolean; // the stage has him out of sight (display none)
  pageHidden: boolean;
  /** s since the current teleport began, and its whole length (mode 'teleport'); null: no hop */
  hop: { t: number; dur: number } | null;
  /** s since the current fall began, and its time (mode 'falling'); null: no fall */
  fall: { t: number; T: number } | null;
  /** his drawn body on screen, below the header (screen px) */
  body: { left: number; right: number; top: number; bottom: number };
  view: { w: number; h: number; header: number };
};

/** On screen enough to be seen: part of him below the header and inside the view. */
export function inView(b: Sight['body'], v: Sight['view']) {
  return b.bottom > v.header + 6 && b.top < v.h - 2 && b.right > 2 && b.left < v.w - 2;
}

/** He's out of sight right now, and it isn't one of the good reasons. */
export function unseen(o: Sight): boolean {
  if (o.pageHidden) return false;
  if (o.mode === 'grabbed' || o.mode === 'carried') return false; // the visitor has him
  if (o.mode === 'teleport') return !o.hop || o.hop.t > o.hop.dur + SLACK; // within its length: it's the ink (where it ends up is checked once he's there)
  if (o.mode === 'falling') {
    if (!o.fall) return true;
    return o.fall.t > o.fall.T + SLACK && !inView(o.body, o.view);
  }
  return o.hidden || !inView(o.body, o.view);
}

/** Track how long he's been unseen; `since` is the ms it began (0: he's seen). Returns the new `since` and whether it's time to step in. */
export function overdue(since: number, isUnseen: boolean, now: number, after = WATCH_AFTER): { since: number; act: boolean } {
  if (!isUnseen) return { since: 0, act: false };
  const t0 = since || now;
  return { since: t0, act: now - t0 >= after * 1000 };
}
