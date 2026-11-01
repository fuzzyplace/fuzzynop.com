/**
 * A tiny ragdoll for the character while he's held by the collar or falling. Pure: no DOM, no clock.
 *
 * The torso is a damped pendulum hanging from the collar; arms and legs are damped pendulums hung
 * from the torso, pulled back toward their rest pose by a soft spring and stopped at joint limits.
 * The head sits above the neck (an inverted pendulum), so it only lags behind the torso and springs back.
 * Everything is driven by the collar's acceleration: yank him right and his body trails left.
 *
 * Angles are radians in screen convention (SVG `rotate`: + = clockwise, so + swings the feet to -x).
 * `torso` is absolute (0 = hanging straight down); limbs and head are relative to the torso.
 */
import { clamp, type Pt } from './geometry';

export type RagPose = { torso: number; head: number; armL: number; armR: number; legL: number; legR: number };
type Joint = { a: number; v: number }; // limbs: absolute angle; head: relative
type LimbKey = 'armL' | 'armR' | 'legL' | 'legR';
export type Ragdoll = {
  torso: Joint;
  head: Joint;
  armL: Joint;
  armR: Joint;
  legL: Joint;
  legR: Joint;
  prev: Pt | null; // last anchor, px
  vel: Pt; // anchor velocity, px/s
  acc: Pt; // smoothed anchor acceleration, px/s²
};

/** Character units (scaled by `scale` to px). */
const LEN = { torso: 30, arm: 14, leg: 24 };
const G = 2000; // px/s² at scale 1
const DAMP = { torso: 2.6, limb: 3.2, head: 9 };
const REST = { limb: 26, head: 60 }; // spring stiffness back toward the torso, 1/s²
const LIMIT = { torso: 1.35, arm: 2.4, leg: 0.9, head: 0.45 };
const ACC_SMOOTH = 0.5; // per-frame low-pass on the anchor acceleration (finite-difference noise)
const ACC_MAX = 9000; // px/s² cap (a pointer jump is not a cannon)

const joint = (a = 0): Joint => ({ a, v: 0 });

export function createRagdoll(torso = 0): Ragdoll {
  return {
    torso: joint(torso),
    head: joint(),
    armL: joint(torso),
    armR: joint(torso),
    legL: joint(torso),
    legR: joint(torso),
    prev: null,
    vel: { x: 0, y: 0 },
    acc: { x: 0, y: 0 },
  };
}

/** Seed the anchor's velocity (e.g. he was already moving when the ragdoll took over). */
export function primeRagdoll(rd: Ragdoll, anchor: Pt, vel: Pt) {
  rd.prev = { ...anchor };
  rd.vel = { ...vel };
  rd.acc = { x: 0, y: 0 };
}

/** θ'' for a pendulum of length `len` px hanging from a point accelerating at (ax, ay) under gravity g. */
const pend = (a: number, len: number, ax: number, ay: number, g: number) => (-(g + ay) * Math.sin(a) + ax * Math.cos(a)) / len;

/**
 * Advance the ragdoll by `dt` s with the collar now at `anchor` (px). `gravity` scales G
 * (pass ~0 for free fall: the collar falls with him, so nothing pulls his limbs down).
 */
export function stepRagdoll(rd: Ragdoll, anchor: Pt, dt: number, scale: number, gravity = 1): RagPose {
  dt = clamp(dt, 0, 1 / 30); // a long frame must not blow the integrator up
  if (dt > 0) {
    if (rd.prev) {
      const vx = (anchor.x - rd.prev.x) / dt;
      const vy = (anchor.y - rd.prev.y) / dt;
      const ax = clamp((vx - rd.vel.x) / dt, -ACC_MAX, ACC_MAX);
      const ay = clamp((vy - rd.vel.y) / dt, -ACC_MAX, ACC_MAX);
      rd.acc = { x: rd.acc.x + (ax - rd.acc.x) * ACC_SMOOTH, y: rd.acc.y + (ay - rd.acc.y) * ACC_SMOOTH };
      rd.vel = { x: vx, y: vy };
    }
    rd.prev = { ...anchor };
    const g = G * scale * gravity;
    const { x: ax, y: ay } = rd.acc;

    // torso: semi-implicit Euler, hard stop at the limit
    const T = rd.torso;
    const tAcc = pend(T.a, LEN.torso * scale, ax, ay, g) - DAMP.torso * T.v;
    T.v += tAcc * dt;
    T.a += T.v * dt;
    if (Math.abs(T.a) > LIMIT.torso) {
      T.a = Math.sign(T.a) * LIMIT.torso;
      T.v *= -0.2;
    }

    // limbs: their own pendulum + a spring toward the torso's angle, limited relative to it
    const limb = (k: LimbKey, len: number, lim: number) => {
      const J = rd[k];
      const rel = J.a - T.a;
      const acc = pend(J.a, len * scale, ax, ay, g) - REST.limb * rel - DAMP.limb * (J.v - T.v) + tAcc * 0.35;
      J.v += acc * dt;
      J.a += J.v * dt;
      const r = J.a - T.a;
      if (Math.abs(r) > lim) {
        J.a = T.a + Math.sign(r) * lim;
        J.v = T.v;
      }
    };
    limb('armL', LEN.arm, LIMIT.arm);
    limb('armR', LEN.arm * 0.95, LIMIT.arm); // slightly different lengths: the two sides drift apart
    limb('legL', LEN.leg, LIMIT.leg);
    limb('legR', LEN.leg * 1.06, LIMIT.leg);

    // head: lags the torso's swing, springs back
    const H = rd.head;
    H.v += (-REST.head * H.a - DAMP.head * H.v - tAcc * 0.5) * dt;
    H.a += H.v * dt;
    if (Math.abs(H.a) > LIMIT.head) {
      H.a = Math.sign(H.a) * LIMIT.head;
      H.v = 0;
    }
  }
  return ragPose(rd);
}

export const ragPose = (rd: Ragdoll): RagPose => ({
  torso: rd.torso.a,
  head: rd.head.a,
  armL: rd.armL.a - rd.torso.a,
  armR: rd.armR.a - rd.torso.a,
  legL: rd.legL.a - rd.torso.a,
  legR: rd.legR.a - rd.torso.a,
});

/** True once every joint is still and back at rest (the loop may stop stepping it). */
export function ragSettled(rd: Ragdoll, eps = 1e-3) {
  const js = [rd.torso, rd.head, rd.armL, rd.armR, rd.legL, rd.legR];
  return js.every((j) => Math.abs(j.v) < eps) && js.every((j) => Math.abs(j.a) < eps);
}
