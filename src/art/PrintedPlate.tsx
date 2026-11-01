import { useReducedMotion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { cutLayout, hashSeed, tornPath } from './cutout';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp } from './geometry';
import { docTop, onLayout, setAttr, ticker } from './ticker';
import { useSize } from './useSize';

/**
 * A paper-cut content plate that a rail-mounted arm 3D-prints, bottom-up, as you scroll.
 * Text is always in the DOM (screen readers, no-JS); only the visual reveal is clipped.
 * Exposes data-perch / data-printed so the Puppeteer can set the character down on it, and, while
 * printing, data-printing + data-arm ("baseX baseY tipX tipY", px from the plate's top-left) so he can watch it.
 *
 * Scroll progress uses motion's offset convention (['start 0.95', 'end 0.7'], capped so the top is
 * done by mid-viewport) on cached
 * geometry; scroll events are coalesced into one ticker frame that writes through refs.
 */
const OVER = 240; // space above the plate the arm works in
const SIDE = 44; // gutter for the rail
const START = 0.95; // progress 0: plate top at 95% of the viewport
const END = 0.7; // progress 1: plate bottom at 70% of the viewport
// ...or sooner: a plate is done printing by the time its top edge reaches the middle of the viewport
// (progress 0.86 ≈ top at 50%), so a tall plate's heading isn't still unprinted under the header and
// its top edge is a perch while there's room for the character below the header.
const TOP_DONE = 0.43;
const BLEED = 28; // reveal-clip overhang so the backing paper layers aren't chopped

type Props = {
  id?: string;
  side: 'left' | 'right'; // which side the rail + arm live on
  tone?: 'paper' | 'ink';
  perch?: number; // 0..1 where the character stands on the top edge
  seed?: number; // torn-edge seed; defaults to a hash of id
  className?: string;
  children: ReactNode;
};

export function PrintedPlate({ id, side, tone = 'paper', perch = side === 'right' ? 0.18 : 0.82, seed, className = '', children }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const lines = useRef<SVGGElement>(null);
  const edgeLine = useRef<SVGLineElement>(null);
  const hotLine = useRef<SVGLineElement>(null);
  const postL = useRef<SVGLineElement>(null);
  const postR = useRef<SVGLineElement>(null);
  const armRef = useRef<ArmHandle>(null);
  const { w, h } = useSize(ref);
  const reduce = useReducedMotion();
  const forced = useRef(false);
  const lastInset = useRef('');
  const geo = useRef({ top: 0, height: 0, vh: 1 });

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    geo.current = { top: docTop(el), height: el.clientHeight, vh: document.documentElement.clientHeight };
  };
  const progress = () => {
    const { top, height, vh } = geo.current;
    const from = top - START * vh;
    const to = Math.min(top + height - END * vh, top - TOP_DONE * vh);
    return to > from ? clamp((window.scrollY - from) / (to - from)) : 1;
  };

  const draw = useRef<() => void>(() => {});
  draw.current = () => {
    const prog = reduce || forced.current ? 1 : progress();
    const pr = clamp(prog / 0.86); // printing
    const back = clamp((prog - 0.86) / 0.14); // retract
    const printed = pr >= 1;
    const printing = pr > 0 && pr < 1;
    setAttr(outer.current, 'data-printed', printed ? '1' : '0');
    const top = pr >= 1 ? -BLEED : h * (1 - pr);
    const inset = h === 0 && !reduce ? 'inset(100% 0 0 0)' : `inset(${top.toFixed(1)}px -${BLEED}px -${BLEED}px -${BLEED}px)`;
    if (clip.current && lastInset.current !== inset) clip.current.style.clipPath = lastInset.current = inset;
    if (!w) return;

    // geometry in overlay space (plate origin at SIDE, OVER).
    // A 3D-printer gantry: a beam rises with the print edge; the arm rides the beam.
    const ox = SIDE;
    const oy = OVER;
    const edge = oy + h * (1 - pr);
    const t = Math.min(20, Math.max(12, w * 0.022));
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

    // for the character: a plate being printed is something to watch (and to duck when its arm swings past)
    setAttr(outer.current, 'data-printing', printing ? '1' : null);
    setAttr(outer.current, 'data-arm', printing ? `${(base.x - SIDE).toFixed(0)} ${(base.y - OVER).toFixed(0)} ${(tip.x - SIDE).toFixed(0)} ${(tip.y - OVER).toFixed(0)}` : null);
    setAttr(lines.current, 'display', printing ? null : 'none');
    if (printing) {
      setAttr(edgeLine.current, 'y1', edge);
      setAttr(edgeLine.current, 'y2', edge);
      setAttr(hotLine.current, 'x1', printTip.x - 36);
      setAttr(hotLine.current, 'x2', printTip.x + 36);
      setAttr(hotLine.current, 'y1', edge);
      setAttr(hotLine.current, 'y2', edge);
    }
    setAttr(postL.current, 'y2', beamY + t * 0.6);
    setAttr(postR.current, 'y2', beamY + t * 0.6);
    armRef.current?.set({ base, tip, bend: dir === 1 ? -1 : 1, hot: printing ? 1 : 0, railY: beamY });
  };

  // every render (mount, resize): re-measure and redraw before paint
  useLayoutEffect(() => {
    measure();
    draw.current();
  });

  useEffect(() => {
    if (reduce) return;
    const loop = ticker.loop(() => {
      draw.current();
      return false; // one frame per wake: scroll/layout events are coalesced
    });
    const wake = () => loop.wake();
    const offLayout = onLayout(() => {
      measure();
      wake();
    });
    window.addEventListener('scroll', wake, { passive: true });
    return () => {
      loop.stop();
      offLayout();
      window.removeEventListener('scroll', wake);
    };
  }, [reduce]);

  const t = Math.min(20, Math.max(12, w * 0.022));
  const l = Math.max(120, OVER * 0.6);
  const ox = SIDE;

  // torn-paper cut-out: seeded per plate, regenerated only when the plate resizes
  const autoId = useId();
  const s0 = seed ?? hashSeed(id ?? `${autoId}-${side}-${tone}`);
  const layout = useMemo(() => cutLayout(s0), [s0]);
  const cut = useMemo(() => {
    const path = (sd: number) => (w > 0 && h > 0 ? `path("${tornPath(w, h, sd)}")` : undefined);
    return { face: path(s0), layers: layout.layers.map((ly) => path(ly.seed)) };
  }, [w, h, s0, layout]);
  const layerTone = tone === 'paper' ? ['bg-gray-600', 'bg-ink'] : ['bg-gray-700', 'bg-gray-400'];

  return (
    <div
      ref={outer}
      id={id}
      className={`relative ${className}`}
      data-perch={perch}
      onFocus={() => {
        forced.current = true;
        draw.current();
      }}
    >
      <div ref={ref} className="plate-shadow plate-alive" style={{ '--plate-rot': `${layout.rot.toFixed(2)}deg` } as CSSProperties}>
        <div ref={clip} className="relative isolate">
          {layout.layers.map((ly, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`plate-layer absolute inset-0 ${layerTone[i]} ${cut.layers[i] ? '' : 'plate-cut'}`}
              style={{ clipPath: cut.layers[i], zIndex: -1 - i, transform: `translate(${ly.dx.toFixed(1)}px, ${ly.dy.toFixed(1)}px) rotate(${ly.rot.toFixed(2)}deg)` }}
            />
          ))}
          <div
            className={`relative ${cut.face ? '' : 'plate-cut'} ${tone === 'paper' ? 'plate-paper text-on-paper' : 'plate-ink text-on-surface'} px-7 py-10 md:px-12 md:py-14`}
            style={{ clipPath: cut.face }}
          >
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
          <g ref={lines}>
            <line ref={edgeLine} x1={ox} x2={ox + w} className="stroke-gray-600" strokeWidth={1} strokeDasharray="2 5" />
            <line ref={hotLine} className="stroke-accent" strokeWidth={1} opacity={0.8} />
          </g>
          {/* gantry posts */}
          <g className="stroke-ink" filter="url(#ink)">
            <line ref={postL} x1={ox - 14} x2={ox - 14} y1={0} strokeWidth={t * 0.3} />
            <line ref={postR} x1={ox + w + 14} x2={ox + w + 14} y1={0} strokeWidth={t * 0.3} />
          </g>
          <MechArm ref={armRef} l1={l} l2={l} t={t} toolLen={t * 3.2} rail={{ x1: ox - 22, x2: ox + w + 22 }} />
        </svg>
      )}
    </div>
  );
}
