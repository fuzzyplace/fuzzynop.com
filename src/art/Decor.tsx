import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { clamp, hexPoints, rng } from './geometry';
import { useReducedMotion } from './reducedMotion';
import { docTop, measure, onLayout, ticker, view } from './ticker';

/** Tone = depth. far: gray + blur (fog swallows it). mid: near-black. near: pure ink, rough edge. */
type Tone = 'far' | 'mid' | 'near';
const toneClass: Record<Tone, string> = { far: 'fill-silhouette-far stroke-silhouette-far', mid: 'fill-silhouette-mid stroke-silhouette-mid', near: 'fill-ink stroke-ink' };
const toneFilter: Record<Tone, string> = { far: 'url(#far)', mid: 'url(#ink)', near: 'url(#ink-heavy)' };

/**
 * Parallax: every <Depth> on the page, moved by one ticker step per scroll frame.
 * Geometry is cached and measured only in a frame's read phase (mount, layout changes), never
 * during a React commit, so mounting the page doesn't force a synchronous layout. The step
 * takes the frame's scroll position from `view()` and writes a transform only when it changes,
 * so off-screen layers (progress pinned at 0 or 1) cost nothing.
 */
type Layer = { el: HTMLDivElement; depth: number; top: number; height: number; vh: number; y: string };
const layers = new Set<Layer>();
const shift = (ly: Layer, sy: number) => {
  // scroll progress from the layer's top at the viewport bottom to its bottom at the viewport top
  const p = clamp((sy - (ly.top - ly.vh)) / Math.max(1, ly.height + ly.vh));
  return ly.depth * 140 * (1 - 2 * p);
};
const measureLayer = (ly: Layer) => {
  ly.top = docTop(ly.el);
  ly.height = ly.el.clientHeight;
  ly.vh = document.documentElement.clientHeight;
};
const parallax = ticker.loop(() => {
  const { sy } = view();
  layers.forEach((ly) => {
    if (Number.isNaN(ly.top)) return; // not measured yet
    const y = `translateY(${shift(ly, sy).toFixed(3)}px)`;
    if (y !== ly.y) ly.el.style.transform = ly.y = y;
  });
  return false; // one frame per scroll / layout wake
});
let parallaxOn = false;
const startParallax = () => {
  if (parallaxOn) return;
  parallaxOn = true;
  window.addEventListener('scroll', () => parallax.wake(), { passive: true });
  onLayout(() => {
    layers.forEach(measureLayer);
    parallax.wake();
  });
};

/** Parallax wrapper: depth > 0 moves slower than the page (further away). */
export function Depth({ depth, className = '', children }: { depth: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.style.transform = 'none';
      return;
    }
    const ly: Layer = { el, depth, top: NaN, height: 0, vh: 0, y: '' };
    layers.add(ly);
    startParallax();
    measure(() => {
      if (!layers.has(ly)) return;
      measureLayer(ly);
      parallax.wake(); // placed in this same frame, before it paints
    });
    return () => {
      layers.delete(ly);
    };
  }, [depth, reduce]);
  return (
    <div ref={ref} className={`pointer-events-none absolute ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

/** Broken honeycomb scaffold. */
export function HexLattice({ cols, rows, r, tone = 'far', seed = 1 }: { cols: number; rows: number; r: number; tone?: Tone; seed?: number }) {
  const rand = rng(seed);
  const h = Math.sqrt(3) * r;
  const W = cols * 1.5 * r + r;
  const H = rows * h + h;
  const cells: ReactNode[] = [];
  for (let c = 0; c < cols; c++)
    for (let row = 0; row < rows; row++) {
      const v = rand();
      if (v < 0.22) continue; // broken
      const cx = r + c * 1.5 * r;
      const cy = h / 2 + row * h + (c % 2 ? h / 2 : 0);
      cells.push(
        <polygon
          key={`${c}-${row}`}
          points={hexPoints(cx, cy, r * 0.92)}
          className={toneClass[tone]}
          fillOpacity={v > 0.86 ? 1 : 0}
          strokeWidth={r * 0.14}
        />,
      );
    }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-none overflow-visible">
      <g filter={toneFilter[tone]}>{cells}</g>
    </svg>
  );
}

/** A long jointed spider leg hanging into the scene, swaying slowly. */
export function SpiderLeg({ length = 520, t = 14, tone = 'mid', flip = false, delay = 0 }: { length?: number; t?: number; tone?: Tone; flip?: boolean; delay?: number }) {
  const s = flip ? -1 : 1;
  const a = length * 0.42;
  const b = length * 0.36;
  const c = length * 0.3;
  const k1 = { x: s * a * 0.55, y: a * 0.83 };
  const k2 = { x: k1.x - s * b * 0.2, y: k1.y + b * 0.98 };
  const tip = { x: k2.x - s * c * 0.45, y: k2.y + c * 0.89 };
  const W = length;
  const seg = (p: { x: number; y: number }, q: { x: number; y: number }, w0: number, w1: number) => {
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    return `M${p.x + nx * w0} ${p.y + ny * w0} L${q.x + nx * w1} ${q.y + ny * w1} L${q.x - nx * w1} ${q.y - ny * w1} L${p.x - nx * w0} ${p.y - ny * w0} Z`;
  };
  return (
    <svg width={W} height={length * 1.1} viewBox={`${-W / 2} 0 ${W} ${length * 1.1}`} className="max-w-none overflow-visible">
      <g className={`sway ${toneClass[tone]}`} style={{ animationDelay: `${delay}s` }} filter={toneFilter[tone]}>
        <path d={seg({ x: 0, y: 0 }, k1, t * 0.6, t * 0.45)} />
        <path d={seg(k1, k2, t * 0.42, t * 0.3)} />
        <path d={seg(k2, tip, t * 0.28, 0.6)} />
        <polygon points={hexPoints(k1.x, k1.y, t * 0.62)} />
        <polygon points={hexPoints(k2.x, k2.y, t * 0.46)} />
        {[0.3, 0.55, 0.8].map((f) => {
          const x = k1.x + (k2.x - k1.x) * f;
          const y = k1.y + (k2.y - k1.y) * f;
          return <path key={f} d={`M${x} ${y} l${s * t * 0.9} ${-t * 0.35} l${-s * t * 0.5} ${t * 0.45} Z`} />;
        })}
      </g>
    </svg>
  );
}

/** Ink splatter: a blot, satellites, and drips. [data-poi]: the character may wander over to inspect it. */
export function Splatter({ size = 160, seed = 3, tone = 'near' }: { size?: number; seed?: number; tone?: Tone }) {
  const rand = rng(seed);
  const c = size / 2;
  const blobs: ReactNode[] = [];
  const core = size * 0.16;
  blobs.push(<circle key="core" cx={c} cy={c} r={core} />);
  for (let i = 0; i < 26; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = core * (0.6 + rand() * 2.4);
    const r = Math.max(0.8, core * (0.5 - (dist / (core * 3)) * 0.45) * (0.4 + rand()));
    blobs.push(<circle key={i} cx={c + Math.cos(ang) * dist} cy={c + Math.sin(ang) * dist} r={r} />);
  }
  for (let i = 0; i < 3; i++) {
    const x = c + (rand() - 0.5) * core * 1.4;
    const len = core * (1 + rand() * 2.2);
    blobs.push(<path key={`d${i}`} d={`M${x - 2} ${c} L${x - 1} ${c + len} Q${x} ${c + len + 4} ${x + 1} ${c + len} L${x + 2} ${c} Z`} />);
  }
  return (
    <svg width={size} height={size * 1.3} viewBox={`0 0 ${size} ${size * 1.3}`} className="max-w-none overflow-visible" data-poi="splat">
      <g className={toneClass[tone]} filter={toneFilter[tone]}>{blobs}</g>
    </svg>
  );
}

/** Ground strip: torn horizon, grass, roots, a hex bolt or two half-buried. */
export function Ground({ width, height = 90, seed = 5 }: { width: number; height?: number; seed?: number }) {
  const rand = rng(seed);
  let d = `M0 ${height}`;
  const n = Math.max(8, Math.round(width / 40));
  for (let i = 0; i <= n; i++) d += ` L${(i / n) * width} ${height * 0.35 + (rand() - 0.5) * 14}`;
  d += ` L${width} ${height} Z`;
  const blades: ReactNode[] = [];
  for (let i = 0; i < width / 9; i++) {
    const x = rand() * width;
    const h = 8 + rand() * 26;
    const lean = (rand() - 0.5) * 10;
    blades.push(<path key={i} d={`M${x - 1.4} ${height * 0.4} Q${x + lean * 0.5} ${height * 0.4 - h * 0.6} ${x + lean} ${height * 0.4 - h} Q${x + lean * 0.4 + 0.6} ${height * 0.4 - h * 0.5} ${x + 1.4} ${height * 0.4} Z`} />);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g className="fill-ink" filter="url(#ink)">
        <path d={d} />
        {blades}
        <polygon points={hexPoints(width * 0.22, height * 0.42, 9)} />
        <polygon points={hexPoints(width * 0.81, height * 0.4, 6)} />
      </g>
    </svg>
  );
}

/**
 * A hex stepping-stone hung on two wires, like a paper-cut set piece. Its top edge is a perch
 * ([data-ledge]): the character can jump, climb and fall between it and other perches, but the
 * claw never picks it as the reading-line perch. When he hops up and taps it from below, the
 * Puppeteer toggles [data-swing] (a / b restarts the CSS swing) and it sways on its wires.
 */
export function Ledge({ width = 84, height = 26, style }: { width?: number; height?: number; style?: CSSProperties }) {
  const i = height / 2;
  const pts = `0,${i} ${i},0 ${width - i},0 ${width},${i} ${width - i},${height} ${i},${height}`;
  return (
    <div className="pointer-events-none absolute z-10" style={{ width, height, ...style }} data-perch="0.5" data-perch-span="8" data-ledge="" aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none overflow-visible">
        <path d={`M${i + 4} 0 L${i + 10} -2000 M${width - i - 4} 0 L${width - i - 12} -2000`} className="stroke-silhouette-mid" strokeWidth="1.2" fill="none" />
        <polygon points={pts} className="fill-ink stroke-ink" filter="url(#ink)" />
        <polygon points={hexPoints(width / 2, height / 2, height * 0.22)} className="fill-silhouette-mid" />
      </svg>
    </div>
  );
}
