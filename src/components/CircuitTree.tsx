import { useId, useMemo, useState, type CSSProperties } from 'react';
import { circuit as defaultData, type CircuitData } from '../content/links';
import { layoutTree, litPath, type LeafNode, type TreeLayout } from './circuitLayout';

/**
 * The circuit tree (docs/NARRATIVE.md): one root node sends circuit traces out to a hex per link,
 * split into branches. Layout is generated from src/content/links.ts by `layoutTree`, once per
 * orientation; a container query picks horizontal (wide) or vertical (narrow). Hover or focus on a
 * node lights its path back to the root (ink, heavier stroke, a dash travelling along it; static
 * under reduced motion). No orange on traces: orange appears only as the focus ring.
 *
 * Semantics: <nav> with nested lists by branch; the SVG traces and the root mark are aria-hidden.
 */

function hexPoints(r: number, cx = 0, cy = 0) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function Traces({ layout, lit, className }: { layout: TreeLayout; lit: Set<string>; className: string }) {
  // lit traces last so they sit on top of shared trunk segments
  const ordered = [...layout.traces].sort((a, b) => Number(lit.has(a.id)) - Number(lit.has(b.id)));
  const litPts = new Set(layout.traces.filter((t) => lit.has(t.id)).flatMap((t) => t.points.map((p) => `${p.x},${p.y}`)));
  const on = (p: { x: number; y: number }) => litPts.has(`${p.x},${p.y}`);
  return (
    <svg className={`circuit-svg ${className}`} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false">
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

type Pos = CSSProperties & Record<'--hx' | '--hy' | '--vx' | '--vy', number>;

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

export function CircuitTree({ data = defaultData, label, className = '' }: { data?: CircuitData; label: string; className?: string }) {
  const h = useMemo(() => layoutTree(data, 'horizontal'), [data]);
  const v = useMemo(() => layoutTree(data, 'vertical'), [data]);
  const [active, setActive] = useState<string | null>(null);
  const uid = useId();

  const pos = (id: string): Pos => {
    const a = h.leaves.find((l) => l.id === id)!;
    const b = v.leaves.find((l) => l.id === id)!;
    return { '--hx': a.x, '--hy': a.y, '--vx': b.x, '--vy': b.y };
  };
  const enter = (id: string) => () => setActive(id);
  const leave = (id: string) => () => setActive((cur) => (cur === id ? null : cur));

  const node = (n: LeafNode) => {
    const handlers = { onPointerEnter: enter(n.id), onPointerLeave: leave(n.id), onFocus: enter(n.id), onBlur: leave(n.id) };
    const lit = active === n.id ? ' is-lit' : '';
    return (
      <li key={n.id}>
        {n.live ? (
          <a href={n.link.href!} target="_blank" rel="noopener noreferrer" className={`circuit-node${lit}`} style={pos(n.id)} data-poi="node" {...handlers}>
            <LeafHex live r={h.hexR} />
            <span className="type-title-small circuit-node-label text-on-paper">
              {n.link.label}
              <span aria-hidden="true"> ↗</span>
            </span>
          </a>
        ) : (
          <span className={`circuit-node circuit-node--soon${lit}`} style={pos(n.id)} {...handlers}>
            <LeafHex live={false} r={h.hexR} />
            <span className="circuit-node-label text-on-paper-variant">
              <span className="type-title-small">{n.link.label}</span> <span className="type-label-small" aria-hidden="true">{data.statusLabel.soon}</span>
            </span>
          </span>
        )}
      </li>
    );
  };

  const sizes = { '--h-w': h.width, '--h-h': h.height, '--v-h': v.height } as CSSProperties;
  const rootPos = { '--hx': h.root.x, '--hy': h.root.y, '--vx': v.root.x, '--vy': v.root.y, '--hr': h.root.r, '--vr': v.root.r } as CSSProperties;
  const lit = (l: TreeLayout) => litPath(l, active);

  return (
    <div className={`circuit-wrap ${className}`}>
      <div className="circuit" style={sizes}>
        <Traces layout={h} lit={lit(h)} className="circuit-svg--h" />
        <Traces layout={v} lit={lit(v)} className="circuit-svg--v" />

        {/* the root mark: decoration (the handle is already in the header) */}
        <div className={`circuit-root${active ? ' is-lit' : ''}`} style={rootPos} aria-hidden="true">
          <svg viewBox="-30 -26 60 52" className="circuit-root-hex" focusable="false">
            <polygon points={hexPoints(28)} className="circuit-root-shell" />
            <polygon points={hexPoints(23)} className="circuit-root-rim" />
          </svg>
          <span className="type-label-small circuit-root-label">{data.root.label}</span>
        </div>

        <nav aria-label={label} className="circuit-nav">
          <ul className="circuit-list">
            {h.groups.map((g) => {
              if (!g.label) return g.leaves.map(node);
              const vg = v.groups.find((x) => x.branch === g.branch)!;
              const id = `${uid}-${g.branch}`;
              const lp = { '--hx': g.labelAt!.x, '--hy': g.labelAt!.y, '--vx': vg.labelAt!.x, '--vy': vg.labelAt!.y } as CSSProperties;
              return (
                <li key={g.branch}>
                  <span id={id} className="circuit-branch type-label-medium text-on-paper-variant" style={lp}>
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
