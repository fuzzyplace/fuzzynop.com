/**
 * How the character gets from one printed perch to another under his own power: walk along a surface,
 * jump a gap, climb the side of a higher plate, or step off an edge and fall. Pure: no DOM, no clock.
 *
 * Units: document px. A Surface is the walkable top of a perch (its extent), `y` = where his feet go.
 * `planRoute` searches the surfaces (cheapest total time, few hops); `sampleMove` turns one Move into
 * a feet position at t ∈ [0, 1] plus which action the body should show.
 */
import { clamp, easeInOut, lerp, type Pt } from './geometry';

/**
 * left/right = where he may stand; y = the top; bottom = the element's lower edge;
 * x0/x1 = the element's real sides (he climbs just outside them). bottom/x0/x1 default to y/left/right.
 */
export type Surface = { left: number; right: number; y: number; bottom?: number; x0?: number; x1?: number };
export type MoveKind = 'walk' | 'jump' | 'climb' | 'fall';
/** `grab` (climb only): y where the plate's side starts; below it he first jumps up to catch the edge. */
export type Move = { kind: MoveKind; from: Pt; to: Pt; duration: number; onto: number; grab?: number };
export type Limits = {
  speed: number; // px/s walking
  jumpUp: number; // px he can jump up
  gap: number; // px horizontal gap he can jump
  climb: number; // px he can climb up a plate's side
  reach: number; // px he can jump up to catch a plate's lower edge
  climbSpeed: number; // px/s
  edge: number; // px he stands off a plate's edge to climb it / steps past an edge to fall
  inset: number; // px inside a surface's edge where he lands
  gravity: number; // px/s²
};
export const LIMITS: Limits = { speed: 56, jumpUp: 150, gap: 180, climb: 900, reach: 170, edge: 14, inset: 22, gravity: 2200, climbSpeed: 170 };
const GRAB_JUMP = 0.4; // s, the jump up to catch a plate's lower edge

type Link = { kind: 'jump' | 'climb' | 'fall'; takeoff: number; land: number; grab?: number };

const inside = (x: number, s: Surface) => x >= s.left && x <= s.right;
const into = (x: number, s: Surface, inset: number) =>
  s.right - s.left <= 2 * inset ? (s.left + s.right) / 2 : clamp(x, s.left + inset, s.right - inset);

export function moveDuration(kind: MoveKind, from: Pt, to: Pt, lim: Limits = LIMITS, grab?: number) {
  const dx = Math.abs(to.x - from.x);
  const dy = to.y - from.y;
  switch (kind) {
    case 'walk':
      return dx / lim.speed;
    case 'jump':
      return 0.5 + Math.hypot(dx, dy) * 0.0012;
    case 'climb': {
      const air = grab !== undefined && grab < from.y ? GRAB_JUMP : 0;
      const wall = grab !== undefined && grab < from.y ? grab - to.y : -dy;
      return 0.45 + air + Math.max(0, wall) / lim.climbSpeed;
    }
    case 'fall':
      return 0.18 + Math.sqrt((2 * Math.max(0, dy)) / lim.gravity);
  }
}

/** The ways from surface a onto surface b in one move (best first), or [] if he can't. */
export function links(a: Surface, b: Surface, lim: Limits = LIMITS): Link[] {
  const dy = b.y - a.y; // + = b is lower
  const out: Link[] = [];
  const gapR = b.left - a.right; // b to the right of a
  const gapL = a.left - b.right; // b to the left of a
  if (dy > 4) {
    // lower: step off an edge and drop onto it, or jump down across a gap
    for (const [edge, dir] of [[a.right, 1], [a.left, -1]] as const) {
      const x = edge + dir * lim.edge;
      if (inside(x, b)) out.push({ kind: 'fall', takeoff: edge - dir * 2, land: into(x + dir * 8, b, lim.inset) });
    }
    if (!out.length) {
      if (gapR >= -lim.edge && gapR <= lim.gap) out.push({ kind: 'jump', takeoff: a.right - 4, land: into(b.left, b, lim.inset) });
      if (gapL >= -lim.edge && gapL <= lim.gap) out.push({ kind: 'jump', takeoff: a.left + 4, land: into(b.right, b, lim.inset) });
      // b sits under a, narrower: hop down off the nearer edge
      if (b.left >= a.left && b.right <= a.right) {
        const toR = a.right - b.right < b.left - a.left;
        const edge = toR ? a.right : a.left;
        if (Math.abs(edge - (toR ? b.right : b.left)) <= lim.gap) out.push({ kind: 'jump', takeoff: edge - (toR ? 4 : -4), land: into(toR ? b.right : b.left, b, lim.inset) });
      }
    }
  } else if (dy < -4) {
    const up = -dy;
    // higher: climb its side from beside it (jumping to catch its lower edge if that's above him), or jump up across a gap
    const bottom = b.bottom ?? b.y;
    if (up <= lim.jumpUp) {
      // straight up onto something overhead (a ledge above the surface he's on): jump from under its middle
      const mid = clamp((b.left + b.right) / 2, a.left, a.right);
      if (inside(mid, b)) out.push({ kind: 'jump', takeoff: mid, land: mid });
    }
    if (up <= lim.climb && a.y - bottom <= lim.reach) {
      for (const [side, edge, dir] of [[b.x0 ?? b.left, b.left, -1], [b.x1 ?? b.right, b.right, 1]] as const) {
        const x = side + dir * lim.edge;
        if (inside(x, a)) out.push({ kind: 'climb', takeoff: x, land: into(edge, b, lim.inset), grab: bottom < a.y ? bottom : undefined });
      }
    }
    if (up <= lim.jumpUp) {
      if (gapR > -lim.edge && gapR <= lim.gap) out.push({ kind: 'jump', takeoff: a.right - 4, land: into(b.left, b, lim.inset) });
      if (gapL > -lim.edge && gapL <= lim.gap) out.push({ kind: 'jump', takeoff: a.left + 4, land: into(b.right, b, lim.inset) });
    }
  } else {
    // level: a hop across
    if (gapR >= 0 && gapR <= lim.gap) out.push({ kind: 'jump', takeoff: a.right - 4, land: into(b.left, b, lim.inset) });
    if (gapL >= 0 && gapL <= lim.gap) out.push({ kind: 'jump', takeoff: a.left + 4, land: into(b.right, b, lim.inset) });
  }
  return out;
}

/**
 * Cheapest route (by time) from x on surface `from` to x on surface `to`, at most `maxHops` hops.
 * Returns the Moves (walks included) or null when he can't get there on his own.
 */
export function planRoute(
  surfaces: Surface[],
  from: { s: number; x: number },
  to: { s: number; x: number },
  lim: Limits = LIMITS,
  maxHops = 3,
): Move[] | null {
  const S = surfaces;
  if (!S[from.s] || !S[to.s]) return null;
  const walk = (s: number, x0: number, x1: number): Move[] =>
    Math.abs(x1 - x0) < 1 ? [] : [{ kind: 'walk', from: { x: x0, y: S[s].y }, to: { x: x1, y: S[s].y }, duration: moveDuration('walk', { x: x0, y: 0 }, { x: x1, y: 0 }, lim), onto: s }];
  const x0 = clamp(from.x, S[from.s].left, S[from.s].right);
  const goal = clamp(to.x, S[to.s].left, S[to.s].right);
  if (from.s === to.s) return walk(from.s, x0, goal);

  // best-first over (surface, x, hops): surfaces are few (a page of plates), so a simple frontier is plenty
  type Node = { s: number; x: number; cost: number; moves: Move[] };
  const best = new Map<number, number>();
  let frontier: Node[] = [{ s: from.s, x: x0, cost: 0, moves: [] }];
  let found: Node | null = null;
  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next: Node[] = [];
    for (const n of frontier) {
      for (let j = 0; j < S.length; j++) {
        if (j === n.s) continue;
        for (const l of links(S[n.s], S[j], lim)) {
          const lead = walk(n.s, n.x, l.takeoff);
          const a = { x: l.takeoff, y: S[n.s].y };
          const b = { x: l.land, y: S[j].y };
          const mv: Move = { kind: l.kind, from: a, to: b, duration: moveDuration(l.kind, a, b, lim, l.grab), onto: j, ...(l.grab !== undefined ? { grab: l.grab } : {}) };
          const moves = [...n.moves, ...lead, mv];
          const cost = moves.reduce((t, m) => t + m.duration, 0);
          if (j === to.s) {
            const all = [...moves, ...walk(j, l.land, goal)];
            const total = all.reduce((t, m) => t + m.duration, 0);
            if (!found || total < found.cost) found = { s: j, x: goal, cost: total, moves: all };
            continue;
          }
          if ((best.get(j) ?? Infinity) <= cost) continue;
          best.set(j, cost);
          next.push({ s: j, x: l.land, cost, moves });
        }
      }
    }
    frontier = next.filter((n) => !found || n.cost < found.cost);
  }
  return found ? (found as Node).moves : null;
}

export type Sample = { p: Pt; action: 'walk' | 'jump' | 'climb' | 'fall'; k: number };

/** Feet position along a move at t ∈ [0, 1]; `k` = progress of the action for the body pose. */
export function sampleMove(m: Move, t: number, hop = 46): Sample {
  t = clamp(t);
  const { from: a, to: b } = m;
  switch (m.kind) {
    case 'walk':
      return { p: { x: lerp(a.x, b.x, t), y: a.y }, action: 'walk', k: t };
    case 'jump': {
      // crouch (first 15%), ballistic arc, land; apex above the higher end
      const c = 0.15;
      if (t < c) return { p: { ...a }, action: 'jump', k: t };
      const u = (t - c) / (1 - c);
      const h = hop + Math.max(0, a.y - b.y) * 0.25;
      const apex = Math.min(a.y, b.y) - h;
      // quadratic Bézier through the apex height: control point puts the peak at `apex`
      const ctrl = 2 * apex - (a.y + b.y) / 2;
      const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * ctrl + u * u * b.y;
      return { p: { x: lerp(a.x, b.x, u), y }, action: 'jump', k: t };
    }
    case 'climb': {
      // (jump up to catch the lower edge,) up the side hand over hand, then haul himself over the top and step in
      const over = Math.min(0.3, 0.45 / m.duration); // the last bit: over the top edge
      const up = 1 - over;
      const j = m.grab !== undefined && m.grab < a.y ? Math.min(0.4, GRAB_JUMP / m.duration) : 0;
      const start = j ? m.grab! + 4 : a.y;
      if (t < j) {
        const u = t / j;
        return { p: { x: a.x, y: lerp(a.y, start, 1 - (1 - u) * (1 - u)) }, action: 'jump', k: 0.15 + 0.5 * u };
      }
      if (t < up) {
        const u = (t - j) / (up - j);
        return { p: { x: a.x, y: lerp(start, b.y + 6, u) }, action: 'climb', k: u };
      }
      const u = (t - up) / (1 - up);
      return { p: { x: lerp(a.x, b.x, easeInOut(u)), y: lerp(b.y + 6, b.y, Math.min(1, u * 2)) - Math.sin(Math.PI * u) * 8 }, action: 'climb', k: t };
    }
    case 'fall': {
      // step out past the edge, then drop (time² so it accelerates)
      const off = 0.2;
      if (t < off) return { p: { x: lerp(a.x, (a.x + b.x) / 2, t / off), y: a.y }, action: 'fall', k: t };
      const u = (t - off) / (1 - off);
      return { p: { x: lerp((a.x + b.x) / 2, b.x, Math.min(1, u * 1.6)), y: lerp(a.y, b.y, u * u) }, action: 'fall', k: t };
    }
  }
}
