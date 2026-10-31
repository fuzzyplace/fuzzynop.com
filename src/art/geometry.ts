export type Pt = { x: number; y: number };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** Two-link inverse kinematics. bend=+1/-1 picks the elbow side. */
export function solveIK(base: Pt, target: Pt, l1: number, l2: number, bend: 1 | -1) {
  const dx = target.x - base.x;
  const dy = target.y - base.y;
  const a = Math.atan2(dy, dx);
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const shoulder = a + bend * Math.acos(clamp(cosA, -1, 1));
  const elbow = { x: base.x + l1 * Math.cos(shoulder), y: base.y + l1 * Math.sin(shoulder) };
  const wrist = { x: base.x + d * Math.cos(a), y: base.y + d * Math.sin(a) };
  const forearm = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
  return { elbow, wrist, shoulder, forearm };
}

/** Flat-top hexagon points string. */
export const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const t = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`;
  }).join(' ');

/** Deterministic PRNG so decor is identical on every render. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
