import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MechArm } from './MechArm';
import { clamp, easeInOut, lerp } from './geometry';
import { useSize } from './useSize';

/**
 * A paper-cut content plate that a rail-mounted arm 3D-prints, bottom-up, as you scroll.
 * Text is always in the DOM (screen readers, no-JS); only the visual reveal is clipped.
 * Exposes data-perch / data-printed so the Puppeteer can set the character down on it.
 */
const OVER = 240; // space above the plate the arm works in
const SIDE = 44; // gutter for the rail

type Props = {
  id?: string;
  side: 'left' | 'right'; // which side the rail + arm live on
  tone?: 'paper' | 'ink';
  perch?: number; // 0..1 where the character stands on the top edge
  className?: string;
  children: ReactNode;
};

export function PrintedPlate({ id, side, tone = 'paper', perch = side === 'right' ? 0.18 : 0.82, className = '', children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.95', 'end 0.7'] });
  const [p, setP] = useState(0);
  const [forced, setForced] = useState(false);
  useMotionValueEvent(scrollYProgress, 'change', setP);
  useEffect(() => setP(scrollYProgress.get()), [scrollYProgress]);

  const prog = reduce || forced ? 1 : p;
  const pr = clamp(prog / 0.86); // printing
  const back = clamp((prog - 0.86) / 0.14); // retract
  const printed = pr >= 1;

  // geometry in overlay space (plate origin at SIDE, OVER).
  // A 3D-printer gantry: a beam rises with the print edge; the arm rides the beam.
  const ox = SIDE;
  const oy = OVER;
  const edge = oy + h * (1 - pr);
  const t = Math.min(20, Math.max(12, w * 0.022));
  const toolLen = t * 3.2;
  const l = Math.max(120, OVER * 0.6);
  const beamY = lerp(edge - OVER * 0.82, OVER * 0.1, back);
  const passes = 9;
  const sweep = 0.5 - 0.5 * Math.cos(pr * Math.PI * passes);
  const xl = ox + 20;
  const xr = ox + w - 20;
  const dir = side === 'right' ? 1 : -1;
  const printTip = { x: side === 'right' ? lerp(xr, xl, sweep) : lerp(xl, xr, sweep), y: edge };
  const rest = { x: side === 'right' ? ox + w - 70 : ox + 70, y: OVER * 0.1 + l * 1.15 };
  const tip = back > 0 ? { x: lerp(printTip.x, rest.x, easeInOut(back)), y: lerp(printTip.y, rest.y, easeInOut(back)) } : printTip;
  const base = { x: clamp(tip.x + dir * 80, ox - 10, ox + w + 10), y: beamY };
  const printing = pr > 0 && pr < 1;

  return (
    <div
      id={id}
      className={`relative ${className}`}
      data-perch={perch}
      data-printed={printed ? '1' : '0'}
      onFocus={() => setForced(true)}
    >
      <div ref={ref} className="plate-shadow">
        <div style={{ clipPath: h === 0 && !reduce ? 'inset(100% 0 0 0)' : `inset(${(h * (1 - pr)).toFixed(1)}px -2px -2px -2px)` }}>
          <div className={`plate-cut ${tone === 'paper' ? 'plate-paper text-on-paper' : 'plate-ink text-on-surface'} px-7 py-10 md:px-12 md:py-14`}>
            {children}
          </div>
        </div>
      </div>

      {w > 0 && (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ left: -SIDE, top: -OVER, width: w + SIDE * 2, height: h + OVER }}
          viewBox={`0 0 ${w + SIDE * 2} ${h + OVER}`}
          aria-hidden="true"
        >
          {printing && (
            <>
              <line x1={ox} x2={ox + w} y1={edge} y2={edge} className="stroke-gray-600" strokeWidth={1} strokeDasharray="2 5" />
              <line x1={printTip.x - 36} x2={printTip.x + 36} y1={edge} y2={edge} className="stroke-accent" strokeWidth={1} opacity={0.8} />
            </>
          )}
          {/* gantry posts */}
          <g className="stroke-ink" filter="url(#ink)">
            <line x1={ox - 14} x2={ox - 14} y1={0} y2={beamY + t * 0.6} strokeWidth={t * 0.3} />
            <line x1={ox + w + 14} x2={ox + w + 14} y1={0} y2={beamY + t * 0.6} strokeWidth={t * 0.3} />
          </g>
          <MechArm
            base={base}
            tip={tip}
            l1={l}
            l2={l}
            bend={dir === 1 ? -1 : 1}
            t={t}
            toolLen={toolLen}
            hot={printing ? 1 : 0}
            rail={{ x1: ox - 22, y1: beamY, x2: ox + w + 22, y2: beamY }}
          />
        </svg>
      )}
    </div>
  );
}
