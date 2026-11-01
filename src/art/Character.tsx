import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { RagPose } from './ragdoll';
import { setAttr } from './ticker';
import { gait } from './walk';

/**
 * The hero character: an original ink silhouette of Z — short sides, textured quiff,
 * rectangular glasses (the only thing that catches light), short beard.
 * Local origin = grip point at the back of the collar. Faces +x.
 * Rendered once; posed imperatively via `ref.current.set(x, y, scale, pose)`. Hidden until first pose.
 *
 * Walking: `phase` (0..1, advanced by distance walked) drives the gait from walk.ts; `walk` is its
 * amplitude (0 = standing). Feet stay the anchor — the body bobs on an inner group and the hips
 * follow, so the planted foot never leaves the surface. Idle breathing is a stepped CSS loop
 * (`char-breathe`) so the stage loop can sleep while he stands still.
 *
 * `action` + `actionK` (0..1 progress) layer a body pose for swat / jump / climb / fall on top of the
 * gait. `rag` (from ragdoll.ts) bends head, arms and legs about their joints while he's held or falling;
 * its angles are screen-space, so they're mirrored here when he faces -x.
 */
export type Pose = {
  swing: number;
  dangle: number;
  facing: number; // -1..1; in between he's mid-turn (a paper cut-out turning edge-on)
  squash: number;
  phase?: number;
  walk?: number; // 0..1 gait amplitude
  tilt?: number; // head tilt in radians, + = chin down
  rag?: RagPose; // limbs relative to the torso (torso itself is applied by the Puppeteer as a collar pivot)
  action?: Action;
  actionK?: number; // 0..1 through the action
};
export type Action = 'swat' | 'jump' | 'climb' | 'fall';
export type CharacterHandle = { set: (x: number, y: number, scale: number, pose: Pose) => void };

/** Foot travel per step, character units. The Puppeteer walks 2·STRIDE·scale px per gait cycle. */
export const STRIDE = 14;

const f = (n: number) => Math.round(n * 100) / 100;
type P2 = [number, number];
/** Rotate p about c by a radians (SVG convention). */
const rot = (p: P2, c: P2, a: number): P2 => {
  if (!a) return p;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
};
/** Point `len` from `c` at angle `a` from straight down (+ = toward -x, SVG rotate convention). */
const hang = (c: P2, len: number, a: number): P2 => [c[0] - Math.sin(a) * len, c[1] + Math.cos(a) * len];
const SH_L: P2 = [-7, -7];
const SH_R: P2 = [7, -7];
const HIP_L: P2 = [-1.75, 3];
const HIP_R: P2 = [4.25, 2.5];
const NECK: P2 = [0, -13];
/** A tapered leg: hip edge → knee → foot edge. The knee bends forward by `knee` units. */
function leg(ho: P2, hi: P2, fo: P2, fi: P2, knee: number) {
  const ko = [(ho[0] + fo[0]) / 2 + knee, (ho[1] + fo[1]) / 2];
  const ki = [(hi[0] + fi[0]) / 2 + knee, (hi[1] + fi[1]) / 2];
  return `M${f(ho[0])} ${f(ho[1])} L${f(ko[0])} ${f(ko[1])} L${f(fo[0])} ${f(fo[1])} L${f(fi[0])} ${f(fi[1])} L${f(ki[0])} ${f(ki[1])} L${f(hi[0])} ${f(hi[1])} Z`;
}

export function Character({ ref }: { ref?: Ref<CharacterHandle> }) {
  const el = useRef({
    root: null as SVGGElement | null,
    legL: null as SVGPathElement | null,
    legR: null as SVGPathElement | null,
    armL: null as SVGPathElement | null,
    armR: null as SVGPathElement | null,
    body: null as SVGGElement | null,
    head: null as SVGGElement | null,
    bodyG: null as SVGGElement | null,
    headG: null as SVGGElement | null,
  }).current;

  useLayoutEffect(() => setAttr(el.root, 'display', 'none'), [el]);

  useImperativeHandle(
    ref,
    () => ({
      set(x, y, scale, { swing, dangle, facing, squash, phase = 0, walk = 0, tilt = 0, rag, action, actionK = 0 }) {
        const legA = dangle * 0.35; // legs drift apart while carried
        const armA = dangle * 0.5;
        const g = gait(phase, walk, STRIDE);
        const b = g.bob;
        const fx = (facing < 0 ? -1 : 1) * Math.max(0.08, Math.abs(facing));
        const mir = fx < 0 ? -1 : 1; // screen-space rag angles → local (local x is flipped when facing -x)
        setAttr(el.root, 'display', null);
        setAttr(el.root, 'transform', `translate(${x} ${y}) rotate(${(swing * 180) / Math.PI}) scale(${fx * scale} ${scale * (1 - squash)})`);

        // feet (outer, inner) and hands from the gait, then the action, then the ragdoll
        let L = { x: g.footL.x - legA * 10, lift: g.footL.lift };
        let R = { x: g.footR.x + legA * 9, lift: g.footR.lift };
        const sw = g.arm * 2.6; // arms counter-swing the legs
        let handL: P2 = [-9 - armA * 6 - sw, 8 - armA * 4];
        let handR: P2 = [9 + armA * 6 + sw, 8 - armA * 4];
        let headA = tilt;
        let kneeL = L.lift * 0.8;
        let kneeR = R.lift * 0.8;
        const k = Math.min(1, Math.max(0, actionK));
        if (action === 'swat') {
          // a quick flick of the front hand up and out, then back; head pulls away
          const s1 = Math.sin(Math.PI * k);
          handR = hang(SH_R, 15, -(0.5 + 2.1 * s1 * s1));
          handL = hang(SH_L, 15, 0.35 * s1);
          headA += -0.12 * s1;
        } else if (action === 'jump') {
          // crouch, arms back → stretch, arms up → tuck in the air → land
          const crouch = k < 0.15 ? Math.sin((k / 0.15) * Math.PI * 0.5) : Math.max(0, 1 - (k - 0.15) * 8);
          const tuck = k > 0.3 ? Math.sin(((k - 0.3) / 0.7) * Math.PI) : 0;
          kneeL = kneeR = 3.5 * crouch + 5 * tuck;
          L = { x: L.x - 1.5 * tuck, lift: 6 * tuck };
          R = { x: R.x - 1.5 * tuck, lift: 6 * tuck };
          handL = hang(SH_L, 15, crouch > 0.2 ? 0.6 : -2.4 * tuck - 0.3);
          handR = hang(SH_R, 15, crouch > 0.2 ? 0.6 : -2.6 * tuck - 0.3);
        } else if (action === 'climb') {
          // hand over hand, knees alternating against the wall
          const c = Math.sin(k * Math.PI * 10);
          handL = hang(SH_L, 15, Math.PI - 0.25 + 0.25 * c);
          handR = hang(SH_R, 15, Math.PI + 0.1 - 0.25 * c);
          L = { x: 3, lift: 5 + 3 * c };
          R = { x: 4, lift: 5 - 3 * c };
          kneeL = 5 + 2 * c;
          kneeR = 5 - 2 * c;
          headA += -0.1;
        } else if (action === 'fall') {
          // arms up, legs apart
          const a = Math.min(1, k * 3);
          handL = hang(SH_L, 15, 2.4 * a);
          handR = hang(SH_R, 15, -2.5 * a);
          L = { x: L.x - 3 * a, lift: 2 * a };
          R = { x: R.x + 3 * a, lift: 2 * a };
        }
        let fo: P2[] = [
          [-5 + L.x, 26 - L.lift],
          [-2 + L.x, 26 - L.lift],
          [4 + R.x, 26 - R.lift],
          [7 + R.x, 26 - R.lift],
        ];
        if (rag) {
          handL = rot(handL, SH_L, rag.armL * mir);
          handR = rot(handR, SH_R, rag.armR * mir);
          fo = [rot(fo[0], HIP_L, rag.legL * mir), rot(fo[1], HIP_L, rag.legL * mir), rot(fo[2], HIP_R, rag.legR * mir), rot(fo[3], HIP_R, rag.legR * mir)];
          headA += rag.head * mir;
          kneeL = 1.2;
          kneeR = 1.2;
        }
        setAttr(el.legL, 'd', leg([-3, 2 - b], [-0.5, 4 - b], fo[0], fo[1], kneeL));
        setAttr(el.legR, 'd', leg([3, 2 - b], [5.5, 3 - b], fo[2], fo[3], kneeR));
        setAttr(el.armL, 'd', `M-7 -7 L${f(handL[0])} ${f(handL[1])}`);
        setAttr(el.armR, 'd', `M7 -7 L${f(handR[0])} ${f(handR[1])}`);
        const bodyT = b ? `translate(0 ${f(-b)})` : null;
        const headT = headA ? `rotate(${f((headA * 180) / Math.PI)} ${NECK[0]} ${NECK[1]})` : null;
        setAttr(el.body, 'transform', bodyT);
        setAttr(el.bodyG, 'transform', bodyT);
        setAttr(el.head, 'transform', headT);
        setAttr(el.headG, 'transform', headT);
      },
    }),
    [el],
  );

  return (
    <g ref={(e) => void (el.root = e)}>
      <g filter="url(#ink)">
        {/* legs */}
        <path ref={(e) => void (el.legL = e)} className="fill-ink" />
        <path ref={(e) => void (el.legR = e)} className="fill-ink" />
        <g ref={(e) => void (el.body = e)}>
          <g className="char-breathe">
            {/* torso — blazer silhouette */}
            <path d="M-8 -9 C-9 -4,-7 4,-6 6 L7 6 C8 2,9 -4,8 -9 C5 -11,-5 -11,-8 -9 Z" className="fill-ink" />
            {/* arms */}
            <path ref={(e) => void (el.armL = e)} className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
            <path ref={(e) => void (el.armR = e)} className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
            {/* neck */}
            <rect x="-2.5" y="-14" width="5" height="6" className="fill-ink" />
            <g ref={(e) => void (el.head = e)}>
              {/* head: skull, short sides, textured quiff, nose, beard */}
              <path
                className="fill-ink"
                d="M-9 -18 C-12 -24,-11 -32,-6 -35 L-8 -37 L-4 -37.5 L-6 -40 L-1 -39 L-2 -42.5 L3 -40 L3.5 -43 L7 -39.5 L9.5 -41 L10 -36.5 C11.5 -34,11.5 -31,11 -28 L13 -24.5 L11 -23.5 C11.5 -21,11 -19.5,10.5 -18.5 C10.5 -16,9 -13.5,6 -12.5 C2 -11.5,-2 -13,-4 -14.5 L-6 -16 Z"
              />
              {/* beard stubble breaking the jaw line */}
              <path d="M10 -16 L11.4 -15.4 M8 -13.2 L9 -12 M5 -12.4 L5.5 -11 M2 -12.2 L2 -10.9" className="stroke-ink" strokeWidth="0.9" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </g>
      {/* glasses — rectangular frames catch the light (unfiltered; same bob / breath / tilt as the head) */}
      <g ref={(e) => void (el.bodyG = e)}>
        <g className="char-breathe">
          <g ref={(e) => void (el.headG = e)}>
            <rect x="4.6" y="-30.2" width="6.6" height="4.6" rx="0.9" fill="none" className="stroke-gray-300" strokeWidth="1.1" />
            <path d="M4.6 -28.4 L-3 -29.2" className="stroke-gray-500" strokeWidth="0.9" />
            <path d="M6 -29.2 L7.6 -29.2" className="stroke-gray-100" strokeWidth="0.7" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </g>
  );
}
