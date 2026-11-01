import { rng } from './geometry';

/**
 * Procedural torn-paper outlines for the printed plates.
 * Pure: (w, h, seed) -> SVG path `d` in the plate's own px space (CSS `clip-path: path()`).
 * Every vertex stays inside [0,w]x[0,h] and never more than `depth` px in from the
 * nearest edge, so the plate padding (>= 28px) always clears the deepest tear.
 */
export const TEAR_DEPTH = 14;

/** FNV-1a: stable numeric seed from a plate id. */
export function hashSeed(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type Opts = { depth?: number; step?: number; bites?: number };

/** One edge in local coords: t along the edge (0..len), d inward (0..cap). */
function edge(cap: number, step: number, r: () => number, bites: number[], t0: number, t1: number) {
  const pts: [number, number][] = [[t0, 0]];
  const hexR = cap / 0.866;
  const spans = bites.map((c) => [c - hexR, c + hexR] as const);
  let t = t0;
  let tear = 0; // remaining points in a deeper tear
  while (true) {
    t = pts[pts.length - 1][0] + step * (0.5 + r());
    if (t >= t1 - step * 0.4) break;
    const bite = spans.findIndex(([a]) => t >= a);
    if (bite >= 0) {
      const last = pts[pts.length - 1][0];
      const c = Math.max((spans[bite][0] + spans[bite][1]) / 2, last + hexR + 1);
      const a = c - hexR;
      const b = c + hexR;
      // half-hexagon bite: flat floor at depth, 60deg walls
      pts.push([a, 0], [c - hexR / 2, cap], [c + hexR / 2, cap], [b, 0]);
      spans.splice(bite, 1);
      continue;
    }
    const roll = r();
    if (tear === 0 && roll < 0.08) tear = 2 + Math.floor(r() * 2);
    if (roll > 0.96) {
      // sharp V notch
      const w = 3 + r() * 4;
      pts.push([t, r() * 1.5], [t + w, cap * (0.75 + r() * 0.25)], [t + w * 2, r() * 1.5]);
      continue;
    }
    const d = tear > 0 ? cap * (0.45 + r() * 0.55) : cap * 0.35 * r() * r();
    if (tear > 0) tear--;
    pts.push([t, d]);
  }
  pts.push([t1, 0]);
  return pts.filter(([pt]) => pt >= t0 && pt <= t1);
}

export function tornPath(w: number, h: number, seed: number, opts: Opts = {}) {
  if (!(w > 0 && h > 0)) return '';
  const cap = Math.max(0, Math.min(opts.depth ?? TEAR_DEPTH, w / 4, h / 4));
  const step = Math.max(6, opts.step ?? 26);
  const r = rng(seed);
  const lens = [w, h, w, h];
  // corner cuts: legs a (end of incoming edge), b (start of outgoing). ab/(a+b) <= cap
  const corner = () => (r() < 0.35 ? [r() * 2, r() * 2] : [2 + r() * cap * 2, 2 + r() * cap * 2]);
  const corners = [corner(), corner(), corner(), corner()]; // TL, TR, BR, BL
  // 1-2 hex bites on random edges, away from the corners
  const nb = opts.bites ?? 1 + Math.floor(r() * 2);
  const bites: number[][] = [[], [], [], []];
  for (let i = 0; i < nb; i++) {
    const e = Math.floor(r() * 4);
    if (lens[e] > 160) bites[e].push(lens[e] * (0.2 + r() * 0.6));
  }
  const map = (e: number, t: number, d: number): [number, number] =>
    e === 0 ? [t, d] : e === 1 ? [w - d, t] : e === 2 ? [w - t, h - d] : [d, h - t];
  const out: [number, number][] = [];
  for (let e = 0; e < 4; e++) {
    const len = lens[e];
    const t0 = Math.min(corners[e][1], len / 3);
    const t1 = len - Math.min(corners[(e + 1) % 4][0], len / 3);
    const pts = edge(cap, step, r, bites[e].sort((a, b) => a - b), t0, t1);
    for (const [t, d] of pts) out.push(map(e, t, Math.min(d, cap)));
  }
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  return (
    out
      .map(([x, y], i) => `${i ? 'L' : 'M'}${f(Math.min(w, Math.max(0, x)))} ${f(Math.min(h, Math.max(0, y)))}`)
      .join('') + 'Z'
  );
}

export type CutLayer = { dx: number; dy: number; rot: number; seed: number };

/** Per-plate collage layout: base rotation and two backing layers peeking out. */
export function cutLayout(seed: number) {
  const r = rng(seed ^ 0x9e3779b9);
  const sign = () => (r() < 0.5 ? -1 : 1);
  const rot = sign() * (0.5 + r() * 0.7);
  const layer = (i: number): CutLayer => ({
    dx: sign() * (5 + r() * 8),
    dy: 6 + r() * 8,
    rot: sign() * (0.6 + r() * 1.2) * (i + 1) * 0.6,
    seed: (seed + i + 1) >>> 0,
  });
  return { rot, layers: [layer(0), layer(1)] };
}
