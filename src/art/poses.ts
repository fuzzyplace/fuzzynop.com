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
  | 'cower' // shaken: hunched, arms wrapped round himself, a wary glance up
  | 'sit' // k: 0 standing → 1 sat on the edge, legs dangling
  // thinking tells and reactions to the visitor
  | 'still' // stops dead for a beat: no pose change, just nothing (the Puppeteer holds him)
  | 'tilt' // a curious head tilt: chin comes up, a slow lean in, holds, settles
  | 'blink' // a tiny dip of the head, like a blink
  | 'glance' // a quick look at where he's about to go
  | 'wave' // chin up at the pointer, a proper wave
  | 'hop' // a small hop on the spot, arms lifting (a greeting)
  | 'flinch' // a quick recoil: leans back, hands up, a half step back, then eases
  // v2.7: his own life on the page
  | 'shake' // re-formed from ink: shakes himself off, head first, then the shoulders
  | 'lie' // lies down for a nap (the Character turns him onto his back by `Pose.lie`); here: arms in, knees up
  | 'reach' // front arm out to a letter at hand height, fingers closing on it
  | 'heft' // both hands up over his head, holding something (a letter he's carrying)
  | 'push'; // both hands forward, leaning in: nudging a word

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
  cower: 3.4,
  sit: 0.65,
  still: 0.4,
  tilt: 1.1,
  blink: 0.32,
  glance: 0.55,
  wave: 1.7,
  hop: 0.6,
  flinch: 0.6,
  shake: 0.9,
  lie: 1.1,
  reach: 0.7,
  heft: 1,
  push: 0.8,
};
/** Tap: when the hand reaches the top of the hop (what he taps reacts then). */
export const TAP_AT = 0.45;
/** Tap: how high the hop goes, units, before the Puppeteer's reach scaling. */
export const TAP_HOP = 10;

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
    case 'cower': {
      // hunches down, arms wrapped round himself, head low; halfway through a wary glance up and back
      const w = envelope(k, 0.12, 0.22);
      const glance = k > 0.45 && k < 0.7 ? envelope((k - 0.45) / 0.25, 0.3, 0.3) : 0;
      o.dy = 4 * w;
      o.dx = -1.6 * w;
      o.head += w * (0.34 - 0.5 * glance);
      o.elbowL = [lerp(-9, -6, w), lerp(1, 1.5, w)];
      o.elbowR = [lerp(9, 9.5, w), lerp(1, 0.5, w)];
      o.handL = [lerp(b.handL[0], 4, w), lerp(b.handL[1], -5, w)]; // hands on the opposite arms
      o.handR = [lerp(b.handR[0], -3, w), lerp(b.handR[1], -4, w)];
      o.kneeL += 2 * w;
      o.kneeR += 2 * w;
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
    case 'still':
      break;
    case 'tilt': {
      // chin comes up a little past level, he leans in, holds it (a slow drift, not a snap), settles
      const w = envelope(k, 0.22, 0.3);
      const drift = Math.sin(k * Math.PI) * 0.05;
      o.head += -(0.3 + drift) * w;
      o.dx = 1.3 * w;
      o.dy = -0.6 * w;
      o.kneeR += 0.6 * w;
      break;
    }
    case 'blink': {
      const w = bump(k, 0.35);
      o.head += 0.09 * w;
      o.dy = 0.35 * w;
      break;
    }
    case 'glance': {
      // a quick look ahead (the Puppeteer aims the head at where he's going), weight forward a touch
      const w = envelope(k, 0.25, 0.35);
      o.head += -0.05 * w;
      o.dx = 0.7 * w;
      break;
    }
    case 'wave': {
      // chin up at the pointer; front arm up, hand waving from the elbow
      const w = envelope(k, 0.18, 0.22);
      o.head += -0.32 * w;
      o.dx = -0.4 * w;
      const elbow: P2 = [12, -14];
      const a = Math.sin(k * Math.PI * 7) * 0.45;
      o.elbowR = toward([9, 1], elbow, w);
      o.handR = toward(b.handR, [elbow[0] + Math.sin(-0.2 + a) * 10, elbow[1] - Math.cos(-0.2 + a) * 10], w);
      break;
    }
    case 'hop': {
      // a little crouch, a small hop with both arms lifting, land soft
      const crouch = k < 0.22 ? bump(k / 0.22, 0.6) : k > 0.8 ? bump((k - 0.8) / 0.2, 0.3) * 0.6 : 0;
      const air = k > 0.22 && k < 0.8 ? Math.sin(((k - 0.22) / 0.58) * Math.PI) : 0;
      o.dy = 3 * crouch;
      o.lift = 5 * air;
      o.kneeL = b.kneeL + 2.5 * crouch + 1.5 * air;
      o.kneeR = b.kneeR + 2.5 * crouch + 1.5 * air;
      o.L = { x: b.L.x, lift: 1.5 * air };
      o.R = { x: b.R.x, lift: 1.5 * air };
      o.handL = toward(b.handL, hang(SH_L, 15, 1.2), air);
      o.handR = toward(b.handR, hang(SH_R, 15, -1.3), air);
      o.head += -0.18 * air;
      break;
    }
    case 'flinch': {
      // fast recoil (first ~12%), slow ease back: leans back, head pulls up and away, hands up in front
      const w = k < 0.12 ? s01(k / 0.12) : s01((1 - k) / 0.88);
      o.dx = -3.2 * w;
      o.dy = 1.2 * w;
      o.head += -0.22 * w;
      o.L = { x: b.L.x - 2.2 * w, lift: b.L.lift };
      o.R = { x: b.R.x - 1.2 * w, lift: b.R.lift + 0.8 * w };
      o.elbowR = toward([9, 1], [12, -2], w);
      o.handR = toward(b.handR, [13, -12], w);
      o.handL = toward(b.handL, [3, -6], w);
      o.kneeL += 1.5 * w;
      break;
    }
    case 'shake': {
      // head first (quick side to side), then the shoulders and arms flap loose, a little bounce
      const w = envelope(k, 0.08, 0.2);
      const f = Math.sin(k * Math.PI * 9);
      o.head += 0.22 * f * w * (k < 0.5 ? 1 : 0.5);
      o.dx = 1.1 * Math.sin(k * Math.PI * 7 + 1) * w;
      o.dy = 1.2 * Math.abs(Math.sin(k * Math.PI * 3)) * w;
      o.handL = toward(b.handL, hang(SH_L, 15, 0.5 + 0.5 * f), w);
      o.handR = toward(b.handR, hang(SH_R, 15, -0.5 - 0.5 * f), w);
      o.kneeL += 1.2 * w;
      o.kneeR += 1.2 * w;
      break;
    }
    case 'lie': {
      // k 0 standing → 1 lying (on his back, by the Character's turn): arms folded on his chest, knees up a little
      const w = s01(k);
      o.handL = [lerp(b.handL[0], 3, w), lerp(b.handL[1], -4, w)];
      o.handR = [lerp(b.handR[0], -2, w), lerp(b.handR[1], -5, w)];
      o.elbowL = toward([-9, 1], [-6, 3], w);
      o.elbowR = toward([9, 1], [8, 2], w);
      o.kneeL += 4 * w;
      o.kneeR += 3 * w;
      o.head += 0.15 * w;
      break;
    }
    case 'reach': {
      // front arm out and a little up to hand height, weight onto the front foot
      const w = envelope(k, 0.35, 0.15);
      o.handR = toward(b.handR, hang(SH_R, 16, -1.75), w);
      o.handL = toward(b.handL, hang(SH_L, 15, 0.4), w);
      o.dx = 1.6 * w;
      o.R = { x: b.R.x + 1.5 * w, lift: b.R.lift };
      o.head += 0.05 * w;
      break;
    }
    case 'heft': {
      // both hands up over his head (holding the letter there), knees soft under the weight
      const w = envelope(k, 0.2, 0.2);
      const bob = Math.sin(k * Math.PI * 4) * 0.6 * w;
      o.elbowL = toward([-9, 1], [-10, -16], w);
      o.elbowR = toward([9, 1], [10, -17], w);
      o.handL = toward(b.handL, [-4, -30 + bob], w);
      o.handR = toward(b.handR, [5, -31 + bob], w);
      o.head += -0.18 * w;
      o.kneeL += 1.5 * w;
      o.kneeR += 1.5 * w;
      o.dy = 1 * w;
      break;
    }
    case 'push': {
      // both hands forward at chest height, leaning into it, a shove at the middle
      const w = envelope(k, 0.25, 0.25);
      const shove = k > 0.35 && k < 0.65 ? Math.sin(((k - 0.35) / 0.3) * Math.PI) : 0;
      o.elbowL = toward([-9, 1], [2, -2], w);
      o.elbowR = toward([9, 1], [12, -1], w);
      o.handL = toward(b.handL, [12 + shove * 2, -6], w);
      o.handR = toward(b.handR, [20 + shove * 3, -7], w);
      o.dx = (2 + 1.5 * shove) * w;
      o.L = { x: b.L.x - 2.5 * w, lift: b.L.lift };
      o.head += 0.08 * w;
      break;
    }
  }
  return o;
}

// ---------- mood: how he holds himself ----------

/**
 * A standing posture layered under everything else, blended by the Puppeteer (all 0..1-ish):
 * - hunch: wary / shaken. Head and shoulders lower, weight back, hands drawn in to the chest,
 *   knees soft. Looks out from under his brow (the head still tracks the pointer).
 * - open: tolerant / warm. Taller, chin level, arms a little looser.
 * - pat: pushing up into a hand resting over his head. Stretches up, chin lifts toward it.
 */
export type Mood = { hunch: number; open: number; pat: number };
export const CALM_MOOD: Mood = { hunch: 0, open: 0, pat: 0 };
/** Actions that drive the whole body (the posture rides along fully); the rest blend it down while they play. */
const ROUTE: ReadonlySet<Action> = new Set(['jump', 'climb', 'fall', 'swat', 'land']);

export function applyMood(b: Body, m: Mood | undefined, action?: Action, k = 0): Body {
  if (!m || (!m.hunch && !m.open && !m.pat)) return b;
  // an on-the-spot action owns the pose while it plays: the posture eases off under it, never pops
  let w = !action || ROUTE.has(action) ? 1 : 1 - 0.7 * envelope(clamp(k), 0.2, 0.2);
  if (b.legs) w *= 1 - b.legs.w; // sat: no hunch through the surface
  if (w <= 0) return b;
  const h = m.hunch * w;
  const op = m.open * w;
  const p = m.pat * w;
  const o: Body = { ...b };
  o.dy += 3.2 * h - 0.8 * op - 2.2 * p;
  o.dx += -0.7 * h + 0.5 * p;
  o.head += 0.26 * h - 0.04 * op - 0.5 * p;
  o.handL = [o.handL[0] + 3.2 * h - 0.7 * op - 0.8 * p, o.handL[1] - 3.4 * h];
  o.handR = [o.handR[0] - 3.8 * h + 0.7 * op - 0.6 * p, o.handR[1] - 3.8 * h];
  o.kneeL += 1.4 * h;
  o.kneeR += 1.4 * h;
  if (p) {
    o.L = { ...o.L, lift: o.L.lift + 0.9 * p }; // up on his toes
    o.R = { ...o.R, lift: o.R.lift + 0.9 * p };
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

// ---- stunt poses ----
// The title stunt (stunt.ts / stuntDriver.ts). Kept apart from `Action` so the stage's own actions
// stay as they were; Character.tsx layers a stunt pose on top of everything else while one plays.

export type StuntAct =
  | 'cling' // hangs off a letter's top corner, both hands on it in front of his face, legs dangling
  | 'poke' // leans in and jabs the front hand at `reach` (contact at k = 1)
  | 'regard'; // after a poke: the hand comes back, he rocks back a touch and looks at what he did
export type StuntOpts = {
  reach?: P2; // poke / regard: where the front hand goes (local units)
  sway?: number; // cling: -1..1, how the legs trail a swing
  back?: boolean; // cling: head turned to look behind him (at the visitor)
};
/** Where his front hand grips when he hangs off a letter (local units; he faces the letter). */
export const HANG_HAND: P2 = [12, -22];
const ARM = 15; // shoulder to hand, units

/** Clamp a hand target to a reachable length from its shoulder (a little stretch allowed). */
const reachFrom = (sh: P2, to: P2, max = ARM * 1.35): P2 => {
  const dx = to[0] - sh[0];
  const dy = to[1] - sh[1];
  const d = Math.hypot(dx, dy);
  return d <= max ? to : [sh[0] + (dx / d) * max, sh[1] + (dy / d) * max];
};
/** An elbow for a bent arm: halfway, pushed out sideways by `out` units. */
const elbowOf = (sh: P2, hand: P2, out: number): P2 => {
  const dx = hand[0] - sh[0];
  const dy = hand[1] - sh[1];
  const d = Math.hypot(dx, dy) || 1;
  return [(sh[0] + hand[0]) / 2 - (dy / d) * out, (sh[1] + hand[1]) / 2 + (dx / d) * out];
};

/** Layer a stunt pose at progress k onto `b`. Pure; never mutates `b`. */
export function stuntPose(kind: StuntAct | undefined, k: number, b: Body, opt: StuntOpts = {}): Body {
  if (!kind) return b;
  k = clamp(k);
  const o: Body = { ...b };
  switch (kind) {
    case 'cling': {
      // fingers over the corner, elbows bent, chin up to it; legs hang, a little bent, trailing a swing
      const sway = clamp(opt.sway ?? 0, -1, 1);
      o.handR = [HANG_HAND[0], HANG_HAND[1]];
      o.handL = [HANG_HAND[0] - 2.5, HANG_HAND[1] - 0.6];
      o.elbowR = elbowOf(SH_R, o.handR, 2.2);
      o.elbowL = elbowOf(SH_L, o.handL, 3.4);
      o.head = (opt.back ? 0.05 : -0.16) + b.head * 0.5;
      o.headBack = !!opt.back;
      o.dx = -0.6;
      o.dy = -1.2 + Math.sin(k * Math.PI * 2) * 0.12;
      o.L = { x: -2.5 - 3 * sway, lift: 1.2 + Math.max(0, sway) * 2 };
      o.R = { x: -0.5 - 3.5 * sway, lift: 0.4 + Math.max(0, -sway) * 2 };
      o.kneeL = 2 + 1.5 * Math.abs(sway);
      o.kneeR = 1.2 + 1.5 * Math.abs(sway);
      o.lift = 0;
      break;
    }
    case 'poke': {
      // weight forward, a little crouch; the front hand drifts out to just short of the target, then jabs
      const to = reachFrom(SH_R, opt.reach ?? [16, 6]);
      const lean = s01(k / 0.5);
      const near: P2 = [to[0] - 3, to[1] - 2.5];
      const hand = k < 0.62 ? toward(b.handR, near, s01(k / 0.62)) : toward(near, to, s01((k - 0.62) / 0.3));
      o.dx = b.dx + 1.8 * lean;
      o.dy = b.dy + 2.6 * lean;
      o.kneeL += 1.6 * lean;
      o.kneeR += 1.2 * lean;
      o.head += 0.2 * lean;
      o.handR = hand;
      o.elbowR = elbowOf(SH_R, hand, 1.5);
      o.handL = toward(b.handL, [-5, 4], lean); // the back hand tucks in
      break;
    }
    case 'regard': {
      // the hand comes back fast, he rocks back a touch on his heels and looks (the stage aims his head)
      const to = reachFrom(SH_R, opt.reach ?? [16, 6]);
      const back = s01(k / 0.3);
      const rock = Math.sin(Math.PI * Math.min(1, k / 0.5)) * (1 - k);
      o.handR = toward(to, b.handR, back);
      if (back < 1) o.elbowR = elbowOf(SH_R, o.handR, 1.5 * (1 - back));
      o.dx = b.dx + 1.8 * (1 - back) - 1.4 * rock;
      o.dy = b.dy + 2.6 * (1 - back);
      o.head += 0.2 * (1 - back) - 0.08 * rock;
      break;
    }
  }
  return o;
}

// ---- probe poses ----
/**
 * What he does to the page's probe targets (probeDriver.ts): consider it, lean in, prod it, pick at a
 * corner, lift an edge to look under it, rattle a handle, tug a node, knock on a surface, and the
 * "did you see that?" shrug after. Kept apart from `Action` so other pose sets and these never
 * collide; Character.tsx draws either. `aim` is the front arm's reach angle (hang() convention:
 * -PI/2 = straight ahead, more negative = up, less = down). Arms live in the body's space (they ride
 * the lean and the crouch).
 */
export type ProbeMove = 'consider' | 'inspect' | 'feint' | 'prod' | 'pick' | 'lift' | 'rattle' | 'tug' | 'knock' | 'shrug';
export type AnyAction = Action | ProbeMove;
export const PROBE_MOVES: readonly ProbeMove[] = ['consider', 'inspect', 'feint', 'prod', 'pick', 'lift', 'rattle', 'tug', 'knock', 'shrug'];
export const isProbeMove = (a: string | undefined): a is ProbeMove => !!a && (PROBE_MOVES as readonly string[]).includes(a);
export const PROBE_DUR: Record<ProbeMove, number> = { consider: 1.8, inspect: 1.6, feint: 0.7, prod: 0.95, pick: 1.7, lift: 2.4, rattle: 1.25, tug: 1.15, knock: 1.3, shrug: 1.35 };
/** Progress at which his hand meets the target (the stage calls targets.ts `poke` then). */
export const PROBE_HIT: Partial<Record<ProbeMove, readonly number[]>> = { prod: [0.42], pick: [0.6], lift: [0.3], rattle: [0.16], tug: [0.42], knock: [0.32, 0.56] };
/** Where the front hand is (body units from the collar, facing +x, standing) at the moment of contact. */
export const PROBE_REACH: Partial<Record<ProbeMove, P2>> = { prod: [23.5, -7], rattle: [20, -5], tug: [21, -6], pick: [24, 22], knock: [14, 26] };
export const AIM_AHEAD = -Math.PI / 2;
/** Seconds for a move (an on-the-spot Action or a probe move). */
export const durOf = (a: AnyAction) => (isProbeMove(a) ? PROBE_DUR[a] : ACT_DUR[a]);

const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** A bent arm from the shoulder to `hand`: the elbow sits below the straight line by `drop` units. */
const elbowTo = (sh: P2, hand: P2, drop: number): P2 => {
  const m = mid(sh, hand);
  return [m[0] - drop * 0.3, m[1] + drop];
};

/** Layer probe move `m` at progress k onto the standing body `b` (never mutates `b`). */
export function probePose(m: ProbeMove, k: number, b: Body, aim = AIM_AHEAD): Body {
  k = clamp(k);
  const o: Body = { ...b };
  aim = clamp(aim, -2.7, -0.3);
  switch (m) {
    case 'consider': {
      // hand to his chin, weight back, a slow drift of the head; a finger taps the chin twice
      const w = envelope(k, 0.14, 0.16);
      const tapChin = k > 0.45 && k < 0.7 ? Math.max(0, Math.sin(((k - 0.45) / 0.25) * Math.PI * 2)) : 0;
      o.elbowR = [lerp(9, 11, w), lerp(1, 0, w)];
      o.handR = [lerp(b.handR[0], 8.6, w), lerp(b.handR[1], -13.6 + tapChin * 1.1, w)];
      o.handL = [lerp(b.handL[0], 2, w), lerp(b.handL[1], 2, w)];
      o.dx = -0.5 * w;
      o.head += (0.06 * Math.sin(k * Math.PI * 1.4) + 0.04) * w;
      break;
    }
    case 'inspect': {
      // leans in for a closer look, hands behind his back, then eases back
      const w = envelope(k, 0.3, 0.3);
      o.dx = 2.8 * w;
      o.dy = 1.6 * w;
      o.head += 0.22 * w;
      o.handL = [lerp(b.handL[0], -10, w), lerp(b.handL[1], 3, w)];
      o.handR = [lerp(b.handR[0], -8.5, w), lerp(b.handR[1], 4, w)];
      o.elbowR = [lerp(9, -1, w), lerp(1, 0, w)];
      o.kneeR += 1.2 * w;
      break;
    }
    case 'feint': {
      // reaches halfway, thinks better of it, takes the hand back to his chest
      const up = envelope(k, 0.15, 0.25); // hand up to his chest and back down
      const w = bump(k, 0.4);
      const tip = hang(SH_R, 15, aim);
      const chest: P2 = [10, -5];
      o.handR = toward(b.handR, toward(chest, toward(chest, tip, 0.55), w), up);
      o.elbowR = elbowTo(SH_R, o.handR, 3 * (1 - w * 0.5) * up);
      o.dx = 0.9 * w - 0.4 * Math.sin(clamp((k - 0.5) / 0.5) * Math.PI);
      o.head += -0.05 * w;
      break;
    }
    case 'prod': {
      // winds up, jabs a finger out to full stretch, holds a beat, takes it back
      const ext = k < 0.42 ? s01((k - 0.12) / 0.3) : k < 0.62 ? 1 : 1 - s01((k - 0.62) / 0.38);
      const up = envelope(k, 0.12, 0.15); // hand up to his chest first, back down after
      const tip = hang(SH_R, 15, aim);
      const chest: P2 = [10, -5];
      o.handR = toward(b.handR, toward(chest, tip, ext), up);
      o.elbowR = elbowTo(SH_R, o.handR, 3.2 * (1 - ext) * up);
      o.handL = toward(b.handL, [-4, 1], envelope(k, 0.2, 0.2));
      o.dx = 1.5 * ext;
      o.head += -0.04 * ext;
      o.kneeR += 0.8 * ext;
      break;
    }
    case 'pick': {
      // down on his haunches at the corner, fingers picking at it, then it lifts in his hand
      const w = envelope(k, 0.16, 0.18);
      const picking = k > 0.22 && k < 0.58 ? Math.sin(k * Math.PI * 22) * 0.8 : 0;
      const lifted = k > 0.6 ? envelope((k - 0.6) / 0.4, 0.15, 0.3) : 0;
      o.dy = 8 * w;
      o.dx = 3 * w;
      o.head += 0.48 * w - 0.12 * lifted;
      o.elbowR = [lerp(9, 14, w), lerp(1, 6, w)];
      o.handR = [lerp(b.handR[0], 20 + picking * 0.4, w), lerp(b.handR[1], 14 + picking - 3.5 * lifted, w)];
      o.handL = [lerp(b.handL[0], 4, w), lerp(b.handL[1], 6, w)];
      o.kneeL += 2 * w;
      o.kneeR += 2 * w;
      break;
    }
    case 'lift': {
      // crouches, gets both hands under the edge, lifts it and ducks his head to look underneath
      const w = envelope(k, 0.14, 0.16);
      const up = k > 0.26 ? envelope((k - 0.26) / 0.7, 0.12, 0.25) : 0;
      const look = k > 0.36 && k < 0.86 ? envelope((k - 0.36) / 0.5, 0.25, 0.3) : 0;
      o.dy = 9 * w + 1.5 * look;
      o.dx = 2.4 * w + 1.6 * look;
      o.head += 0.4 * w + 0.45 * look;
      o.elbowR = [lerp(9, 12, w), lerp(1, 8, w)];
      o.elbowL = [lerp(-9, 2, w), lerp(1, 9, w)];
      o.handR = [lerp(b.handR[0], 15, w), lerp(b.handR[1], 16.5 - 3.5 * up, w)];
      o.handL = [lerp(b.handL[0], 10, w), lerp(b.handL[1], 17 - 3.5 * up, w)];
      o.kneeL += 2.2 * w;
      o.kneeR += 2.2 * w;
      break;
    }
    case 'rattle': {
      // both hands on it like a door handle; shakes it hard, leaning back
      const w = envelope(k, 0.12, 0.2);
      const shake = k > 0.14 && k < 0.78 ? Math.sin(k * Math.PI * 30) * 1.3 * envelope((k - 0.14) / 0.64, 0.1, 0.2) : 0;
      const grip = hang(SH_R, 15, aim + 0.15);
      o.handR = toward(b.handR, [grip[0] - 2 + shake, grip[1] + 1], w);
      o.handL = toward(b.handL, [grip[0] - 4 + shake, grip[1] + 2.5], w);
      o.elbowR = toward([9, 1], [12.5, 2], w);
      o.elbowL = toward([-9, 1], [3, 3], w);
      o.dx = -0.9 * w + shake * 0.3;
      o.head += 0.06 * w;
      o.kneeL += 1.2 * w;
      o.kneeR += 1.2 * w;
      break;
    }
    case 'tug': {
      // reaches, takes hold, gives it a short pull (leaning back), lets go
      const reach = k < 0.36 ? s01(k / 0.36) : 1;
      const pull = k > 0.36 && k < 0.8 ? bump((k - 0.36) / 0.44, 0.25) : 0;
      const off = k > 0.8 ? s01((k - 0.8) / 0.2) : 0;
      const tip = hang(SH_R, 15, aim);
      o.handR = toward(toward(b.handR, tip, reach), [tip[0] - 5, tip[1] + 1], pull);
      o.handR = toward(o.handR, b.handR, off);
      o.elbowR = elbowTo(SH_R, o.handR, 2 + 2 * pull);
      o.dx = 1.2 * reach * (1 - off) - 2.2 * pull;
      o.head += 0.05 * pull;
      o.L = { x: b.L.x - 1.2 * pull, lift: b.L.lift };
      break;
    }
    case 'knock': {
      // crouches and raps twice on the surface in front of him, head cocked to listen
      const w = envelope(k, 0.18, 0.2);
      const rap = (at: number) => Math.max(0, 1 - Math.abs(k - at) / 0.06);
      const r = Math.max(rap(0.32), rap(0.56));
      o.dy = 8.5 * w;
      o.dx = 2 * w;
      o.head += 0.3 * w + 0.12 * (k > 0.6 ? w : 0);
      o.elbowR = [lerp(9, 13, w), lerp(1, 4, w)];
      o.handR = [lerp(b.handR[0], 12, w), lerp(b.handR[1], 12 + 4 * r, w)];
      o.handL = [lerp(b.handL[0], 4, w), lerp(b.handL[1], 6, w)];
      o.kneeL += 2 * w;
      o.kneeR += 2 * w;
      break;
    }
    case 'shrug': {
      // "did you see that?": hands come up and out, palms up, chin up at you, a small lift
      const w = envelope(k, 0.2, 0.28);
      const lift = Math.sin(Math.min(1, k / 0.6) * Math.PI) * w;
      o.elbowL = toward([-9, 1], [-11, 0], w);
      o.elbowR = toward([9, 1], [11, 0], w);
      o.handL = toward(b.handL, [-15, -4 - lift], w);
      o.handR = toward(b.handR, [15, -4 - lift], w);
      o.dy = -0.8 * lift;
      o.head += -0.12 * w + 0.08 * Math.sin(k * Math.PI * 2) * w;
      break;
    }
  }
  return o;
}
