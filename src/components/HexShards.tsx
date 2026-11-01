import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * Pieced-together hexagons (HANDOFF §3.4).
 * Each hex is six triangular shards cut from the centre. When a cell scrolls into view an
 * IntersectionObserver flips `data-assembled` on its <li>; CSS transitions (staggered by
 * index + shard) fly the shards in and snap them together. No React state per frame.
 * Reduced motion: CSS renders every cell already assembled.
 *
 * The honeycomb is presentation only — the markup is a plain <ul> of links / items.
 */

export type HexCell = { label: string; href?: string | null; meta?: string };
type Variant = 'link' | 'static';

// flat-top hexagon, circumradius 100, centred (viewBox -100 -87 200 174)
const R = 100;
const V = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 3) * k;
  return [R * Math.cos(a), R * Math.sin(a)] as const;
});
const HEX = V.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// small deterministic PRNG so shard scatter is stable per label
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shards(label: string) {
  const r = rng(hash(label));
  return V.map(([x1, y1], k) => {
    const [x2, y2] = V[(k + 1) % 6];
    const mid = (Math.PI / 3) * k + Math.PI / 6 + (r() - 0.5) * 0.6;
    const d = 70 + r() * 70;
    return {
      points: `0,0 ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
      style: {
        '--dx': `${(Math.cos(mid) * d).toFixed(1)}px`,
        '--dy': `${(Math.sin(mid) * d).toFixed(1)}px`,
        '--rot': `${((r() - 0.5) * 140).toFixed(0)}deg`,
        '--j': k,
      } as CSSProperties,
    };
  });
}

function Face({ label, kind }: { label: string; kind: 'ink' | 'hollow' }) {
  return (
    <svg className="hex-face" viewBox="-108 -94 216 188" aria-hidden="true" focusable="false">
      {/* invisible hit area: the hexagon, not the bounding box, takes the pointer */}
      <polygon className="hex-hit" points={HEX} />
      {shards(label).map((s, k) => (
        <polygon key={k} className={`hex-shard hex-shard--${kind}`} points={s.points} style={s.style} />
      ))}
      {kind === 'hollow' && <polygon className="hex-dash" points={HEX} />}
      <polygon className="hex-edge" points={HEX} />
    </svg>
  );
}

/** Honeycomb layout positions (in units of hex width / height). */
function place(i: number, cols: number) {
  const c = i % cols;
  const r = Math.floor(i / cols);
  return { x: c * 0.75, y: r + (c % 2) * 0.5 };
}
function extent(n: number, cols: number) {
  let w = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const p = place(i, cols);
    w = Math.max(w, p.x + 1);
    h = Math.max(h, p.y + 1);
  }
  return { w, h };
}

type Props = {
  items: HexCell[];
  variant: Variant;
  /** columns at lg (≥ 840px) and below */
  cols: number;
  colsSm?: number;
  label: string;
  className?: string;
};

export function Honeycomb({ items, variant, cols, colsSm = 2, label, className = '' }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const cells = Array.from(el.querySelectorAll<HTMLElement>(':scope > li'));
    const done = (c: HTMLElement) => c.setAttribute('data-assembled', '1');
    if (reduce || typeof IntersectionObserver === 'undefined') {
      cells.forEach(done);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          done(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.35 },
    );
    cells.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [reduce]);

  const lg = extent(items.length, cols);
  const sm = extent(items.length, colsSm);
  const style = { '--cw': lg.w, '--ch': lg.h, '--cw-s': sm.w, '--ch-s': sm.h } as CSSProperties;

  return (
    <ul ref={list} className={`honeycomb ${className}`} style={style} aria-label={label}>
      {items.map((it, i) => {
        const a = place(i, cols);
        const b = place(i, colsSm);
        const pos = { '--x': a.x, '--y': a.y, '--x-s': b.x, '--y-s': b.y, '--i': i } as CSSProperties;
        const isLink = variant === 'link' && !!it.href;
        const isPlaceholder = variant === 'link' && !it.href;
        return (
          <li key={it.label} className="hex-cell2" style={pos}>
            {isLink ? (
              <a href={it.href!} target="_blank" rel="noopener noreferrer" className="hex-link">
                <Face label={it.label} kind="ink" />
                <span className="hex-label text-on-surface">
                  <span className="type-title-small">
                    {it.label}
                    <span aria-hidden="true"> ↗</span>
                  </span>
                  {it.meta && <span className="type-label-small mt-1 block text-on-surface-variant">{it.meta}</span>}
                </span>
              </a>
            ) : isPlaceholder ? (
              <span role="link" aria-disabled="true" className="hex-link hex-link--placeholder">
                <Face label={it.label} kind="hollow" />
                <span className="hex-label text-on-paper-variant">
                  <span className="type-title-small">{it.label}</span>
                  {it.meta && <span className="type-label-small mt-1 block">{it.meta}</span>}
                </span>
              </span>
            ) : (
              <div className="hex-static">
                <Face label={it.label} kind="ink" />
                <span className="hex-label text-on-surface">
                  <span className="type-title-small">{it.label}</span>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
