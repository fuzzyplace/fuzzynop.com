import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { published as defaultData, type CircuitData } from '../content/links';
import { layoutTree, litPath, modeFor, type LeafNode, type TreeLayout } from './circuitLayout';

/**
 * The circuit tree (docs/NARRATIVE.md): one root node sends circuit traces out to a hex per link,
 * in three headed groups (Connect / Work / Play). Layout is generated from src/content/links.ts by
 * `layoutTree` at the wrap's measured width: three columns when wide, a stack when narrow (measured
 * before paint, so no flash). Each node is a full-width 44px row. Hover or focus on a
 * node lights its path back to the root (ink, heavier stroke, a dash travelling along it; static
 * under reduced motion). No orange on traces: orange appears only as the focus ring.
 *
 * Semantics: <nav> with nested lists, one per group, each labelled by its heading; the SVG traces and
 * the root mark are aria-hidden.
 */

function hexPoints(r: number, cx = 0, cy = 0) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function Traces({ layout, lit }: { layout: TreeLayout; lit: Set<string> }) {
  // lit traces last so they sit on top of shared trunk segments
  const ordered = [...layout.traces].sort((a, b) => Number(lit.has(a.id)) - Number(lit.has(b.id)));
  const litPts = new Set(layout.traces.filter((t) => lit.has(t.id)).flatMap((t) => t.points.map((p) => `${p.x},${p.y}`)));
  const on = (p: { x: number; y: number }) => litPts.has(`${p.x},${p.y}`);
  return (
    <svg className="circuit-svg" data-asm="unit" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false">
      <g fill="none">
        {ordered.map((t) => (
          <path key={t.id} d={t.d} className={lit.has(t.id) ? 'trace is-lit' : 'trace'} />
        ))}
        {ordered
          .filter((t) => lit.has(t.id))
          .map((t) => (
            <path key={`p-${t.id}`} d={t.d} className="trace-pulse" />
          ))}
      </g>
      {layout.pads.map((p) => (
        <circle key={`pad-${p.x},${p.y}`} cx={p.x} cy={p.y} r={2.5} className={on(p) ? 'pad is-lit' : 'pad'} />
      ))}
      {layout.vias.map((p) => (
        <circle key={`via-${p.x},${p.y}`} cx={p.x} cy={p.y} r={3.5} className={on(p) ? 'via is-lit' : 'via'} />
      ))}
    </svg>
  );
}

type Pos = CSSProperties & Record<'--x' | '--y' | '--w', number>;

function LeafHex({ live, r }: { live: boolean; r: number }) {
  const w = r * 2 + 4;
  const h = Math.ceil(r * Math.sqrt(3)) + 4;
  return (
    <svg className="circuit-hex" width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden="true" focusable="false">
      <polygon points={hexPoints(r)} className={live ? 'circuit-hex-shell' : 'circuit-hex-shell circuit-hex-shell--soon'} />
      {live && <polygon points={hexPoints(r * 0.42)} className="circuit-hex-core" />}
    </svg>
  );
}

/** Width before the first measurement (and without layout, e.g. tests): a phone-width stack. */
const FALLBACK_W = 320;

export function CircuitTree({ data = defaultData, label, className = '' }: { data?: CircuitData; label: string; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth((cur) => (cur === w ? cur : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const t = useMemo(() => layoutTree(data, modeFor(width), width), [data, width]);
  const [active, setActive] = useState<string | null>(null);
  const uid = useId();

  const pos = (n: LeafNode): Pos => ({ '--x': n.x, '--y': n.y, '--w': n.w });
  const enter = (id: string) => () => setActive(id);
  const leave = (id: string) => () => setActive((cur) => (cur === id ? null : cur));

  const node = (n: LeafNode) => {
    const handlers = { onPointerEnter: enter(n.id), onPointerLeave: leave(n.id), onFocus: enter(n.id), onBlur: leave(n.id) };
    // a probe target: the character tugs a node and it jolts toward him (global.css, `poke-tug`)
    const probe = { 'data-poke': 'tug', 'data-poke-reach': 'side', 'data-asm': 'unit' }; // data-asm: an arm places each node (PrintedPlate)
    const lit = active === n.id ? ' is-lit' : '';
    return (
      <li key={n.id}>
        {n.live ? (
          <a href={n.link.href!} target="_blank" rel="noopener noreferrer" className={`circuit-node${lit}`} style={pos(n)} data-poi="node" {...probe} {...handlers}>
            <LeafHex live r={t.hexR} />
            <span className="type-title-small circuit-node-label text-on-paper">
              {n.link.label}
              <span aria-hidden="true"> ↗</span>
            </span>
          </a>
        ) : (
          <span className={`circuit-node circuit-node--soon${lit}`} style={pos(n)} {...probe} {...handlers}>
            <LeafHex live={false} r={t.hexR} />
            <span className="circuit-node-label text-on-paper-variant">
              <span className="type-title-small">{n.link.label}</span> <span className="type-label-small" aria-hidden="true">{data.statusLabel.soon}</span>
              <span className="sr-only">{data.statusLabel.soonSr}</span>
            </span>
          </span>
        )}
      </li>
    );
  };

  const rootPos = { '--x': t.root.x, '--y': t.root.y, '--r': t.root.r } as CSSProperties;

  return (
    <div ref={wrap} className={`circuit-wrap ${className}`} data-asm-cluster="">
      <div className={`circuit circuit--${t.mode}`} style={{ height: t.height }}>
        <Traces layout={t} lit={litPath(t, active)} />

        {/* the root mark: decoration (the handle is already in the header) */}
        <div className={`circuit-root${active ? ' is-lit' : ''}`} style={rootPos} aria-hidden="true" data-asm="unit">
          <svg viewBox="-30 -26 60 52" className="circuit-root-hex" focusable="false">
            <polygon points={hexPoints(28)} className="circuit-root-shell" />
            <polygon points={hexPoints(23)} className="circuit-root-rim" />
          </svg>
          <span className="type-label-small circuit-root-label">{data.root.label}</span>
        </div>

        <nav aria-label={label} className="circuit-nav">
          <ul className="circuit-list">
            {t.groups.map((g) => {
              const id = `${uid}-${g.branch}`;
              const lp = { '--x': g.labelAt.x, '--y': g.labelAt.y } as CSSProperties;
              return (
                <li key={g.branch}>
                  <span id={id} className="circuit-branch type-label-medium text-on-paper-variant" style={lp} data-asm="unit">
                    {g.label}
                  </span>
                  <ul aria-labelledby={id} className="circuit-list">
                    {g.leaves.map(node)}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
