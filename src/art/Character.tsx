import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { lerp } from './geometry';
import { FOOT_Y, HIP_L, HIP_R, NECK, SH_L, SH_R, actPose, applyMood, base, isProbeMove, probePose, turnPose, type AnyAction, type LegPts, type Mood, type P2 } from './poses';
import { stuntPose, type StuntAct, type StuntOpts } from './poses'; // ---- stunt ----
import type { RagPose } from './ragdoll';
import { setAttr } from './ticker';
import { gait } from './walk';
import './character.css';

/**
 * The hero character: an original ink silhouette of Z — short sides, textured quiff,
 * rectangular glasses (the only thing that catches light), short beard.
 * Local origin = grip point at the back of the collar. Faces +x.
 * Rendered once; posed imperatively via `ref.current.set(x, y, scale, pose)`. Hidden until first pose.
 *
 * Walking: `phase` (0..1, advanced by distance walked) drives the gait from walk.ts; `walk` is its
 * amplitude (0 = standing). Feet stay the anchor — the body bobs on an inner group and the hips
 * follow, so the planted foot never leaves the surface. Idle breathing (and a faint arm sway) is a
 * stepped CSS loop (`char-breathe`, `char-armsway`) so the stage loop can sleep while he stands still.
 *
 * `action` + `actionK` (0..1 progress) layer a body pose from poses.ts (swat / jump / climb / fall,
 * fidgets, sitting, reactions) on top of the gait. `turn` plays the about-face: an instant flip of
 * `facing`, sold by a short pivot (head leads, weight shift, front foot steps across), never a squash
 * below 0.9. `mood` is his posture (poses.ts `applyMood`): hunched when wary, open when warm. `rag` (from ragdoll.ts) bends head, arms and legs about their joints while he's held or
 * falling; its angles are screen-space, so they're mirrored here when he faces -x.
 */
export type { Action, AnyAction } from './poses';
export type Pose = {
  swing: number;
  dangle: number;
  facing: number; // sign = which way he's drawn (±1); the turn pose does the rest
  squash: number;
  phase?: number;
  walk?: number; // 0..1 gait amplitude
  tilt?: number; // head tilt in radians, + = chin down
  rag?: RagPose; // limbs relative to the torso (torso itself is applied by the Puppeteer as a collar pivot)
  action?: AnyAction; // an Action, or a probe move (poses.ts "probe poses")
  actionK?: number; // 0..1 through the action
  aim?: number; // probe moves: the front arm's reach angle (poses.ts probePose)
  kick?: number; // sitting: -1..1 swing of the dangling shins
  amp?: number; // tap: hop height scale
  turn?: { k: number; hop: boolean }; // mid about-face, k 0..1 (facing already flipped once k ≥ FLIP)
  tremble?: boolean; // shaken: a stepped CSS tremor (`char-shiver`, character.css), so the stage loop can still sleep
  mood?: Mood; // how he holds himself (wary hunch, warm and open, pushing up into a pat): under every action
  stunt?: { kind: StuntAct; k: number } & StuntOpts; // ---- stunt ---- a title-stunt pose, over everything else
};
export type CharacterHandle = { set: (x: number, y: number, scale: number, pose: Pose) => void };

/** Foot travel per step, character units. The Puppeteer walks 2·STRIDE·scale px per gait cycle. */
export const STRIDE = 14;

const f = (n: number) => Math.round(n * 100) / 100;
/** Rotate p about c by a radians (SVG convention). */
const rot = (p: P2, c: P2, a: number): P2 => {
  if (!a) return p;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
};
/** A tapered leg's outline points: hip edge → knee → foot edge. The knee bends forward by `knee` units. */
function legPts(ho: P2, hi: P2, fo: P2, fi: P2, knee: number): LegPts {
  return [ho, hi, [(ho[0] + fo[0]) / 2 + knee, (ho[1] + fo[1]) / 2], [(hi[0] + fi[0]) / 2 + knee, (hi[1] + fi[1]) / 2], fo, fi];
}
const mix = (a: LegPts, b: LegPts, w: number): LegPts => a.map((p, i) => [lerp(p[0], b[i][0], w), lerp(p[1], b[i][1], w)]) as LegPts;
const legPath = ([ho, hi, ko, ki, fo, fi]: LegPts) =>
  `M${f(ho[0])} ${f(ho[1])} L${f(ko[0])} ${f(ko[1])} L${f(fo[0])} ${f(fo[1])} L${f(fi[0])} ${f(fi[1])} L${f(ki[0])} ${f(ki[1])} L${f(hi[0])} ${f(hi[1])} Z`;
const armPath = (sh: P2, hand: P2, elbow?: P2) =>
  elbow ? `M${sh[0]} ${sh[1]} L${f(elbow[0])} ${f(elbow[1])} L${f(hand[0])} ${f(hand[1])}` : `M${sh[0]} ${sh[1]} L${f(hand[0])} ${f(hand[1])}`;

export function Character({ ref }: { ref?: Ref<CharacterHandle> }) {
  const el = useRef({
    root: null as SVGGElement | null,
    shake: null as SVGGElement | null,
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
      set(x, y, scale, { swing, dangle, facing, squash, phase = 0, walk = 0, tilt = 0, rag, action, actionK = 0, kick = 0, amp = 1, aim, turn, tremble = false, mood, stunt }) {
        setAttr(el.shake, 'class', tremble ? 'char-shiver' : null);
        const legA = dangle * 0.35; // legs drift apart while carried
        const g = gait(phase, walk, STRIDE);
        const bob = g.bob;
        // standing body from the gait, then the action, then the turn, then the ragdoll
        const stand = base({ x: g.footL.x - legA * 10, lift: g.footL.lift }, { x: g.footR.x + legA * 9, lift: g.footR.lift }, g.arm, dangle, tilt);
        // a probe move owns the pose like any on-the-spot action (the posture eases off under it)
        const o = isProbeMove(action)
          ? applyMood(probePose(action, actionK, stand, aim), mood, 'still', actionK)
          : applyMood(actPose(action, actionK, stand, kick, amp), mood, action, actionK);
        if (stunt) Object.assign(o, stuntPose(stunt.kind, stunt.k, o, stunt)); // ---- stunt ----
        let sx = 1;
        let headBack = o.headBack;
        if (turn) {
          const tp = turnPose(turn.k, turn.hop);
          o.dx += tp.dx;
          if (tp.flipped) o.L = { ...o.L, x: o.L.x + tp.cross };
          else o.R = { x: o.R.x + tp.cross, lift: o.R.lift + Math.abs(tp.cross) * 0.25 };
          o.lift += tp.lift;
          headBack = headBack !== tp.headBack; // looking back during a turn = facing the new way
          sx = tp.sx;
        }
        const fx = (facing < 0 ? -1 : 1) * sx;
        const mir = facing < 0 ? -1 : 1; // screen-space rag angles → local (local x is flipped when facing -x)
        setAttr(el.root, 'display', null);
        setAttr(
          el.root,
          'transform',
          `translate(${f(x)} ${f(y - o.lift * scale)}) rotate(${f((swing * 180) / Math.PI)}) scale(${f(fx * scale)} ${f(scale * (1 - squash))})`,
        );

        // hips follow the upper body (crouch / weight shift); a lowered body bends the knees forward
        const hx = o.dx * 0.5;
        const hy = o.dy - bob;
        const bend = Math.max(0, o.dy) * 0.55;
        let fo: P2[] = [
          [-5 + o.L.x, FOOT_Y - o.L.lift],
          [-2 + o.L.x, FOOT_Y - o.L.lift],
          [4 + o.R.x, FOOT_Y - o.R.lift],
          [7 + o.R.x, FOOT_Y - o.R.lift],
        ];
        let { handL, handR, elbowL, elbowR, kneeL, kneeR } = o;
        let headA = o.head;
        if (rag) {
          handL = rot(handL, SH_L, rag.armL * mir);
          handR = rot(handR, SH_R, rag.armR * mir);
          if (elbowL) elbowL = rot(elbowL, SH_L, rag.armL * mir);
          if (elbowR) elbowR = rot(elbowR, SH_R, rag.armR * mir);
          fo = [rot(fo[0], HIP_L, rag.legL * mir), rot(fo[1], HIP_L, rag.legL * mir), rot(fo[2], HIP_R, rag.legR * mir), rot(fo[3], HIP_R, rag.legR * mir)];
          headA += rag.head * mir;
          kneeL = 1.2;
          kneeR = 1.2;
        }
        let lL = legPts([-3 + hx, 2 + hy], [-0.5 + hx, 4 + hy], fo[0], fo[1], kneeL + bend);
        let lR = legPts([3 + hx, 2 + hy], [5.5 + hx, 3 + hy], fo[2], fo[3], kneeR + bend);
        if (o.legs && o.legs.w > 0) {
          lL = mix(lL, o.legs.L, o.legs.w);
          lR = mix(lR, o.legs.R, o.legs.w);
        }
        setAttr(el.legL, 'd', legPath(lL));
        setAttr(el.legR, 'd', legPath(lR));
        // arms hang from the shoulders, in the body group's space (they ride with the crouch / sit)
        setAttr(el.armL, 'd', armPath(SH_L, handL, elbowL));
        setAttr(el.armR, 'd', armPath(SH_R, handR, elbowR));
        const bodyT = o.dx || o.dy || bob ? `translate(${f(o.dx)} ${f(o.dy - bob)})` : null;
        const a = headBack ? -headA : headA;
        const headT = a || headBack ? `rotate(${f((a * 180) / Math.PI)} ${NECK[0]} ${NECK[1]})${headBack ? ' scale(-1 1)' : ''}` : null;
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
      <g ref={(e) => void (el.shake = e)}>
        <g filter="url(#ink)">
          {/* legs */}
          <path ref={(e) => void (el.legL = e)} className="fill-ink" />
          <path ref={(e) => void (el.legR = e)} className="fill-ink" />
          <g ref={(e) => void (el.body = e)}>
            <g className="char-breathe">
              {/* torso — blazer silhouette */}
              <path d="M-8 -9 C-9 -4,-7 4,-6 6 L7 6 C8 2,9 -4,8 -9 C5 -11,-5 -11,-8 -9 Z" className="fill-ink" />
              {/* arms */}
              <g className="char-armsway" style={{ transformOrigin: '-7px -7px' }}>
                <path ref={(e) => void (el.armL = e)} className="stroke-ink" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <g className="char-armsway char-armsway--front" style={{ transformOrigin: '7px -7px' }}>
                <path ref={(e) => void (el.armR = e)} className="stroke-ink" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
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
    </g>
  );
}
