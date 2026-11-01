/**
 * Where the claw holds him up in the air when there's nowhere on screen to set him down. Pure.
 *
 * He must never hang over plate text, and the claw's arm (a column from the top of the screen down
 * to his collar) shouldn't park over it either. So: search the viewport for the spot whose body box
 * overlaps no plate (a gutter beside the plates, a gap between them, the fog above a plate's top
 * edge), preferring one where the arm's column is clear too, and the one nearest the preferred spot.
 * If nothing is fully clear (a plate fills a narrow screen), the least overlap wins.
 */
import type { Pt } from './geometry';

export type Box = { left: number; top: number; right: number; bottom: number };
export type HoldOpts = {
  vw: number;
  vh: number;
  minTop: number; // px: his head stays below this (the fixed header plus a margin)
  plates: Box[]; // viewport px: content to keep clear of
  up: number; // px from his origin up to the claw's grip (top of the box we keep clear)
  down: number; // px from his origin down to his dangling feet
  half: number; // px half-width of him hanging (limbs swing a little)
  pref: Pt; // where the claw would like to hold him
  pad?: number; // px kept from the viewport's sides
};

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export function holdSpot(o: HoldOpts): Pt {
  const pad = o.pad ?? 16;
  const x0 = pad + o.half;
  const x1 = o.vw - pad - o.half;
  const y0 = o.minTop + o.up;
  const y1 = o.vh - o.down - 8;
  if (x1 < x0 || y1 < y0) return o.pref;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = x0; x <= x1; x += 8) xs.push(x);
  xs.push(x1);
  for (let y = y0; y <= y1; y += 10) ys.push(y);
  ys.push(y1);
  let best = o.pref;
  let bestScore = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const body: Box = { left: x - o.half, right: x + o.half, top: y - o.up, bottom: y + o.down };
      const arm: Box = { left: x - 6, right: x + 6, top: 0, bottom: y - o.up };
      let hit = 0;
      let armHit = 0;
      for (const p of o.plates) {
        hit += overlap(body, p);
        armHit += overlap(arm, p);
      }
      // body over text is what matters most; then the arm parked over it; then distance
      const score = hit * 100 + armHit * 4 + Math.hypot(x - o.pref.x, (y - o.pref.y) * 0.7);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}
