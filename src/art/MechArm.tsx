import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { hexPoints, solveIK, type Pt } from './geometry';
import { setAttr } from './ticker';

/**
 * Biomechanical arm: spider-leg segments (tapered, barbed, sinew cables) on machined hex joints.
 * Pure ink silhouette; the only light is a gray rim line and — while printing — an orange hot tip.
 *
 * Rendered once; moved imperatively. Static shape (lengths, thickness, tool) comes from props;
 * the per-frame pose goes through `ref.current.set(pose)`, which writes attributes directly.
 * The arm stays hidden until its first pose.
 */
export type ArmPose = {
  base: Pt;
  tip: Pt;
  bend: 1 | -1;
  hot?: number; // 0..1 orange nozzle glow (printing only)
  grip?: number; // 0 open .. 1 closed (claw)
  railY?: number; // horizontal rail height (when the arm has a rail)
};
export type ArmHandle = { set: (pose: ArmPose) => void };

type Props = {
  l1: number;
  l2: number;
  t: number; // thickness
  tool?: 'nozzle' | 'claw';
  toolLen?: number;
  rail?: { x1: number; x2: number };
  ref?: Ref<ArmHandle>;
};

const segPath = (len: number, t: number) =>
  `M0 ${-t * 0.5} C ${len * 0.25} ${-t * 0.72}, ${len * 0.65} ${-t * 0.5}, ${len} ${-t * 0.26} L ${len} ${t * 0.26} C ${len * 0.65} ${t * 0.42}, ${len * 0.25} ${t * 0.58}, 0 ${t * 0.5} Z`;

function SegmentShape({ len, t, barbs }: { len: number; t: number; barbs: number }) {
  const step = len / (barbs + 1);
  return (
    <>
      {/* chitin shell: fat near joint, tapering, slight organic belly */}
      <path className="fill-ink" d={segPath(len, t)} />
      {/* barbs — spider hairs / machined ribs */}
      {Array.from({ length: barbs }, (_, i) => {
        const x = step * (i + 1);
        const k = 1 - (x / len) * 0.45;
        return <path key={i} className="fill-ink" d={`M${x - t * 0.18} ${-t * 0.55 * k} L${x + t * 0.35} ${-t * 1.05 * k} L${x + t * 0.12} ${-t * 0.5 * k} Z`} />;
      })}
      {/* sinew */}
      <path d={`M ${t * 0.5} ${t * 0.62} Q ${len * 0.5} ${t * 0.95} ${len - t * 0.6} ${t * 0.38}`} className="stroke-ink" fill="none" strokeWidth={Math.max(1, t * 0.09)} />
      {/* rim light — the 3D cue */}
      <path d={`M ${t * 0.6} ${-t * 0.36} C ${len * 0.3} ${-t * 0.5}, ${len * 0.6} ${-t * 0.34}, ${len - t * 0.5} ${-t * 0.18}`} className="stroke-rim" fill="none" strokeWidth={1} />
    </>
  );
}

type JointEls = { hex: SVGPolygonElement | null; rim: SVGCircleElement | null; dot: SVGCircleElement | null };
const newJoint = (): JointEls => ({ hex: null, rim: null, dot: null });

function Joint({ r, els }: { r: number; els: JointEls }) {
  return (
    <g>
      <polygon ref={(e) => void (els.hex = e)} className="fill-ink" />
      <circle ref={(e) => void (els.rim = e)} r={r * 0.34} className="fill-rim" />
      <circle ref={(e) => void (els.dot = e)} r={r * 0.16} className="fill-ink" />
    </g>
  );
}
function placeJoint(els: JointEls, p: Pt, r: number) {
  setAttr(els.hex, 'points', hexPoints(p.x, p.y, r));
  for (const c of [els.rim, els.dot]) {
    setAttr(c, 'cx', p.x);
    setAttr(c, 'cy', p.y);
  }
}

export function MechArm({ l1, l2, t, tool = 'nozzle', toolLen = t * 3.4, rail, ref }: Props) {
  const nuts = rail ? Math.max(2, Math.floor((rail.x2 - rail.x1) / 90)) : 0;
  const el = useRef({
    root: null as SVGGElement | null,
    railLine: null as SVGLineElement | null,
    nuts: [] as (SVGPolygonElement | null)[],
    cableA: null as SVGPathElement | null,
    cableB: null as SVGPathElement | null,
    carriage: null as SVGRectElement | null,
    seg1: null as SVGGElement | null,
    seg2: null as SVGGElement | null,
    joints: [newJoint(), newJoint(), newJoint()],
    stem: null as SVGRectElement | null,
    collet: null as SVGPolygonElement | null,
    cone: null as SVGPolygonElement | null,
    mandL: null as SVGPathElement | null,
    mandR: null as SVGPathElement | null,
    claw: [] as (SVGPathElement | null)[],
    glow: null as SVGGElement | null,
    halo: null as SVGCircleElement | null,
    spark: null as SVGCircleElement | null,
  }).current;
  const cfg = { l1, l2, t, tool, toolLen, rail, nuts };
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // hidden until first pose
  useLayoutEffect(() => setAttr(el.root, 'display', 'none'), [el]);

  useImperativeHandle(
    ref,
    () => ({
      set({ base, tip, bend, hot = 0, grip = 0, railY = 0 }) {
        const { l1, l2, t, tool, toolLen, rail, nuts } = cfgRef.current;
        const wristTarget = { x: tip.x, y: tip.y - toolLen };
        const { elbow, wrist, shoulder, forearm } = solveIK(base, wristTarget, l1, l2, bend);
        const tipDraw = { x: wrist.x, y: wrist.y + toolLen };
        setAttr(el.root, 'display', null);

        if (rail) {
          setAttr(el.railLine, 'y1', railY);
          setAttr(el.railLine, 'y2', railY);
          for (let i = 0; i <= nuts; i++) setAttr(el.nuts[i], 'points', hexPoints(rail.x1 + (rail.x2 - rail.x1) * (i / nuts), railY, t * 0.36));
        }
        setAttr(el.cableA, 'd', `M${base.x} ${base.y} Q ${elbow.x + t * 1.8} ${elbow.y + t * 2.6} ${wrist.x + t * 0.4} ${wrist.y - t * 0.4}`);
        setAttr(el.cableB, 'd', `M${base.x} ${base.y} Q ${elbow.x - t * 1.2} ${elbow.y + t * 3.4} ${wrist.x - t * 0.3} ${wrist.y - t * 0.2}`);
        setAttr(el.carriage, 'x', base.x - t * 1.2);
        setAttr(el.carriage, 'y', base.y - t * 0.8);
        setAttr(el.seg1, 'transform', `translate(${base.x} ${base.y}) rotate(${(shoulder * 180) / Math.PI})`);
        setAttr(el.seg2, 'transform', `translate(${elbow.x} ${elbow.y}) rotate(${(forearm * 180) / Math.PI})`);
        placeJoint(el.joints[0], base, t * 1.05);
        placeJoint(el.joints[1], elbow, t * 0.85);
        placeJoint(el.joints[2], wrist, t * 0.62);

        if (tool === 'nozzle') {
          setAttr(el.stem, 'x', wrist.x - t * 0.36);
          setAttr(el.stem, 'y', wrist.y);
          setAttr(el.collet, 'points', hexPoints(wrist.x, wrist.y + toolLen * 0.5, t * 0.5));
          setAttr(el.cone, 'points', `${wrist.x - t * 0.3},${wrist.y + toolLen * 0.55} ${wrist.x + t * 0.3},${wrist.y + toolLen * 0.55} ${wrist.x + t * 0.06},${tipDraw.y} ${wrist.x - t * 0.06},${tipDraw.y}`);
          setAttr(el.mandL, 'd', `M${wrist.x - t * 0.4} ${wrist.y + toolLen * 0.3} Q ${wrist.x - t * 1.1} ${wrist.y + toolLen * 0.7} ${wrist.x - t * 0.35} ${tipDraw.y - t * 0.2}`);
          setAttr(el.mandR, 'd', `M${wrist.x + t * 0.4} ${wrist.y + toolLen * 0.3} Q ${wrist.x + t * 1.1} ${wrist.y + toolLen * 0.7} ${wrist.x + t * 0.35} ${tipDraw.y - t * 0.2}`);
          setAttr(el.glow, 'display', hot > 0 ? null : 'none');
          if (hot > 0) {
            for (const c of [el.halo, el.spark]) {
              setAttr(c, 'cx', tipDraw.x);
              setAttr(c, 'cy', tipDraw.y);
            }
            setAttr(el.halo, 'opacity', 0.28 * hot);
            setAttr(el.spark, 'opacity', hot);
          }
        } else {
          // claw: two hooked talons
          [-1, 1].forEach((s, i) => {
            const open = (1 - grip) * t * 0.7;
            const x0 = wrist.x + s * t * 0.25;
            const xm = wrist.x + s * (t * 0.9 + open);
            const xe = wrist.x + s * (t * 0.15 + open * 0.4);
            setAttr(
              el.claw[i],
              'd',
              `M${x0 - s * t * 0.2} ${wrist.y} Q ${xm} ${wrist.y + toolLen * 0.4} ${xe} ${tipDraw.y} L ${xe - s * t * 0.18} ${tipDraw.y - t * 0.3} Q ${xm - s * t * 0.5} ${wrist.y + toolLen * 0.45} ${x0 + s * t * 0.2} ${wrist.y} Z`,
            );
          });
        }
      },
    }),
    [el],
  );

  const cw = Math.max(1, t * 0.1);
  return (
    <g ref={(e) => void (el.root = e)}>
      {/* static rail: filtered on its own so its full-width strip doesn't inflate the moving arm's filter region */}
      {rail && (
        <g filter="url(#ink)">
          <line ref={(e) => void (el.railLine = e)} x1={rail.x1} x2={rail.x2} className="stroke-ink" strokeWidth={t * 0.32} />
          {Array.from({ length: nuts + 1 }, (_, i) => (
            <polygon key={i} ref={(e) => void (el.nuts[i] = e)} className="fill-ink" />
          ))}
        </g>
      )}

      {/* moving parts: own filter region (the arm's bbox, not the full-width rail) */}
      <g filter="url(#ink)">
        {/* loose cables, base → wrist, sagging */}
        <path ref={(e) => void (el.cableA = e)} className="stroke-ink" fill="none" strokeWidth={cw} />
        <path ref={(e) => void (el.cableB = e)} className="stroke-ink" fill="none" strokeWidth={cw * 0.8} />

        {/* carriage */}
        <rect ref={(e) => void (el.carriage = e)} width={t * 2.4} height={t * 1.6} rx={t * 0.2} className="fill-ink" />
        <g ref={(e) => void (el.seg1 = e)}>
          <SegmentShape len={l1} t={t} barbs={Math.max(2, Math.round(l1 / (t * 3)))} />
        </g>
        <g ref={(e) => void (el.seg2 = e)}>
          <SegmentShape len={l2} t={t * 0.78} barbs={Math.max(2, Math.round(l2 / (t * 3)))} />
        </g>
        <Joint r={t * 1.05} els={el.joints[0]} />
        <Joint r={t * 0.85} els={el.joints[1]} />
        <Joint r={t * 0.62} els={el.joints[2]} />

        {tool === 'nozzle' ? (
          <g>
            <rect ref={(e) => void (el.stem = e)} width={t * 0.72} height={toolLen * 0.5} className="fill-ink" />
            <polygon ref={(e) => void (el.collet = e)} className="fill-ink" />
            <polygon ref={(e) => void (el.cone = e)} className="fill-ink" />
            {/* fine mandibles flanking the nozzle */}
            <path ref={(e) => void (el.mandL = e)} className="stroke-ink" fill="none" strokeWidth={cw} />
            <path ref={(e) => void (el.mandR = e)} className="stroke-ink" fill="none" strokeWidth={cw} />
          </g>
        ) : (
          <g>
            {[0, 1].map((i) => (
              <path key={i} ref={(e) => void (el.claw[i] = e)} className="fill-ink" />
            ))}
          </g>
        )}

        {tool === 'nozzle' && (
          <g ref={(e) => void (el.glow = e)} style={{ filter: 'none' }}>
            <circle ref={(e) => void (el.halo = e)} r={t * 0.7} className="fill-accent" filter="url(#glow)" />
            <circle ref={(e) => void (el.spark = e)} r={Math.max(1.5, t * 0.1)} className="fill-accent" />
          </g>
        )}
      </g>
    </g>
  );
}
