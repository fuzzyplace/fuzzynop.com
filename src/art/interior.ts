/**
 * Inside a plate: the free space between its words, where the character can be without covering
 * anything a reader needs. Pure: no DOM, no clock. The stage measures an assembled plate (its box
 * and the boxes of its text, badges and controls, document px) and asks `freeSpaces` for nooks.
 *
 * A nook is a floor (his feet's y) and an x-range with his whole body box clear above it: the
 * plate's margins, the room beside a short line or a list item, the gap left and right of the
 * circuit tree, the space after a title's last word. Floors are where something gives him a line
 * to stand on: the top of a block of text (standing on it, never in front of it), the bottom of a
 * line (beside it, on its baseline), and the plate's inner bottom edge.
 *
 * Inside he's drawn smaller (`INSIDE`: further into the paper), so `w` / `h` are his size there.
 */
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Nook = {
  left: number; // where his feet may go (centre of his body), document px
  right: number;
  y: number; // floor: his feet
  top: number; // y - h: the top of his head when standing
  lie: boolean; // wide enough to lie down in
  wall: -1 | 0 | 1; // a word right beside it on that side (he can peek at it / read it), 0 = none
  title: boolean; // beside a title's line (letters he could play with)
};
export type InteriorOpts = {
  inset: number; // px from the plate's box to where he may be (torn edge, padding)
  pad: number; // px he keeps from any text
  w: number; // px his body is wide (shoulder to shoulder, plus a little)
  h: number; // px feet to the top of his head
  lieW: number; // px he needs lying down
  max?: number; // nooks per plate at most (default 8)
  titles?: readonly Rect[]; // title line boxes (a nook beside one is `title`)
};

/** Size factor inside a plate (he's further in: smaller). */
export const INSIDE = 0.7;

type Iv = [number, number];
function merge(ivs: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const iv of [...ivs].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/**
 * Nooks inside `plate`, given the boxes he must not cover (`text`). Each floor is tried once; for
 * each, the x-ranges where his body box (`w` wide, `h` tall, `pad` from everything) is clear become
 * nooks (`left`/`right` are where his centre may go). Overlapping nooks keep the wider. Sorted top
 * to bottom, then left to right.
 */
export function freeSpaces(plate: Rect, text: readonly Rect[], o: InteriorOpts): Nook[] {
  const inner: Rect = { left: plate.left + o.inset, right: plate.right - o.inset, top: plate.top + o.inset, bottom: plate.bottom - o.inset };
  if (inner.right - inner.left < o.w || inner.bottom - inner.top < o.h) return [];
  const floors = new Set<number>([Math.round(inner.bottom)]);
  for (const r of text) {
    floors.add(Math.round(r.top - o.pad));
    floors.add(Math.round(r.bottom));
  }
  const ys = [...floors].filter((y) => y - o.h >= inner.top && y <= inner.bottom).sort((a, b) => a - b);
  const titles = o.titles ?? [];
  const found: Nook[] = [];
  for (const y of ys) {
    const top = y - o.h;
    const blocked: Iv[] = [];
    for (const r of text) if (r.top - o.pad < y && r.bottom + o.pad > top) blocked.push([r.left - o.pad, r.right + o.pad]);
    const walls = merge(blocked);
    let x = inner.left;
    const free: { iv: Iv; l: boolean; r: boolean }[] = [];
    let wallL = false;
    for (const [a, b] of walls) {
      if (a > x) free.push({ iv: [x, Math.min(a, inner.right)], l: wallL, r: a < inner.right });
      x = Math.max(x, b);
      wallL = true;
      if (x >= inner.right) break;
    }
    if (x < inner.right) free.push({ iv: [x, inner.right], l: wallL && x > inner.left, r: false });
    for (const { iv, l, r } of free) {
      const width = iv[1] - iv[0];
      if (width < o.w) continue;
      const left = iv[0] + o.w / 2;
      const right = iv[1] - o.w / 2;
      // which side a word is right beside him (on the floor's line), the nearer one if both
      const wall: -1 | 0 | 1 = l && r ? (iv[0] - inner.left < inner.right - iv[1] ? -1 : 1) : l ? -1 : r ? 1 : 0;
      const title = titles.some((t) => t.bottom > top && t.top < y && (Math.abs(t.right - iv[0]) <= o.pad * 2 + 1 || Math.abs(iv[1] - t.left) <= o.pad * 2 + 1));
      found.push({ left, right, y, top, lie: width >= o.lieW, wall, title });
    }
  }
  // overlapping nooks (the same room seen from two floors): keep the wider (then the lower floor)
  const keep: Nook[] = [];
  for (const n of [...found].sort((a, b) => b.right - b.left - (a.right - a.left) || b.y - a.y)) {
    const clash = keep.some((k) => {
      const ox = Math.min(k.right, n.right) - Math.max(k.left, n.left) + o.w;
      const oy = Math.min(k.y, n.y) - Math.max(k.top, n.top);
      return ox > 0.5 * (n.right - n.left + o.w) && oy > 0.5 * o.h;
    });
    if (!clash) keep.push(n);
    if (keep.length >= (o.max ?? 8)) break;
  }
  return keep.sort((a, b) => a.y - b.y || a.left - b.left);
}

/** His body box standing at (x, feet y) in a nook: for checks. */
export const bodyAt = (x: number, y: number, o: Pick<InteriorOpts, 'w' | 'h'>): Rect => ({ left: x - o.w / 2, right: x + o.w / 2, top: y - o.h, bottom: y });
export const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
