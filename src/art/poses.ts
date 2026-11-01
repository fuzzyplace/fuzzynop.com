/**
 * Body poses for the character, as pure functions of progress. No DOM, no clock: Character.tsx
 * turns a `Body` into SVG paths, the Puppeteer decides which action plays and how far along it is.
 *
 * Local units (the Character's coordinates): +x = the way he faces, +y = down. Collar ≈ origin,
 * shoulders (±7, -7), hips ≈ y 3, feet on y 26, top of the quiff ≈ y -43.
 */
import { clamp, lerp } from './geometry';

export type P2 = [number, number];
export type Foot = { x: number; lift: number };
/** Six leg outline points: hip outer, hip inner, knee outer, knee inner, foot outer, foot inner. */
export type LegPts = [P2, P2, P2, P2, P2, P2];
export type Body = {
  L: Foot; // back foot offset from its stance spot
  R: Foot; // front foot
  handL: P2;
  handR: P2;
  elbowL?: P2; // set = a bent arm (shoulder → elbow → hand); else a straight one
  elbowR?: P2;
  kneeL: number; // forward knee bend, units
  kneeR: number;
  head: number; // head tilt, rad, + = chin down
  headBack: boolean; // head turned to look behind him (mirrored)
  dx: number; // upper body shift (weight over the front / back foot), units
  dy: number; // upper body drop (crouch / sit), units, + = down
  lift: number; // whole figure off the ground (hops), units
  legs?: { L: LegPts; R: LegPts; w: number }; // explicit legs (sitting), blended in by w
};

export type Action =
  | 'swat'
  | 'jump'
  | 'climb'
  | 'fall'
  // on-the-spot behaviour (idle fidgets, things he does at a point of interest, reactions)
  | 'look' // looks around, over his shoulder
  | 'scratch' // scratches the back of his head
  | 'shift' // shifts his weight foot to foot
  | 'glasses' // pushes his glasses up
  | 'crouch' // crouches to inspect the ground
  | 'lookUp' // looks up (at the claw), a small wave
  | 'peek' // leans over an edge and looks down
  | 'tap' // hops and taps something overhead
  | 'watch' // hand on chin, watching something
  | 'read' // hands behind his back, head down
  | 'duck' // something passes close: drops, hands over his head
  | 'land' // follow-through after a jump / fall
  | 'sit'; // k: 0 standing → 1 sat on the edge, legs dangling

export const SH_L: P2 = [-7, -7];
export const SH_R: P2 = [7, -7];
export const HIP_L: P2 = [-1.75, 3];
export const HIP_R: P2 = [4.25, 2.5];
export const NECK: P2 = [0, -13];
export const FOOT_Y = 26;

/** Point `len` from `c` at angle `a` from straight down (+ = toward -x, SVG rotate convention). */
export const hang = (c: P2, len: number, a: number): P2 => [c[0] - Math.sin(a) * len, c[1] + Math.cos(a) * len];
const s01 = (t: number) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
/** 0 → 1 over the first `a`, holds, 1 → 0 over the last `b`. */
export const envelope = (k: number, a = 0.15, b = 0.15) => Math.min(s01(k / a), s01((1 - k) / b));
/** Blend a point from a to b. */
const toward = (a: P2, b: P2, w: number): P2 => [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];
/** A single bump peaking at `at`. */
const bump = (k: number, at: number) => (k < at ? s01(k / at) : s01((1 - k) / (1 - at)));

/** Seconds per action when played on the spot (the route-driven ones get theirs from the move). */
export const ACT_DUR: Record<Action, number> = {
  swat: 0.42,
  jump: 0.8,
  climb: 1,
  fall: 0.6,
  look: 2.6,
  scratch: 1.7,
  shift: 1.9,
  glasses: 1.1,
  crouch: 2.8,
  lookUp: 2.2,
  peek: 2.6,
  tap: 0.95,
  watch: 4.5,
  read: 3,
  duck: 0.75,
  land: 0.34,
  sit: 0.65,
};
/** Tap: when the hand reaches the top of the hop (what he taps reacts then). */
export const TAP_AT = 0.45;
/** Tap: how high the hop goes, units, before the Puppeteer's reach scaling. */
export const TAP_HOP = 9;

/** The neutral standing body for given gait feet/arms (the starting point every action edits). */
export function base(L: Foot, R: Foot, armSwing: number, dangle = 0, tilt = 0): Body {
  const armA = dangle * 0.5;
  const sw = armSwing * 2.6; // arms counter-swing the legs
  return {
    L,
    R,
    handL: [-9 - armA * 6 - sw, 8 - armA * 4],
    handR: [9 + armA * 6 + sw, 8 - armA * 4],
    kneeL: L.lift * 0.8,
    kneeR: R.lift * 0.8,
    head: tilt,
    headBack: false,
    dx: 0,
    dy: 0,
    lift: 0,
  };
}

/** Sitting legs: thighs along the surface, shins hanging over its edge; `kick` (-1..1) swings the shins. */
export function sitLegs(kick: number): { L: LegPts; R: LegPts } {
  const one = (hx: number, kx: number, a: number): LegPts => {
    const knee: P2 = [kx, FOOT_Y - 1.2];
    const foot = hang(knee, 12, a);
    return [
      [hx - 2.2, FOOT_Y - 3.6],
      [hx + 0.4, FOOT_Y - 0.4],
      [knee[0] + 0.6, knee[1] - 1.6],
      [knee[0] - 1.6, knee[1] + 1.4],
      [foot[0] + 2.2, foot[1]],
      [foot[0] - 0.8, foot[1]],
    ];
  };
  // the back leg is a little behind and swings out of step with the front one
  return { L: one(-1, 9, -0.1 + 0.32 * kick), R: one(1.5, 12, 0.08 - 0.4 * kick) };
}

/** Upper-body drop when sat (torso bottom rests on the surface). */
export const SIT_DY = 18;

/**
 * Layer `action` at progress k (0..1) onto the standing body `b`. `kick` only matters for sit;
 * `amp` scales the tap's hop (so his hand just reaches what he taps).
 * Returns a new Body; never mutates `b`.
 */
export function actPose(action: Action | undefined, k: number, b: Body, kick = 0, amp = 1): Body {
  if (!action) return b;
  k = clamp(k);
  const o: Body = { ...b };
  const e = envelope(k);
  switch (action) {
    case 'swat': {
      // a quick flick of the front hand up and out, then back; head pulls away
      const s1 = Math.sin(Math.PI * k);
      o.handR = hang(SH_R, 15, -(0.5 + 2.1 * s1 * s1));
      o.handL = hang(SH_L, 15, 0.35 * s1);
      o.head += -0.12 * s1;
      break;
    }
    case 'jump': {
      // anticipation: crouch, arms swing back → stretch, arms up → tuck in the air → land
      const crouch = k < 0.15 ? Math.sin((k / 0.15) * Math.PI * 0.5) : Math.max(0, 1 - (k - 0.15) * 8);
      const tuck = k > 0.3 ? Math.sin(((k - 0.3) / 0.7) * Math.PI) : 0;
      o.dy = 4.5 * crouch;
      o.dx = -1.2 * crouch;
      o.head += 0.12 * crouch - 0.08 * tuck;
      o.kneeL = o.kneeR = 3.5 * crouch + 5 * tuck;
      o.L = { x: b.L.x - 1.5 * tuck, lift: 6 * tuck };
      o.R = { x: b.R.x - 1.5 * tuck, lift: 6 * tuck };
      o.handL = hang(SH_L, 15, crouch > 0.2 ? 0.95 * crouch : -2.4 * tuck - 0.3);
      o.handR = hang(SH_R, 15, crouch > 0.2 ? 0.85 * crouch : -2.6 * tuck - 0.3);
      break;
    }
    case 'climb': {
      // hand over hand, knees alternating against the wall
      const c = Math.sin(k * Math.PI * 10);
      o.handL = hang(SH_L, 15, Math.PI - 0.25 + 0.25 * c);
      o.handR = hang(SH_R, 15, Math.PI + 0.1 - 0.25 * c);
      o.L = { x: 3, lift: 5 + 3 * c };
      o.R = { x: 4, lift: 5 - 3 * c };
      o.kneeL = 5 + 2 * c;
      o.kneeR = 5 - 2 * c;
      o.head += -0.1;
      break;
    }
    case 'fall': {
      // arms up, legs apart
      const a = Math.min(1, k * 3);
      o.handL = hang(SH_L, 15, 2.4 * a);
      o.handR = hang(SH_R, 15, -2.5 * a);
      o.L = { x: b.L.x - 3 * a, lift: 2 * a };
      o.R = { x: b.R.x + 3 * a, lift: 2 * a };
      break;
    }
    case 'look': {
      // glance up and ahead, then over his shoulder, then back
      const back = k > 0.34 && k < 0.66;
      o.headBack = back;
      o.head += e * (k < 0.34 ? -0.14 : back ? -0.05 : 0.06);
      o.dx = e * (back ? -0.8 : 0.4);
      o.handL = hang(SH_L, 15, 0.12 * e);
      break;
    }
    case 'scratch': {
      // back hand up to the back of his head, a few quick scratches; head tips forward a touch
      const w = e;
      const scr = Math.sin(k * Math.PI * 14) * 0.9 * w;
      o.elbowL = [lerp(-9, -14, w), lerp(1, -17, w)];
      o.handL = [lerp(b.handL[0], -7.5 + scr, w), lerp(b.handL[1], -31 + scr * 0.6, w)];
      o.head += 0.12 * w;
      o.dx = -0.4 * w;
      break;
    }
    case 'shift': {
      // weight onto the back foot, front foot eases, then back over
      const s = Math.sin(2 * Math.PI * k) * e;
      o.dx = 1.6 * s;
      o.R = { x: b.R.x + 0.8 * Math.max(0, -s), lift: 1.4 * Math.max(0, -s) };
      o.L = { x: b.L.x, lift: 1.2 * Math.max(0, s) };
      o.kneeR += 1.2 * Math.max(0, -s);
      o.kneeL += 1.2 * Math.max(0, s);
      o.head += 0.03 * s;
      break;
    }
    case 'glasses': {
      // front hand up to the bridge, a small push, back down
      const w = envelope(k, 0.3, 0.3);
      const push = k > 0.4 && k < 0.6 ? Math.sin(((k - 0.4) / 0.2) * Math.PI) : 0;
      o.elbowR = [lerp(9, 13, w), lerp(1, -12, w)];
      o.handR = [lerp(b.handR[0], 9.5, w), lerp(b.handR[1], -26.5 - push * 1.4, w)];
      o.head += -0.06 * push;
      break;
    }
    case 'crouch': {
      // down on his haunches to look at the ground ahead, front hand reaching toward it
      const w = envelope(k, 0.18, 0.2);
      o.dy = 9 * w;
      o.dx = 2 * w;
      o.head += 0.5 * w;
      o.elbowR = [lerp(9, 12, w), lerp(1, 3, w)];
      o.handR = [lerp(b.handR[0], 13 + Math.sin(k * Math.PI * 4) * 0.8 * w, w), lerp(b.handR[1], 15, w)];
      o.handL = [lerp(b.handL[0], 4, w), lerp(b.handL[1], 6, w)]; // resting on the knee
      break;
    }
    case 'lookUp': {
      // chin up at the claw; a small wave at the top of it
      o.head += -0.42 * e;
      const wave = k > 0.35 && k < 0.8 ? envelope((k - 0.35) / 0.45, 0.25, 0.25) : 0;
      if (wave) o.handR = toward(b.handR, hang(SH_R, 15, -(Math.PI - 0.45) + Math.sin(k * Math.PI * 12) * 0.3), wave);
      o.dx = -0.6 * e;
      break;
    }
    case 'peek': {
      // lean out over the edge and look down; back arm out for balance
      const w = envelope(k, 0.2, 0.2);
      o.dx = 3.2 * w;
      o.dy = 2.4 * w;
      o.head += 0.55 * w;
      o.handL = hang(SH_L, 15, lerp(0, 1.1, w));
      o.handR = [lerp(b.handR[0], 7.5, w), lerp(b.handR[1], 7, w)]; // hand on his knee
      o.kneeR += 2 * w;
      break;
    }
    case 'tap': {
      // a small crouch, hop with the front arm straight up, land
      const crouch = k < 0.2 ? bump(k / 0.2, 0.7) : k > 0.75 ? bump((k - 0.75) / 0.25, 0.3) * 0.7 : 0;
      const air = k > 0.2 && k < 0.75 ? Math.sin(((k - 0.2) / 0.55) * Math.PI) : 0;
      o.dy = 3.5 * crouch;
      o.lift = TAP_HOP * air * amp;
      o.kneeL = b.kneeL + 3 * crouch + 2 * air;
      o.kneeR = b.kneeR + 3 * crouch + 2 * air;
      o.L = { x: b.L.x - 1 * air, lift: 2 * air };
      o.R = { x: b.R.x, lift: 1 * air };
      const up = k > 0.12 && k < 0.85 ? envelope((k - 0.12) / 0.73, 0.2, 0.3) : 0;
      o.handR = toward(b.handR, hang(SH_R, 15, -2.45), up); // up and forward, in front of his face (straight up hides in the head)
      o.handL = toward(b.handL, hang(SH_L, 15, 0.5), up);
      o.head += -0.3 * up;
      break;
    }
    case 'watch': {
      // hand to his chin, weight back, head toward whatever he's watching (the Puppeteer adds the aim)
      const w = envelope(k, 0.1, 0.1);
      o.elbowR = [lerp(9, 11, w), lerp(1, 0, w)];
      o.handR = [lerp(b.handR[0], 8.5, w), lerp(b.handR[1], -13.5, w)];
      o.handL = [lerp(b.handL[0], 2, w), lerp(b.handL[1], 2, w)]; // arm across, holding the elbow
      o.dx = -0.6 * w;
      break;
    }
    case 'read': {
      // hands clasped behind his back, head down
      const w = envelope(k, 0.15, 0.15);
      o.handL = [lerp(b.handL[0], -10, w), lerp(b.handL[1], 3, w)];
      o.handR = [lerp(b.handR[0], -9, w), lerp(b.handR[1], 4, w)];
      o.elbowR = [lerp(9, -1, w), lerp(1, 0, w)];
      o.head += 0.32 * w + Math.sin(k * Math.PI * 3) * 0.04 * w;
      o.dx = 0.5 * w;
      break;
    }
    case 'duck': {
      // drops fast, hands over his head, comes back up slower
      const w = k < 0.18 ? s01(k / 0.18) : s01((1 - k) / 0.6);
      o.dy = 7 * w;
      o.dx = -1.5 * w;
      o.head += 0.35 * w;
      o.elbowL = [lerp(-9, -12, w), lerp(1, -19, w)];
      o.elbowR = [lerp(9, 11, w), lerp(1, -20, w)];
      o.handL = [lerp(b.handL[0], -4, w), lerp(b.handL[1], -35, w)];
      o.handR = [lerp(b.handR[0], 5, w), lerp(b.handR[1], -37, w)];
      o.kneeL += 3 * w;
      o.kneeR += 3 * w;
      break;
    }
    case 'land': {
      // knees give, arms forward for balance, then back up (follow-through)
      const w = bump(k, 0.28);
      o.dy = b.dy + 4.5 * w;
      o.dx = b.dx + 1 * w;
      o.head += 0.12 * w;
      o.kneeL += 2.5 * w;
      o.kneeR += 2.5 * w;
      o.handL = toward(b.handL, hang(SH_L, 15, -0.55), w);
      o.handR = toward(b.handR, hang(SH_R, 15, -0.75), w);
      break;
    }
    case 'sit': {
      // lowers himself onto the edge; legs blend from standing to dangling; hands on the surface
      const w = s01(k);
      o.dy = SIT_DY * w;
      o.dx = -1.2 * w;
      const legs = sitLegs(kick);
      o.legs = { ...legs, w };
      // hands on the surface beside his hips (arms live in the lowered body's space)
      o.handL = [lerp(b.handL[0], -9.5, w), lerp(b.handL[1], 6.5, w)];
      o.handR = [lerp(b.handR[0], 6.5, w), lerp(b.handR[1], 7.5, w)];
      o.head += 0.06 * w;
      break;
    }
  }
  return o;
}

// ---------- the about-face ----------

/** Seconds for a turn: a 2–3 frame pivot, not a morph. */
export const TURN = 0.2;
/** Fraction of the turn at which the facing flips (instantly). */
export const FLIP = 0.4;
export type TurnPose = {
  flipped: boolean; // past the flip: drawn in the new facing
  headBack: boolean; // before the flip the head has already turned (it leads)
  dx: number; // weight shift, units (local to the facing drawn)
  cross: number; // front foot steps across toward the new direction, units (local)
  lift: number; // hop-turn height, units
  sx: number; // horizontal scale, ≥ 0.9: no paper-thin squash
};
/**
 * Pose for progress k (0..1) of a turn. Before FLIP he's still drawn the old way: head already
 * looking the new way, weight shifting back, front foot stepping across. At FLIP the facing flips;
 * after it the body leans into the new direction and the feet settle. `hop`: standing turns are a
 * quick hop instead of a step.
 */
export function turnPose(k: number, hop: boolean): TurnPose {
  k = clamp(k);
  const flipped = k >= FLIP;
  const lift = hop ? 3.2 * Math.sin(Math.PI * k) : 0;
  if (!flipped) {
    const u = k / FLIP;
    return { flipped, headBack: k > 0.06, dx: -1.6 * s01(u), cross: hop ? -2 * u : -6.5 * s01(u), lift, sx: 1 - 0.08 * u };
  }
  const u = (k - FLIP) / (1 - FLIP);
  return { flipped, headBack: false, dx: 1.4 * (1 - s01(u)), cross: (hop ? 1.5 : 4) * (1 - s01(u)), lift, sx: 0.92 + 0.08 * s01(u) };
}
