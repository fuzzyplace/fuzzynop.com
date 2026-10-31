import { hexPoints, solveIK, type Pt } from './geometry';

/**
 * Biomechanical arm: spider-leg segments (tapered, barbed, sinew cables) on machined hex joints.
 * Pure ink silhouette; the only light is a gray rim line and — while printing — an orange hot tip.
 */
type Props = {
  base: Pt;
  tip: Pt;
  l1: number;
  l2: number;
  bend: 1 | -1;
  t: number; // thickness
  tool?: 'nozzle' | 'claw';
  toolLen?: number;
  hot?: number; // 0..1 orange nozzle glow (printing only)
  grip?: number; // 0 open .. 1 closed (claw)
  rail?: { x1: number; y1: number; x2: number; y2: number };
};

function Segment({ from, angle, len, t, barbs }: { from: Pt; angle: number; len: number; t: number; barbs: number }) {
  const deg = (angle * 180) / Math.PI;
  const step = len / (barbs + 1);
  return (
    <g transform={`translate(${from.x} ${from.y}) rotate(${deg})`}>
      {/* chitin shell: fat near joint, tapering, slight organic belly */}
      <path
        className="fill-ink"
        d={`M0 ${-t * 0.5} C ${len * 0.25} ${-t * 0.72}, ${len * 0.65} ${-t * 0.5}, ${len} ${-t * 0.26} L ${len} ${t * 0.26} C ${len * 0.65} ${t * 0.42}, ${len * 0.25} ${t * 0.58}, 0 ${t * 0.5} Z`}
      />
      {/* barbs — spider hairs / machined ribs */}
      {Array.from({ length: barbs }, (_, i) => {
        const x = step * (i + 1);
        const k = 1 - (x / len) * 0.45;
        return (
          <path
            key={i}
            className="fill-ink"
            d={`M${x - t * 0.18} ${-t * 0.55 * k} L${x + t * 0.35} ${-t * 1.05 * k} L${x + t * 0.12} ${-t * 0.5 * k} Z`}
          />
        );
      })}
      {/* sinew */}
      <path
        d={`M ${t * 0.5} ${t * 0.62} Q ${len * 0.5} ${t * 0.95} ${len - t * 0.6} ${t * 0.38}`}
        className="stroke-ink"
        fill="none"
        strokeWidth={Math.max(1, t * 0.09)}
      />
      {/* rim light — the 3D cue */}
      <path d={`M ${t * 0.6} ${-t * 0.36} C ${len * 0.3} ${-t * 0.5}, ${len * 0.6} ${-t * 0.34}, ${len - t * 0.5} ${-t * 0.18}`} className="stroke-rim" fill="none" strokeWidth={1} />
    </g>
  );
}

function Joint({ p, r }: { p: Pt; r: number }) {
  return (
    <g>
      <polygon points={hexPoints(p.x, p.y, r)} className="fill-ink" />
      <circle cx={p.x} cy={p.y} r={r * 0.34} className="fill-rim" />
      <circle cx={p.x} cy={p.y} r={r * 0.16} className="fill-ink" />
    </g>
  );
}

export function MechArm({ base, tip, l1, l2, bend, t, tool = 'nozzle', toolLen = t * 3.4, hot = 0, grip = 0, rail }: Props) {
  const wristTarget = { x: tip.x, y: tip.y - toolLen };
  const { elbow, wrist, shoulder, forearm } = solveIK(base, wristTarget, l1, l2, bend);
  const tipDraw = { x: wrist.x, y: wrist.y + toolLen };
  const len2 = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
  const cw = Math.max(1, t * 0.1);
  const nuts = rail ? Math.max(2, Math.floor(Math.hypot(rail.x2 - rail.x1, rail.y2 - rail.y1) / 90)) : 0;

  return (
    <g filter="url(#ink)">
      {rail && (
        <g>
          <line x1={rail.x1} y1={rail.y1} x2={rail.x2} y2={rail.y2} className="stroke-ink" strokeWidth={t * 0.32} />
          {Array.from({ length: nuts + 1 }, (_, i) => {
            const k = i / nuts;
            return <polygon key={i} points={hexPoints(rail.x1 + (rail.x2 - rail.x1) * k, rail.y1 + (rail.y2 - rail.y1) * k, t * 0.36)} className="fill-ink" />;
          })}
        </g>
      )}

      {/* loose cables, base → wrist, sagging */}
      <path d={`M${base.x} ${base.y} Q ${elbow.x + t * 1.8} ${elbow.y + t * 2.6} ${wrist.x + t * 0.4} ${wrist.y - t * 0.4}`} className="stroke-ink" fill="none" strokeWidth={cw} />
      <path d={`M${base.x} ${base.y} Q ${elbow.x - t * 1.2} ${elbow.y + t * 3.4} ${wrist.x - t * 0.3} ${wrist.y - t * 0.2}`} className="stroke-ink" fill="none" strokeWidth={cw * 0.8} />

      {/* carriage */}
      <rect x={base.x - t * 1.2} y={base.y - t * 0.8} width={t * 2.4} height={t * 1.6} rx={t * 0.2} className="fill-ink" />
      <Segment from={base} angle={shoulder} len={l1} t={t} barbs={Math.max(2, Math.round(l1 / (t * 3)))} />
      <Segment from={elbow} angle={forearm} len={len2} t={t * 0.78} barbs={Math.max(2, Math.round(len2 / (t * 3)))} />
      <Joint p={base} r={t * 1.05} />
      <Joint p={elbow} r={t * 0.85} />
      <Joint p={wrist} r={t * 0.62} />

      {tool === 'nozzle' ? (
        <g>
          <rect x={wrist.x - t * 0.36} y={wrist.y} width={t * 0.72} height={toolLen * 0.5} className="fill-ink" />
          <polygon points={hexPoints(wrist.x, wrist.y + toolLen * 0.5, t * 0.5)} className="fill-ink" />
          <polygon
            points={`${wrist.x - t * 0.3},${wrist.y + toolLen * 0.55} ${wrist.x + t * 0.3},${wrist.y + toolLen * 0.55} ${wrist.x + t * 0.06},${tipDraw.y} ${wrist.x - t * 0.06},${tipDraw.y}`}
            className="fill-ink"
          />
          {/* fine mandibles flanking the nozzle */}
          <path d={`M${wrist.x - t * 0.4} ${wrist.y + toolLen * 0.3} Q ${wrist.x - t * 1.1} ${wrist.y + toolLen * 0.7} ${wrist.x - t * 0.35} ${tipDraw.y - t * 0.2}`} className="stroke-ink" fill="none" strokeWidth={cw} />
          <path d={`M${wrist.x + t * 0.4} ${wrist.y + toolLen * 0.3} Q ${wrist.x + t * 1.1} ${wrist.y + toolLen * 0.7} ${wrist.x + t * 0.35} ${tipDraw.y - t * 0.2}`} className="stroke-ink" fill="none" strokeWidth={cw} />
        </g>
      ) : (
        <g>
          {/* claw: two hooked talons */}
          {[-1, 1].map((s) => {
            const open = (1 - grip) * t * 0.7;
            const x0 = wrist.x + s * t * 0.25;
            const xm = wrist.x + s * (t * 0.9 + open);
            const xe = wrist.x + s * (t * 0.15 + open * 0.4);
            return (
              <path
                key={s}
                className="fill-ink"
                d={`M${x0 - s * t * 0.2} ${wrist.y} Q ${xm} ${wrist.y + toolLen * 0.4} ${xe} ${tipDraw.y} L ${xe - s * t * 0.18} ${tipDraw.y - t * 0.3} Q ${xm - s * t * 0.5} ${wrist.y + toolLen * 0.45} ${x0 + s * t * 0.2} ${wrist.y} Z`}
              />
            );
          })}
        </g>
      )}

      {hot > 0 && tool === 'nozzle' && (
        <g style={{ filter: 'none' }}>
          <circle cx={tipDraw.x} cy={tipDraw.y} r={t * 0.7} className="fill-accent" opacity={0.28 * hot} filter="url(#glow)" />
          <circle cx={tipDraw.x} cy={tipDraw.y} r={Math.max(1.5, t * 0.1)} className="fill-accent" opacity={hot} />
        </g>
      )}
    </g>
  );
}
