import { clamp, lerp, rng, type Pt } from './geometry';

/**
 * The assembly choreography for a PrintedPlate (pure, tested in assembly.test.ts).
 *
 * The arms bring the torn sheet in from off-plate, hold it a moment above its spot, drop it, and it
 * flutters into its resting tilt while its backing layers fan out from under it. Then they place the
 * plate's words: each group (a title word, a line of body copy, a list item, the CTA, a circuit
 * node) appears at an arm's claw, travels to its slot and drops in with a small settle.
 *
 * Two ways a group is placed:
 * - `carry`: the claw fetches it from beyond the plate edge on its side and holds it nearly all the
 *   way to its slot (titles, the CTA, the header row): few, big things.
 * - `deal`: it leaves the claw just beside its slot and the claw moves on to the next (body lines,
 *   list items, nodes): many small things, laid down in reading order as the claw runs down the margin.
 *
 * Everything is in plate px (the untransformed plate box, origin top-left). Times are seconds on the
 * plate's own clock, which the plate speeds up when you scroll past faster than it can work.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type GroupIn = { box: Box; mode: 'carry' | 'deal' };
export type Offset = { dx: number; dy: number; rot: number; scale: number };

export type GroupPlan = {
  box: Box;
  mode: 'carry' | 'deal';
  arm: number;
  t0: number; // appears at the claw
  dur: number; // until settled in its slot
  hold: number; // fraction of dur the claw holds it
  from: Offset; // where it starts, relative to its slot
  grip: Pt; // where the claw holds it (slot space)
};

type Seg =
  | { kind: 'sheet'; t0: number; t1: number; corner: Pt } // holding the sheet by this corner (plate space, untransformed)
  | { kind: 'hold'; t0: number; t1: number; g: number } // holding group g
  | { kind: 'move'; t0: number; t1: number; from: Pt; to: Pt; grip: number }; // travelling (grip 0 open .. 1 closed)

export type ArmPlan = { side: 1 | -1; segs: Seg[]; end: number; rest: Pt; exit: boolean };

export type SheetPlan = { origin: Pt; from: Offset & { rx: number }; carry: number; drop: number; settle: number; flutter: number };

export type Plan = {
  w: number;
  h: number;
  sheet: SheetPlan;
  groups: GroupPlan[];
  arms: ArmPlan[];
  placed: number; // every group settled
  end: number; // arms gone / parked: the plate is assembled
};

export type PlanOpts = {
  w: number;
  h: number;
  side: 'left' | 'right'; // the plate's arm side
  arms: 1 | 2;
  mobile: boolean;
  seed: number;
  rest: Pt; // where arm 0 parks (plate space): its tip
  cap?: number; // longest the placing may take (s), after the sheet lands
  reach?: number; // how far across (px) an arm reaches from its post
};

/** Each arm's shoulder rides a post this far outside its side of the plate. */
export const POST = 14;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
export const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));

/** Timing constants (s). Mobile runs the same choreography, quicker and with one arm. */
export const TIMING = {
  desktop: { carry: 0.4, drop: 0.12, settle: 0.42, carryDur: 0.46, carryHold: 0.68, dealDur: 0.4, dealHold: 0.16, speed: 2600, minMove: 0.07, maxMove: 0.26, park: 0.38, cap: 2.0 },
  mobile: { carry: 0.4, drop: 0.1, settle: 0.32, carryDur: 0.36, carryHold: 0.6, dealDur: 0.32, dealHold: 0.14, speed: 2900, minMove: 0.05, maxMove: 0.2, park: 0.3, cap: 1.25 },
};

export function planAssembly(groupsIn: GroupIn[], o: PlanOpts): Plan {
  const T = o.mobile ? TIMING.mobile : TIMING.desktop;
  const r = rng(o.seed ^ 0x5bd1e995);
  const dir = o.side === 'right' ? 1 : -1;
  const { w, h } = o;

  // ---- the sheet: carried in from above on the arm side, held, dropped, settles ----
  const two = o.arms === 2;
  const origin = two ? { x: w / 2, y: 0 } : { x: o.side === 'right' ? w : 0, y: 0 };
  const lift = Math.min(220, 70 + h * 0.14);
  const sheet: SheetPlan = {
    origin,
    from: {
      dx: dir * (w * (o.mobile ? 0.12 : 0.2) + 40),
      dy: -lift,
      rot: two ? -dir * (2.2 + r() * 1.2) : -dir * (5 + r() * 2.5), // held by one corner, the far side droops
      rx: 16 + r() * 6, // tipped back, like a sheet hanging from its top edge
      scale: 1.035,
    },
    carry: T.carry,
    drop: T.drop,
    settle: T.settle,
    flutter: 0.9 + r() * 0.5,
  };
  const landed = T.carry + T.drop;

  // ---- arms ----
  const corners: Pt[] = two ? [{ x: o.side === 'right' ? w : 0, y: 0 }, { x: o.side === 'right' ? 0 : w, y: 0 }] : [origin];
  const sides: (1 | -1)[] = two ? [dir as 1 | -1, -dir as 1 | -1] : [dir as 1 | -1];
  const release = landed - T.drop * 0.25; // the claws let go just before it touches down
  const armState = corners.map((c, i) => ({
    side: sides[i],
    segs: [{ kind: 'sheet', t0: 0, t1: release, corner: c }] as Seg[],
    free: release, // when this arm is free for its next job
    at: sheetCornerAt(sheet, c, release), // where its claw is then
  }));

  // ---- groups: every group goes to the arm that comes free first ----
  const groups: GroupPlan[] = [];
  const moveTime = (a: Pt, b: Pt) => clamp(Math.hypot(b.x - a.x, b.y - a.y) / T.speed, T.minMove, T.maxMove);
  let lastStart = -Infinity;
  for (const g of groupsIn) {
    const carry = g.mode === 'carry';
    // pick the arm that can be holding it first; an arm whose post is out of reach of the slot is a
    // last resort, and a carry from the far side (over words already placed) costs a little extra
    let best = 0;
    let bestT = Infinity;
    const b = g.box;
    armState.forEach((a, i) => {
      const src = sourceFor(g, a.side, carry, w, r, true);
      const post = a.side === 1 ? w + POST : -POST;
      const far = Math.abs(src.slotGrip.x - post) > (o.reach ?? Infinity);
      // a carry from this side would pass over something already placed in its row
      const across = carry && groups.some((p) => p.box.y < b.y + b.h && p.box.y + p.box.h > b.y && (a.side === 1 ? p.box.x >= b.x + b.w - 1 : p.box.x + p.box.w <= b.x + 1));
      const t = a.free + moveTime(a.at, src.grip) + (far ? 10 : 0) + (across ? 0.6 : 0);
      if (t < bestT - 0.02) {
        bestT = t;
        best = i;
      }
    });
    const a = armState[best];
    const src = sourceFor(g, a.side, carry, w, r, false);
    // reading order: nothing starts before the group before it (an early arm waits at the pickup)
    const t0 = Math.max(a.free + moveTime(a.at, src.grip), lastStart + (carry ? 0.1 : 0.05));
    lastStart = t0;
    const dur = carry ? T.carryDur : T.dealDur;
    const hold = carry ? T.carryHold : T.dealHold;
    a.segs.push({ kind: 'move', t0: a.free, t1: t0, from: a.at, to: src.grip, grip: 0 });
    const gi = groups.length;
    groups.push({ box: g.box, mode: g.mode, arm: best, t0, dur, hold, from: src.from, grip: src.slotGrip });
    a.segs.push({ kind: 'hold', t0, t1: t0 + dur * hold, g: gi });
    a.free = t0 + dur * hold;
    a.at = gripAt(groups[gi], t0 + dur * hold);
  }

  // ---- squeeze: the placing never takes longer than the cap (after the sheet lands) ----
  const cap = o.cap ?? T.cap;
  const lastFree = Math.max(release, ...armState.map((a) => a.free));
  const span = lastFree - release;
  if (span > cap) {
    const k = cap / span;
    const sq = (t: number) => (t <= release ? t : release + (t - release) * k);
    for (const g of groups) {
      const t1 = sq(g.t0 + g.dur * g.hold);
      g.t0 = sq(g.t0);
      // the claw's hold scales; the drop after release keeps a readable minimum
      const held = t1 - g.t0;
      const after = Math.max(g.dur * (1 - g.hold) * Math.max(k, 0.7), 0.12);
      g.dur = held + after;
      g.hold = held / g.dur;
    }
    for (const a of armState) {
      for (const s of a.segs) {
        if (s.kind === 'sheet') continue;
        s.t0 = sq(s.t0);
        s.t1 = sq(s.t1);
      }
      a.free = sq(a.free);
    }
  }

  // ---- leave: arm 0 parks above its corner; arm 1 lifts away off the far side ----
  const arms: ArmPlan[] = armState.map((a, i) => {
    const exit = i > 0;
    const rest = exit ? { x: a.side === 1 ? w + 140 : -140, y: -260 } : o.rest;
    const back = Math.max(T.park, moveTime(a.at, rest));
    a.segs.push({ kind: 'move', t0: a.free, t1: a.free + back, from: a.at, to: rest, grip: 0 });
    return { side: a.side, segs: a.segs, end: a.free + back, rest, exit };
  });
  const placed = Math.max(landed + T.settle, ...groups.map((g) => g.t0 + g.dur));
  const end = Math.max(placed, ...arms.map((a) => a.end));
  return { w, h, sheet, groups, arms, placed, end };
}

/** Where a group starts (relative to its slot) and where the claw takes it. */
function sourceFor(g: GroupIn, side: 1 | -1, carry: boolean, w: number, r: () => number, peek: boolean) {
  const b = g.box;
  const rand = peek ? () => 0.5 : r;
  // the claw holds the group's end nearest its side, near the top
  const slotGrip = { x: side === 1 ? b.x + b.w - Math.min(8, b.w * 0.2) : b.x + Math.min(8, b.w * 0.2), y: b.y + Math.min(b.h * 0.3, 12) };
  let dx: number;
  let dy: number;
  if (carry) {
    // fetched from just beyond the plate edge on the arm's side
    const edge = side === 1 ? w + 36 + rand() * 30 : -36 - rand() * 30;
    dx = edge - slotGrip.x + (side === 1 ? b.w * 0.15 : -b.w * 0.15);
    dy = -(30 + rand() * 50);
  } else {
    dx = side * (44 + rand() * 40);
    dy = -(22 + rand() * 26);
  }
  const from: Offset = { dx, dy, rot: -side * (carry ? 6 + rand() * 6 : 3 + rand() * 4), scale: carry ? 1.08 : 1.05 };
  return { from, slotGrip, grip: { x: slotGrip.x + dx, y: slotGrip.y + dy } };
}

// ---- evaluation ----

export type SheetPose = { x: number; y: number; rot: number; rx: number; scale: number; opacity: number; lift: number; fan: [number, number] };

/** The sheet at time t: translate (px), rotate about plan.sheet.origin (deg), tip back (deg), scale, opacity, lift 0..1, layer fan 0..1+. */
export function sheetAt(s: SheetPlan, t: number): SheetPose {
  const f = s.from;
  const tc = clamp(t / s.carry);
  const ec = 0.35 * easeOut(tc) + 0.65 * (tc < 0.5 ? 2 * tc * tc : 1 - Math.pow(2 - 2 * tc, 2) / 2); // a carry: picks up speed, slows to a hover
  const fan = (k: number) => {
    const u = clamp((t - s.carry - s.drop * 0.6 - k * 0.07) / (s.settle * 0.8));
    return u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2); // ease out with overshoot
  };
  const opacity = clamp(t / (s.carry * 0.3));
  if (t < s.carry) {
    // carried in from above on the arm side, held a few px over its spot
    const hover = -10;
    return {
      x: f.dx * (1 - ec),
      y: lerp(f.dy, hover, ec),
      rot: lerp(f.rot, f.rot * 0.35, ec),
      rx: lerp(f.rx, f.rx * 0.45, ec),
      scale: f.scale,
      opacity,
      lift: 1,
      fan: [0, 0],
    };
  }
  const td = t - s.carry;
  if (td < s.drop) {
    // let go: falls the last few px, flattening as it goes
    const u = easeIn(td / s.drop);
    return { x: 0, y: lerp(-10, 0, u), rot: f.rot * 0.35 * (1 - u * 0.4), rx: f.rx * 0.45 * (1 - u), scale: lerp(f.scale, 1, u), opacity: 1, lift: 1 - u, fan: [fan(0), fan(1)] };
  }
  const ts = td - s.drop;
  if (ts < s.settle) {
    // touched down: a damped flutter about its resting tilt and a tiny bounce
    const u = ts / s.settle;
    const damp = Math.pow(1 - u, 2);
    const wob = Math.cos(u * Math.PI * 2 * s.flutter);
    return { x: 0, y: -1.6 * Math.abs(Math.sin(u * Math.PI * 2.2)) * damp, rot: f.rot * 0.21 * wob * damp, rx: -1.8 * Math.sin(u * Math.PI * 3) * damp, scale: 1, opacity: 1, lift: 0, fan: [fan(0), fan(1)] };
  }
  return { x: 0, y: 0, rot: 0, rx: 0, scale: 1, opacity: 1, lift: 0, fan: [1, 1] };
}

/** A point of the sheet (plate space) under the sheet pose at t (perspective ignored: corners sit on the tip-back axis). */
export function sheetCornerAt(s: SheetPlan, p: Pt, t: number): Pt {
  const q = sheetAt(s, t);
  const a = (q.rot * Math.PI) / 180;
  const vx = (p.x - s.origin.x) * q.scale;
  const vy = (p.y - s.origin.y) * q.scale;
  return { x: s.origin.x + vx * Math.cos(a) - vy * Math.sin(a) + q.x, y: s.origin.y + vx * Math.sin(a) + vy * Math.cos(a) + q.y };
}

export type GroupPose = { dx: number; dy: number; rot: number; scale: number; opacity: number };
/** null: not started (hidden). */
export function groupAt(g: GroupPlan, t: number): GroupPose | null {
  if (t < g.t0) return null;
  const u = clamp((t - g.t0) / g.dur);
  if (u >= 1) return { dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1 };
  const f = g.from;
  const fly = 0.8; // the rest is the settle
  const e = easeOut(clamp(u / fly));
  let dy = f.dy * (1 - e);
  let rot = f.rot * (1 - e);
  if (u > 0.62) {
    // drops in: a px or two past its line and back, a last little rock
    const v = (u - 0.62) / 0.38;
    dy += 3.2 * Math.sin(Math.PI * v) * (1 - v);
    rot += f.rot * 0.22 * Math.sin(Math.PI * 2 * v) * (1 - v);
  }
  return { dx: f.dx * (1 - e), dy, rot, scale: 1 + (f.scale - 1) * (1 - e), opacity: clamp(u / 0.16) };
}

/** Where the claw that holds g is at t (plate space). */
export function gripAt(g: GroupPlan, t: number): Pt {
  const p = groupAt(g, t) ?? { dx: g.from.dx, dy: g.from.dy, rot: 0, scale: 1, opacity: 0 };
  return { x: g.grip.x + p.dx, y: g.grip.y + p.dy };
}

/** A member of a group moves rigidly with it: its own translate for a group pose (rotation/scale about the group's centre). */
export function memberOffset(group: Box, member: Box, p: GroupPose) {
  const P = { x: group.x + group.w / 2, y: group.y + group.h / 2 };
  const cx = member.x + member.w / 2 - P.x;
  const cy = member.y + member.h / 2 - P.y;
  const a = (p.rot * Math.PI) / 180;
  const nx = (cx * Math.cos(a) - cy * Math.sin(a)) * p.scale;
  const ny = (cx * Math.sin(a) + cy * Math.cos(a)) * p.scale;
  return { x: nx - cx + p.dx, y: ny - cy + p.dy };
}

export type ArmAt = { tip: Pt; grip: number; side: 1 | -1; active: boolean; gone: boolean; fade: number };
/** An arm's claw at t. `active`: working (not yet parked / gone). */
export function armAt(plan: Plan, i: number, t: number): ArmAt {
  const a = plan.arms[i];
  const fade = clamp(t / (plan.sheet.carry * 0.3));
  if (t >= a.end) return { tip: a.rest, grip: 0, side: a.side, active: false, gone: a.exit, fade: 1 };
  let seg = a.segs[0];
  for (const s of a.segs) {
    if (t >= s.t0) seg = s;
    else break;
  }
  if (seg.kind === 'sheet') {
    if (t <= seg.t1) return { tip: sheetCornerAt(plan.sheet, seg.corner, t), grip: 1, side: a.side, active: true, gone: false, fade };
  }
  if (seg.kind === 'hold' && t <= seg.t1) return { tip: gripAt(plan.groups[seg.g], t), grip: 1, side: a.side, active: true, gone: false, fade };
  if (seg.kind === 'move') {
    const u = seg.t1 > seg.t0 ? clamp((t - seg.t0) / (seg.t1 - seg.t0)) : 1;
    const e = easeInOutSine(u);
    // the claw opens as it lets go and closes as it arrives to pick up
    const grip = seg.to === a.rest ? 0 : Math.max(clamp(1 - u * 4), clamp((u - 0.75) * 4));
    // a small lift mid-move so it arcs rather than slides
    const arc = Math.min(40, Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y) * 0.18) * Math.sin(Math.PI * u);
    return { tip: { x: lerp(seg.from.x, seg.to.x, e), y: lerp(seg.from.y, seg.to.y, e) - arc }, grip, side: a.side, active: true, gone: false, fade };
  }
  // between a finished segment and the next (shouldn't happen: segments are contiguous)
  const last = seg.kind === 'hold' ? gripAt(plan.groups[seg.g], seg.t1) : sheetCornerAt(plan.sheet, seg.corner, seg.t1);
  return { tip: last, grip: 0, side: a.side, active: true, gone: false, fade };
}

/**
 * Words → lines: words (boxes in reading order) whose vertical centres sit within half a line of
 * the current line's first word belong to that line. Returns index lists.
 */
export function groupLines(boxes: Box[]): number[][] {
  const lines: number[][] = [];
  let cy = -Infinity;
  let lh = 0;
  boxes.forEach((b, i) => {
    const c = b.y + b.h / 2;
    if (lines.length && Math.abs(c - cy) < Math.max(4, lh * 0.5)) lines[lines.length - 1].push(i);
    else {
      lines.push([i]);
      cy = c;
      lh = b.h;
    }
  });
  return lines;
}

export const union = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/**
 * Plate-clock rate: 1 while there's time; faster as the plate's top climbs past ~60% of the
 * viewport, so it's together before you'd read it (topFrac: the plate top's height in the viewport, 0..1).
 */
export function paceFor(topFrac: number) {
  return 1 + 5 * clamp((0.62 - topFrac) / 0.32);
}
