/**
 * Pure layout for the circuit tree (src/components/CircuitTree.tsx).
 * links → node positions + trace geometry, in px, for one of two modes at a measured width:
 *  - columns (wide plates): the root hex sits centred on top; short traces fan out from under it
 *    to a via at the top-left of each of three equal columns (Connect / Work / Play). The heading sits
 *    beside the via; a bus runs down the column's left edge and each leaf turns off it at 45°.
 *  - stack (narrow / 375px): root hex top-left; one trunk runs down the left, turning in to each
 *    group's via and heading; leaves are rows hanging off that group's bus.
 * Traces are orthogonal with 45° chamfered bends. Deterministic: same input → same output.
 */
import type { Branch, CircuitData, CircuitLink } from '../content/links';

export type Pt = { x: number; y: number };
export type Mode = 'columns' | 'stack';

/** w: the row's width from its left edge (x - G.slot), so the whole row is the target. */
export type LeafNode = { id: string; link: CircuitLink; live: boolean; x: number; y: number; w: number; branch: Branch; path: string[] };
export type Group = { branch: Branch; label: string; junction: Pt; labelAt: Pt; leaves: LeafNode[] };
export type Trace = { id: string; branch: Branch; points: Pt[]; d: string };
export type TreeLayout = {
  mode: Mode;
  width: number;
  height: number;
  root: Pt & { r: number };
  hexR: number;
  groups: Group[];
  leaves: LeafNode[]; // render / keyboard order: root branch, then work, then make
  traces: Trace[];
  vias: Pt[]; // drilled junctions
  pads: Pt[]; // solder pads where a trace meets a node
};

/** Geometry constants (px). Exported for tests and the component. */
export const G = {
  row: 44, // leaf pitch = tap target height
  slot: 22, // a node's left edge sits this far left of its hex centre
  gap: 16, // extra space between stacked groups
  chamfer: 10, // 45° bend size
  hexR: 13, // leaf hex circumradius
  minColumns: 540, // narrower than this → stack (every label still fits one line in a column)
  c: { rootR: 22, rootY: 24, fan: 32, gutter: 0, busIn: 8, leafIn: 33, headRow: 20 }, // no gutter: each column's bus inset is the gap
  s: { rootR: 20, spineX: 20, busX: 40, leafX: 64, labelRow: 36 },
} as const;

/** Columns when there is room for three readable columns, else a stack. */
export const modeFor = (width: number): Mode => (width >= G.minColumns ? 'columns' : 'stack');

const BRANCH_ORDER = (data: Pick<CircuitData, 'branches'>, b: Branch) => data.branches[b].order;

/** Visible links grouped by branch (root first, then by branch order), each sorted by order then id. */
export function groupLinks(data: Pick<CircuitData, 'branches' | 'links'>): { branch: Branch; links: CircuitLink[] }[] {
  const byBranch = new Map<Branch, CircuitLink[]>();
  for (const l of data.links) {
    if (l.status === 'hidden') continue;
    const list = byBranch.get(l.branch) ?? [];
    list.push(l);
    byBranch.set(l.branch, list);
  }
  return [...byBranch.entries()]
    .sort(([a], [b]) => BRANCH_ORDER(data, a) - BRANCH_ORDER(data, b))
    .map(([branch, links]) => ({ branch, links: [...links].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) }));
}

/** A link is clickable only when it is live and has a URL. */
export const isLive = (l: CircuitLink) => l.status === 'live' && !!l.href;

const r1 = (n: number) => Math.round(n * 10) / 10;
const toD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join(' ');
const dedupe = (pts: Pt[]) => pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);

/** Horizontal run, a vertical jog at column xb (45° chamfers), horizontal run on. */
export function elbowH(a: Pt, b: Pt, xb: number, c: number = G.chamfer): Pt[] {
  const dy = b.y - a.y;
  if (dy === 0) return [a, b];
  const s = Math.sign(dy);
  const k = Math.min(c, Math.abs(dy) / 2);
  return dedupe([a, { x: xb - k, y: a.y }, { x: xb, y: a.y + s * k }, { x: xb, y: b.y - s * k }, { x: xb + k, y: b.y }, b]);
}

/** Vertical run, a horizontal jog at row yb (45° chamfers), vertical run on. */
export function elbowV(a: Pt, b: Pt, yb: number, c: number = G.chamfer): Pt[] {
  const dx = b.x - a.x;
  if (dx === 0) return [a, b];
  const s = Math.sign(dx);
  const k = Math.min(c, Math.abs(dx) / 2);
  return dedupe([a, { x: a.x, y: yb - k }, { x: a.x + s * k, y: yb }, { x: b.x - s * k, y: yb }, { x: b.x, y: yb + k }, b]);
}

/** Vertical run then a single 45° corner into a horizontal run (a leaf off a vertical bus). */
function cornerVH(a: Pt, b: Pt, c: number = G.chamfer): Pt[] {
  const dy = b.y - a.y;
  if (dy === 0) return [a, b];
  const s = Math.sign(dy);
  const k = Math.min(c, Math.abs(dy), Math.abs(b.x - a.x));
  return dedupe([a, { x: a.x, y: b.y - s * k }, { x: a.x + Math.sign(b.x - a.x) * k, y: b.y }, b]);
}

const trace = (id: string, branch: Branch, points: Pt[]): Trace => ({ id, branch, points, d: toD(points) });
const trunkId = (b: Branch) => `trunk:${b}`;
const leafId = (id: string) => `leaf:${id}`;

export function layoutTree(data: Pick<CircuitData, 'branches' | 'links'>, mode: Mode, width: number): TreeLayout {
  const groups = groupLinks(data);
  const hexR = G.hexR;
  const out: Group[] = [];
  const leaves: LeafNode[] = [];
  const traces: Trace[] = [];
  const vias: Pt[] = [];
  const pads: Pt[] = [];
  const leaf = (l: CircuitLink, x: number, y: number, right: number): LeafNode => ({
    id: l.id,
    link: l,
    live: isLive(l),
    x,
    y,
    w: r1(right - (x - G.slot)),
    branch: l.branch,
    path: [leafId(l.id), trunkId(l.branch)],
  });
  /** a group's leaves as rows off a bus at junction.x, from `top` down; returns them and the y below */
  const rows = (g: { branch: Branch; links: CircuitLink[] }, junction: Pt, top: number, leafX: number, right: number) => {
    let y = top;
    const ls = g.links.map((l) => {
      const n = leaf(l, leafX, y + G.row / 2, right);
      y += G.row;
      const end = { x: n.x - hexR - 4, y: n.y };
      traces.push(trace(leafId(n.id), g.branch, cornerVH(junction, end)));
      pads.push(end);
      return n;
    });
    return { ls, y };
  };

  if (mode === 'columns') {
    const C = G.c;
    const n = Math.max(groups.length, 1);
    const colW = (width - C.gutter * (n - 1)) / n;
    const root = { x: r1(width / 2), y: C.rootY, r: C.rootR };
    const from = { x: root.x, y: r1(root.y + root.r * Math.sin(Math.PI / 3)) };
    const viaY = from.y + C.fan;
    let bottom = viaY;
    groups.forEach((g, i) => {
      const left = i * (colW + C.gutter);
      const junction = { x: r1(left + C.busIn), y: viaY };
      traces.push(trace(trunkId(g.branch), g.branch, elbowV(from, junction, from.y + C.fan / 2)));
      vias.push(junction);
      const { ls, y } = rows(g, junction, viaY + C.headRow, r1(left + C.leafIn), r1(left + colW));
      out.push({ branch: g.branch, label: data.branches[g.branch].label, junction, labelAt: { x: junction.x + 12, y: junction.y }, leaves: ls });
      leaves.push(...ls);
      bottom = Math.max(bottom, y);
    });
    return { mode, width, height: bottom + 4, root, hexR, groups: out, leaves, traces, vias, pads };
  }

  // stack
  const S = G.s;
  const root = { x: S.spineX, y: S.rootR, r: S.rootR };
  const from = { x: root.x, y: r1(root.y + root.r * Math.sin(Math.PI / 3)) };
  let y = root.y * 2 + 8;
  for (const g of groups) {
    const junction = { x: S.busX, y: y + S.labelRow / 2 };
    y += S.labelRow;
    traces.push(trace(trunkId(g.branch), g.branch, elbowV(from, junction, junction.y - G.chamfer)));
    vias.push(junction);
    const r = rows(g, junction, y, S.leafX, width);
    y = r.y;
    out.push({ branch: g.branch, label: data.branches[g.branch].label, junction, labelAt: { x: S.busX + 12, y: junction.y }, leaves: r.ls });
    leaves.push(...r.ls);
    y += G.gap;
  }
  return { mode, width, height: y - G.gap, root, hexR, groups: out, leaves, traces, vias, pads };
}

/** Trace ids lit when `id` (a leaf) is active: its own trace and its branch's trunk back to the root. */
export const litPath = (layout: TreeLayout, id: string | null): Set<string> =>
  new Set(id ? (layout.leaves.find((l) => l.id === id)?.path ?? []) : []);
