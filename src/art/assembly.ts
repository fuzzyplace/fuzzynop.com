import { clamp, lerp, rng, type Pt } from './geometry';

/**
 * The assembly choreography for a PrintedPlate (pure, tested in assembly.test.ts).
 *
 * v2.7: scrubbed by scroll, with weight. The plate pins (sticky) while the visitor scrolls through
 * its section and the scroll position, smoothed (`follow`), picks a time on this timeline
 * (`scrollKeys` / `timeAtScroll`). Scrolling back up runs it backwards: the arms lift the pieces
 * back out and carry the sheet away. Every pose is a pure function of time, so forwards and
 * backwards are the same motion.
 *
 * The timeline: the claws carry the torn sheet in by its top corners, hold it a beat just above its
 * spot (a small wind-up), let go; it lands with a soft slap (shadow tightens, a small ink puff
 * under its edge) and flutters into its tilt while its backing layers fan out. Then they place the
 * plate's words, in reading order, one group at a time (a title word, a line of copy, a list item,
 * the CTA, a circuit node):
 * - the claw goes to the pickup (arcs, arrives with a little overshoot), closes,
 * - carries the piece to just above its slot (it rocks as it decelerates),
 * - winds up (rises a few px, tilts back) — the "rest beat": a visitor who stops scrolling here
 *   sees the arm holding the next piece in the air,
 * - presses it down (quick ease-in) and lets go; the piece squashes and stretches as it lands,
 * - the claw recoils up and away (follow-through) on its way to the next pickup.
 * Presses are at least a beat apart, so each placement registers.
 *
 * `carry` units are fetched from beyond the plate edge on the arm's side (titles, the CTA, the badge
 * row: few, big things); `deal` units from just beside their slot (body lines, list items, nodes).
 *
 * Everything is in plate px (the untransformed plate box, origin top-left). Times are seconds of
 * plan time; scroll decides how fast they pass.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type GroupIn = { box: Box; mode: 'carry' | 'deal' };
export type Offset = { dx: number; dy: number; rot: number; scale: number };

export type GroupPlan = {
  box: Box;
  mode: 'carry' | 'deal';
  arm: number;
  t0: number; // appears in the claw at its pickup
  tA: number; // arrives above its slot
  tW: number; // wound up: the press starts
  tP: number; // lands; the claw lets go
  tS: number; // settled
  from: Offset; // where it starts, relative to its slot
  lift: number; // how high above its slot it's held (px)
  grip: Pt; // where the claw holds it (slot space)
  sway: number; // -1..1: which way it rocks
};

type Seg =
  | { kind: 'sheet'; t0: number; t1: number; corner: Pt } // holding the sheet by this corner (plate space, untransformed)
  | { kind: 'hold'; t0: number; t1: number; g: number } // holding group g
  | { kind: 'wait'; t0: number; t1: number; at: Pt; close: number } // waiting at a pickup; the claw closes from `close`
  | { kind: 'move'; t0: number; t1: number; from: Pt; to: Pt; recoil: number; park: boolean }; // travelling (recoil: px it springs up after letting go)

export type ArmPlan = { side: 1 | -1; segs: Seg[]; end: number; rest: Pt; exit: boolean };

export type Drop = { x: number; y: number; dx: number; dy: number; r: number; rot: number; long: number; delay: number };
export type SheetPlan = {
  origin: Pt;
  from: Offset & { rx: number };
  carry: number;
  hover: number;
  drop: number;
  settle: number;
  flutter: number;
  puff: { dur: number; drops: Drop[] };
};

export type Plan = {
  w: number;
  h: number;
  sheet: SheetPlan;
  groups: GroupPlan[];
  arms: ArmPlan[];
  landed: number; // the sheet touches down
  placed: number; // every group settled
  end: number; // arms gone / parked: the plate is assembled
  beats: number[]; // rest beats, ascending: 0, the sheet held above its spot, each piece held in the air, end
};

export type PlanOpts = {
  w: number;
  h: number;
  side: 'left' | 'right'; // the plate's arm side
  arms: 1 | 2;
  mobile: boolean;
  seed: number;
  rest: Pt; // where arm 0 parks (plate space): its tip
  reach?: number; // how far across (px) an arm reaches from its post
};

/** Each arm's shoulder rides a post this far outside its side of the plate. */
export const POST = 14;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
/** ease-in-out that runs a few % past the end and comes back (an arm with weight arriving) */
const arrive = (u: number) => easeInOutSine(u) + 0.05 * Math.sin(Math.PI * clamp((u - 0.55) / 0.45));
/** a spring up and back: 0 → ~1.1 → 0 */
const bump = (u: number) => (u < 0.3 ? Math.sin((Math.PI / 2) * (u / 0.3)) * 1.08 : 1.08 * (1 - easeInOutSine((u - 0.3) / 0.7)));

/** Timing (s of plan time). Phones: one arm, a little quicker, fewer (bigger) units. */
export const TIMING = {
  desktop: { carry: 0.8, hover: 0.3, drop: 0.12, settle: 0.6, puff: 0.6, grab: 0.1, carryDur: 0.5, dealDur: 0.34, wind: 0.16, press: 0.09, squash: 0.36, speed: 1500, minMove: 0.16, maxMove: 0.42, beat: 0.46, park: 0.5, recoil: 22, lift: 18, windUp: 7 },
  mobile: { carry: 0.7, hover: 0.26, drop: 0.11, settle: 0.5, puff: 0.55, grab: 0.08, carryDur: 0.42, dealDur: 0.3, wind: 0.14, press: 0.08, squash: 0.32, speed: 1600, minMove: 0.14, maxMove: 0.36, beat: 0.42, park: 0.42, recoil: 16, lift: 14, windUp: 6 },
};

export function planAssembly(groupsIn: GroupIn[], o: PlanOpts): Plan {
  const base = o.mobile ? TIMING.mobile : TIMING.desktop;
  // a plate with many pieces (the link tree) keeps a quicker beat so it isn't twice as long
  const busy = Math.max(0.65, Math.min(1, 12 / Math.max(1, groupsIn.length)));
  const T = { ...base, beat: base.beat * busy, carryDur: base.carryDur * (0.5 + 0.5 * busy), dealDur: base.dealDur * (0.5 + 0.5 * busy) };
  const r = rng(o.seed ^ 0x5bd1e995);
  const dir = o.side === 'right' ? 1 : -1;
  const { w, h } = o;

  // ---- the sheet: carried in from above on the arm side, held, let go, lands ----
  const two = o.arms === 2;
  const origin = two ? { x: w / 2, y: 0 } : { x: o.side === 'right' ? w : 0, y: 0 };
  const lift = Math.min(220, 70 + h * 0.14);
  const drops: Drop[] = [];
  const nd = o.mobile ? 7 : 11;
  for (let i = 0; i < nd; i++) {
    // ink pushed out from under the edge where it lands: mostly the bottom, a few off the sides
    const k = r();
    const onSide = k < 0.3;
    const sx = r() < 0.5 ? -1 : 1;
    const x = onSide ? (sx < 0 ? 0 : w) : w * (0.06 + 0.88 * r());
    const y = onSide ? h * (0.55 + 0.4 * r()) : h;
    const a = onSide ? (sx < 0 ? Math.PI : 0) + (r() - 0.5) * 0.9 : Math.PI / 2 + (r() - 0.5) * 1.6;
    const d = 10 + r() * (o.mobile ? 22 : 34);
    drops.push({ x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, r: 1.6 + r() * (o.mobile ? 3 : 4.2), rot: (a * 180) / Math.PI, long: 1 + r() * 1.8, delay: r() * 0.12 });
  }
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
    hover: T.hover,
    drop: T.drop,
    settle: T.settle,
    flutter: 0.9 + r() * 0.5,
    puff: { dur: T.puff, drops },
  };
  const landed = T.carry + T.hover + T.drop;

  // ---- arms ----
  const corners: Pt[] = two ? [{ x: o.side === 'right' ? w : 0, y: 0 }, { x: o.side === 'right' ? 0 : w, y: 0 }] : [origin];
  const sides: (1 | -1)[] = two ? [dir as 1 | -1, -dir as 1 | -1] : [dir as 1 | -1];
  const release = landed - T.drop * 0.6; // the claws let go as it starts to fall
  const armState = corners.map((c, i) => ({
    side: sides[i],
    segs: [{ kind: 'sheet', t0: 0, t1: release, corner: c }] as Seg[],
    free: release, // when this arm is free for its next job
    at: sheetCornerAt(sheet, c, release), // where its claw is then
    recoil: T.recoil, // the next move springs up (it just let go)
  }));

  // ---- groups: each goes to the arm that can be holding it first ----
  const groups: GroupPlan[] = [];
  const moveTime = (a: Pt, b: Pt) => clamp(Math.hypot(b.x - a.x, b.y - a.y) / T.speed, T.minMove, T.maxMove);
  let lastT0 = -Infinity;
  let lastP = landed + T.settle * 0.5 - T.beat; // the first press comes a beat after the sheet has mostly settled
  for (const g of groupsIn) {
    const carry = g.mode === 'carry';
    const b = g.box;
    const dur = carry ? T.carryDur : T.dealDur;
    const toPress = dur + T.wind + T.press;
    // a carry from this side would pass over something already placed in its row
    const acrossFrom = (side: 1 | -1) => carry && groups.some((p) => p.box.y < b.y + b.h && p.box.y + p.box.h > b.y && (side === 1 ? p.box.x >= b.x + b.w - 1 : p.box.x + p.box.w <= b.x + 1));
    let best = 0;
    let bestT = Infinity;
    armState.forEach((a, i) => {
      const src = sourceFor(g, a.side, carry, w, r, true, false, T.lift);
      const post = a.side === 1 ? w + POST : -POST;
      const far = Math.abs(src.slotGrip.x - post) > (o.reach ?? Infinity);
      const t = a.free + moveTime(a.at, src.grip) + (far ? 10 : 0) + (acrossFrom(a.side) ? 0.6 : 0);
      if (t < bestT - 0.02) {
        bestT = t;
        best = i;
      }
    });
    const a = armState[best];
    // no arm can carry it in from the side without crossing its row: it's lowered in from above instead
    const src = sourceFor(g, a.side, carry, w, r, false, acrossFrom(a.side), T.lift);
    const travel = moveTime(a.at, src.grip);
    // reading order, a beat between presses; an early arm waits at the pickup
    const t0 = Math.max(a.free + travel + T.grab, lastT0 + 0.08, lastP + T.beat - toPress);
    const tA = t0 + dur;
    const tW = tA + T.wind;
    const tP = tW + T.press;
    lastT0 = t0;
    lastP = tP;
    a.segs.push({ kind: 'move', t0: a.free, t1: a.free + travel, from: a.at, to: src.grip, recoil: a.recoil, park: false });
    a.segs.push({ kind: 'wait', t0: a.free + travel, t1: t0, at: src.grip, close: Math.max(0, t0 - T.grab) });
    const gi = groups.length;
    groups.push({ box: g.box, mode: g.mode, arm: best, t0, tA, tW, tP, tS: tP + T.squash, from: src.from, lift: src.lift, grip: src.slotGrip, sway: a.side });
    a.segs.push({ kind: 'hold', t0, t1: tP, g: gi });
    a.free = tP;
    a.at = gripAt(groups[gi], tP);
    a.recoil = T.recoil;
  }

  // ---- leave: arm 0 parks above its corner; arm 1 lifts away off the far side ----
  const arms: ArmPlan[] = armState.map((a, i) => {
    const exit = i > 0;
    const rest = exit ? { x: a.side === 1 ? w + 140 : -140, y: -260 } : o.rest;
    const back = Math.max(T.park, moveTime(a.at, rest) * 1.2);
    a.segs.push({ kind: 'move', t0: a.free, t1: a.free + back, from: a.at, to: rest, recoil: a.recoil, park: true });
    return { side: a.side, segs: a.segs, end: a.free + back, rest, exit };
  });
  const placed = Math.max(landed + T.settle, ...groups.map((g) => g.tS));
  const end = Math.max(placed, ...arms.map((a) => a.end));
  const beats = [0, T.carry + T.hover * 0.6, ...groups.map((g) => g.tW - 0.02), end];
  return { w, h, sheet, groups, arms, landed, placed, end, beats };
}

/** Where a group starts (relative to its slot), how high it's held over it, and where the claw takes it. */
function sourceFor(g: GroupIn, side: 1 | -1, carry: boolean, w: number, r: () => number, peek: boolean, above: boolean, liftPx: number) {
  const b = g.box;
  const rand = peek ? () => 0.5 : r;
  // the claw holds the group's end nearest its side, near the top
  const slotGrip = { x: side === 1 ? b.x + b.w - Math.min(8, b.w * 0.2) : b.x + Math.min(8, b.w * 0.2), y: b.y + Math.min(b.h * 0.3, 12) };
  let dx: number;
  let dy: number;
  if (carry && above) {
    dx = side * (8 + rand() * 10);
    dy = -(b.h + 50 + rand() * 30);
  } else if (carry) {
    // fetched from just beyond the plate edge on the arm's side
    const edge = side === 1 ? w + 36 + rand() * 30 : -36 - rand() * 30;
    dx = edge - slotGrip.x + (side === 1 ? b.w * 0.15 : -b.w * 0.15);
    dy = -(40 + rand() * 50);
  } else {
    dx = side * (44 + rand() * 40);
    dy = -(30 + rand() * 26);
  }
  const from: Offset = { dx, dy, rot: -side * (carry ? 6 + rand() * 6 : 3 + rand() * 4), scale: carry ? 1.08 : 1.05 };
  const lift = liftPx * (carry ? 1.15 : 0.85) + rand() * 4;
  return { from, lift, slotGrip, grip: { x: slotGrip.x + dx, y: slotGrip.y + dy } };
}

// ---- evaluation ----

export type SheetPose = { x: number; y: number; rot: number; rx: number; sx: number; sy: number; opacity: number; lift: number; fan: [number, number] };

/** The sheet at time t: translate (px), rotate about plan.sheet.origin (deg), tip back (deg), scale, opacity, lift (1 held .. 0 resting, < 0 pressed flat), layer fan 0..1+. */
export function sheetAt(s: SheetPlan, t: number): SheetPose {
  const f = s.from;
  const fan = (k: number) => {
    const u = clamp((t - s.carry - s.hover - s.drop * 0.6 - k * 0.07) / (s.settle * 0.8));
    return u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2); // ease out with overshoot
  };
  const opacity = clamp(t / (s.carry * 0.3));
  if (t < s.carry) {
    // carried in from above on the arm side: picks up speed, slows to a stop a little over its spot
    const ec = smoother(clamp(t / s.carry));
    const hover = -12;
    return { x: f.dx * (1 - ec), y: lerp(f.dy, hover, ec), rot: lerp(f.rot, f.rot * 0.35, ec), rx: lerp(f.rx, f.rx * 0.45, ec), sx: f.scale, sy: f.scale, opacity, lift: 1, fan: [0, 0] };
  }
  const th = t - s.carry;
  if (th < s.hover) {
    // held a beat: a small wind-up (rises, tips back a touch) before the claws let go
    const u = th / s.hover;
    const k = Math.sin((Math.PI / 2) * u);
    return { x: 0, y: -12 - 7 * k, rot: f.rot * 0.35, rx: f.rx * (0.45 + 0.1 * k), sx: f.scale, sy: f.scale, opacity: 1, lift: 1, fan: [0, 0] };
  }
  const td = th - s.hover;
  if (td < s.drop) {
    // let go: falls the last few px, flattening as it goes
    const u = easeIn(td / s.drop);
    return { x: 0, y: lerp(-19, 0, u), rot: f.rot * 0.35 * (1 - u * 0.4), rx: f.rx * 0.55 * (1 - u), sx: lerp(f.scale, 1, u), sy: lerp(f.scale, 1, u), opacity: 1, lift: 1 - u, fan: [fan(0), fan(1)] };
  }
  const ts = td - s.drop;
  if (ts < s.settle) {
    // the slap: pressed flat a moment (squashed a hair, shadow tighter than at rest), then a damped flutter into its tilt
    const u = ts / s.settle;
    const damp = Math.pow(1 - u, 2);
    const wob = Math.cos(u * Math.PI * 2 * s.flutter);
    const slap = Math.exp(-u * 9) * Math.cos(u * Math.PI * 5);
    return {
      x: 0,
      y: -1.8 * Math.abs(Math.sin(u * Math.PI * 2.2)) * damp,
      rot: f.rot * 0.21 * wob * damp,
      rx: -2.6 * Math.sin(u * Math.PI * 3) * damp,
      sx: 1 + 0.006 * slap,
      sy: 1 - 0.014 * slap,
      opacity: 1,
      lift: -0.3 * Math.sin(Math.PI * clamp(u / 0.45)) * (1 - u),
      fan: [fan(0), fan(1)],
    };
  }
  return { x: 0, y: 0, rot: 0, rx: 0, sx: 1, sy: 1, opacity: 1, lift: 0, fan: [1, 1] };
}

/** A point of the sheet (plate space) under the sheet pose at t (perspective ignored: corners sit on the tip-back axis). */
export function sheetCornerAt(s: SheetPlan, p: Pt, t: number): Pt {
  const q = sheetAt(s, t);
  const a = (q.rot * Math.PI) / 180;
  const vx = (p.x - s.origin.x) * q.sx;
  const vy = (p.y - s.origin.y) * q.sy;
  return { x: s.origin.x + vx * Math.cos(a) - vy * Math.sin(a) + q.x, y: s.origin.y + vx * Math.sin(a) + vy * Math.cos(a) + q.y };
}

export type PuffDrop = { x: number; y: number; scale: number; opacity: number };
/** The ink puff as the sheet lands: each drop's centre (plate px), scale and opacity; null when there's none. */
export function puffAt(p: Plan, t: number): PuffDrop[] | null {
  const { dur, drops } = p.sheet.puff;
  const t0 = p.landed - p.sheet.drop * 0.15;
  if (t < t0 || t > t0 + dur + 0.12) return null;
  return drops.map((d) => {
    const u = clamp((t - t0 - d.delay) / dur);
    const e = easeOut(u);
    return { x: d.x + d.dx * e, y: d.y + d.dy * e, scale: u <= 0 ? 0 : 0.35 + 0.75 * e, opacity: u <= 0 || u >= 1 ? 0 : 0.85 * Math.min(1, u / 0.12) * (1 - u) ** 1.4 };
  });
}

export type GroupPose = { dx: number; dy: number; rot: number; sx: number; sy: number; opacity: number; lift: number };
const SETTLED: GroupPose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, opacity: 1, lift: 0 };
/** null: not started (hidden). */
export function groupAt(g: GroupPlan, t: number): GroupPose | null {
  if (t < g.t0) return null;
  if (t >= g.tS) return { ...SETTLED };
  const f = g.from;
  const windUp = g.mode === 'carry' ? 7 : 5;
  if (t < g.tA) {
    // carried to just above its slot; it rocks as the claw slows
    const u = (t - g.t0) / (g.tA - g.t0);
    const e = smoother(u);
    const rock = f.rot * 0.3 * Math.sin(Math.PI * 2 * u) * u;
    return { dx: f.dx * (1 - e), dy: lerp(f.dy, -g.lift, e), rot: f.rot * (1 - e) + rock, sx: lerp(f.scale, 1.03, e), sy: lerp(f.scale, 1.03, e), opacity: clamp(u / 0.18), lift: 1 };
  }
  if (t < g.tW) {
    // wind-up: rises a few px and tilts back, as if the arm draws breath
    const u = (t - g.tA) / (g.tW - g.tA);
    const k = Math.sin((Math.PI / 2) * u);
    return { dx: 0, dy: -g.lift - windUp * k, rot: g.sway * 1.4 * k, sx: 1.03, sy: 1.03, opacity: 1, lift: 1 };
  }
  if (t < g.tP) {
    // pressed down: quick, accelerating
    const u = easeIn((t - g.tW) / (g.tP - g.tW));
    return { dx: 0, dy: (-g.lift - windUp) * (1 - u), rot: g.sway * 1.4 * (1 - u), sx: lerp(1.03, 1, u), sy: lerp(1.03, 1, u), opacity: 1, lift: 1 - u };
  }
  // landed: squash, stretch, settle (about its bottom edge)
  const u = (t - g.tP) / (g.tS - g.tP);
  const osc = Math.cos(Math.PI * 2 * 1.25 * u) * (1 - u) ** 2;
  return { dx: 0, dy: 0, rot: 0, sx: 1 + 0.045 * osc, sy: 1 - 0.075 * osc, opacity: 1, lift: 0 };
}

/** Where the claw that holds g is at t (plate space). */
export function gripAt(g: GroupPlan, t: number): Pt {
  const p = groupAt(g, t) ?? { dx: g.from.dx, dy: g.from.dy };
  return { x: g.grip.x + p.dx, y: g.grip.y + p.dy };
}

/** A member of a group moves rigidly with it: its own translate for a group pose (rotation/scale about the group's bottom centre). */
export function memberOffset(group: Box, member: Box, p: GroupPose) {
  const P = { x: group.x + group.w / 2, y: group.y + group.h };
  const cx = member.x + member.w / 2 - P.x;
  const cy = member.y + member.h / 2 - P.y;
  const a = (p.rot * Math.PI) / 180;
  const nx = cx * p.sx * Math.cos(a) - cy * p.sy * Math.sin(a);
  const ny = cx * p.sx * Math.sin(a) + cy * p.sy * Math.cos(a);
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
  const on = (tip: Pt, grip: number): ArmAt => ({ tip, grip, side: a.side, active: true, gone: false, fade });
  if (seg.kind === 'sheet') return on(sheetCornerAt(plan.sheet, seg.corner, Math.min(t, seg.t1)), 1);
  if (seg.kind === 'hold') return on(gripAt(plan.groups[seg.g], Math.min(t, seg.t1)), 1);
  if (seg.kind === 'wait') {
    // hovering at the pickup, bobbing a hair; closes on the piece
    const bob = 1.5 * Math.sin((t - seg.t0) * Math.PI * 2 * 1.4);
    return on({ x: seg.at.x, y: seg.at.y + bob }, t >= seg.close ? clamp((t - seg.close) / Math.max(0.01, seg.t1 - seg.close)) : 0);
  }
  const u = seg.t1 > seg.t0 ? clamp((t - seg.t0) / (seg.t1 - seg.t0)) : 1;
  const e = seg.park ? easeInOutSine(u) + 0.04 * Math.sin(Math.PI * clamp((u - 0.55) / 0.45)) : arrive(u);
  // opens as it lets go; a lift mid-move so it arcs rather than slides; springs up after a release
  const grip = clamp(1 - u * 5);
  const arc = Math.min(40, Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y) * 0.18) * Math.sin(Math.PI * u);
  const kick = seg.recoil * bump(clamp(u / 0.7));
  const sway = 3 * Math.sin(Math.PI * u) * a.side;
  return on({ x: lerp(seg.from.x, seg.to.x, e) + sway, y: lerp(seg.from.y, seg.to.y, e) - arc - kick }, grip);
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

// ---- scroll → time ----

/**
 * Where the plate's pin sits in document scroll px (PrintedPlate measures these in the read phase).
 * s0: the sheet starts in (plate top low in the viewport). sheet: it has landed. pinStart / pinEnd:
 * the plate is stuck between these. ready[i]: group i's slot is well in view (matters only before
 * the pin, while the plate still moves). tall: taller than the viewport; it places each piece as
 * soon as its slot is in view while it scrolls in.
 */
export type PinGeo = { s0: number; sheet: number; pinStart: number; pinEnd: number; ready: number[]; tall?: boolean };
export type Keys = { s: number[]; t: number[] };

/** Keyframes scroll ↔ time: the sheet lands at `sheet`, presses spread by their time over the pin (never before their slot is in view), done a little before the pin ends. */
export function scrollKeys(p: Plan, g: PinGeo): Keys {
  const sheetT = p.landed + p.sheet.settle * 0.4;
  const done = g.pinEnd - (g.pinEnd - g.pinStart) * 0.1;
  const s = [g.s0, Math.min(g.sheet, done)];
  const t = [0, sheetT];
  let ls = s[1];
  let lt = sheetT;
  p.groups.forEach((gr, i) => {
    if (gr.tP <= lt) return;
    const even = ls + ((done - ls) * (gr.tP - lt)) / Math.max(1e-6, p.end - lt);
    const r = g.ready[i] ?? -Infinity;
    const ready = clamp(r, -Infinity, g.pinStart);
    // a tall plate places what's already in view as it scrolls in (so the top of it can be read, and a
    // jump to its top finds it put together); the rest is spread over the pin
    const at = Math.min(done, g.tall && r < g.pinStart ? Math.max(ready, ls + 8) : Math.max(even, ready));
    if (at <= ls) return; // squeezed: it shares the segment with the group before
    s.push(at);
    t.push(gr.tP);
    ls = at;
    lt = gr.tP;
  });
  if (done > ls) {
    s.push(done);
    t.push(p.end);
  } else t[t.length - 1] = p.end;
  return { s, t };
}

/** The plan time for a scroll position (piecewise linear through the keys, clamped). */
export function timeAtScroll(k: Keys, y: number): number {
  const { s, t } = k;
  if (y <= s[0]) return 0;
  for (let i = 1; i < s.length; i++) if (y < s[i]) return lerp(t[i - 1], t[i], (y - s[i - 1]) / (s[i] - s[i - 1]));
  return t[t.length - 1];
}

/** A visitor who stops scrolling: the nearest rest beat in the direction they were going (down: ahead, up: behind). */
export function snapBeat(beats: number[], t: number, dir: 1 | -1): number {
  if (dir > 0) return beats.find((b) => b >= t - 1e-6) ?? t;
  for (let i = beats.length - 1; i >= 0; i--) if (beats[i] <= t + 1e-6) return beats[i];
  return t;
}

/**
 * Smoothed progress: a critically damped spring from `t` toward `target` with a speed limit (plan s
 * per s), so the pieces glide with inertia however jumpy the wheel is, and never overshoot (an
 * overshoot would play a placement backwards). Mutates and returns `st`.
 */
export const FOLLOW = { omega: 5.5, maxRate: 3.2 };
/** Speed limit for a plan: at least FOLLOW.maxRate, and a whole pass never takes longer than `pass` s of catching up. */
export const rateFor = (end: number, pass = 3) => Math.max(FOLLOW.maxRate, end / pass);
export function follow(st: { t: number; v: number }, target: number, dt: number, o = FOLLOW) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = o.omega * o.omega * (target - st.t) - 2 * o.omega * st.v;
    st.v = clamp(st.v + a * h, -o.maxRate, o.maxRate);
    const next = st.t + st.v * h;
    // no overshoot: arriving clamps to the target
    if ((target - st.t) * (target - next) <= 0) {
      st.t = target;
      st.v = 0;
    } else st.t = next;
  }
  if (Math.abs(target - st.t) < 1e-3 && Math.abs(st.v) < 0.02) {
    st.t = target; // close enough: settle (the loop can sleep)
    st.v = 0;
  }
  return st;
}
