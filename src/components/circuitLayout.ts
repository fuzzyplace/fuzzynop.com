/**
 * Pure layout for the circuit tree (src/components/CircuitTree.tsx).
 * links → node positions + trace geometry, in px, for two orientations:
 *  - horizontal (wide plates): depth runs left → right. Root hex at left middle; a trunk splits to one
 *    junction per branch; each junction fans out to a column of leaf hexes, labels to their right.
 *  - vertical (narrow / 375px): depth runs top → down. Root hex top-left; a spine runs down the left,
 *    turns in to each branch's junction; leaves are rows hanging off the branch bus.
 * Traces are orthogonal with 45° chamfered bends. Deterministic: same input → same output.
 */
import type { Branch, CircuitData, CircuitLink } from '../content/links';

export type Pt = { x: number; y: number };
export type Orientation = 'horizontal' | 'vertical';

export type LeafNode = { id: string; link: CircuitLink; live: boolean; x: number; y: number; branch: Branch; path: string[] };
export type Group = { branch: Branch; label: string | null; junction: Pt; labelAt: Pt | null; leaves: LeafNode[] };
export type Trace = { id: string; branch: Branch; points: Pt[]; d: string };
export type TreeLayout = {
  orientation: Orientation;
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
  row: 52, // leaf pitch (tap target 48 inside)
  gap: 16, // extra space between branches
  chamfer: 10, // 45° bend size
  hexR: 14, // leaf hex circumradius
  h: { rootR: 28, rootX: 30, splitX: 92, junctionX: 176, busX: 206, leafX: 262, width: 500 },
  v: { rootR: 20, spineX: 20, busX: 40, leafX: 70, labelRow: 36 },
} as const;

const BRANCH_ORDER = (data: Pick<CircuitData, 'branches'>, b: Branch) => (b === 'root' ? 0 : data.branches[b].order);

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

export function layoutTree(data: Pick<CircuitData, 'branches' | 'links'>, orientation: Orientation): TreeLayout {
  const groups = groupLinks(data);
  const label = (b: Branch) => (b === 'root' ? null : data.branches[b].label);
  const hexR = G.hexR;
  const out: Group[] = [];
  const leaves: LeafNode[] = [];
  const traces: Trace[] = [];
  const vias: Pt[] = [];
  const pads: Pt[] = [];
  const leaf = (l: CircuitLink, x: number, y: number): LeafNode => ({
    id: l.id,
    link: l,
    live: isLive(l),
    x,
    y,
    branch: l.branch,
    path: [leafId(l.id), trunkId(l.branch)],
  });

  if (orientation === 'horizontal') {
    const H = G.h;
    let y = 0;
    const placed = groups.map((g, gi) => {
      if (gi) y += G.gap;
      const ls = g.links.map((l) => {
        const n = leaf(l, H.leafX, y + G.row / 2);
        y += G.row;
        return n;
      });
      return { g, ls };
    });
    const height = Math.max(y, H.rootR * 2 + 8);
    const root = { x: H.rootX, y: r1(height / 2), r: H.rootR };
    const from = { x: root.x + root.r, y: root.y };
    if (placed.length > 1) vias.push({ x: H.splitX, y: root.y });
    for (const { g, ls } of placed) {
      const jy = r1((ls[0].y + ls[ls.length - 1].y) / 2);
      const junction = { x: H.junctionX, y: jy };
      traces.push(trace(trunkId(g.branch), g.branch, elbowH(from, junction, H.splitX + G.chamfer)));
      vias.push(junction);
      for (const n of ls) {
        const end = { x: n.x - hexR - 4, y: n.y };
        traces.push(trace(leafId(n.id), g.branch, elbowH(junction, end, H.busX)));
        pads.push(end);
      }
      const lb = label(g.branch);
      out.push({ branch: g.branch, label: lb, junction, labelAt: lb ? { x: H.junctionX - 8, y: jy - 10 } : null, leaves: ls });
      leaves.push(...ls);
    }
    return { orientation, width: H.width, height, root, hexR, groups: out, leaves, traces, vias, pads };
  }

  // vertical
  const V = G.v;
  const root = { x: V.spineX, y: V.rootR, r: V.rootR };
  const from = { x: root.x, y: root.y + root.r * Math.sin(Math.PI / 3) };
  let y = root.y * 2 + 12;
  for (const g of groups) {
    const lb = label(g.branch);
    let junction: Pt;
    if (lb) {
      junction = { x: V.busX, y: y + V.labelRow / 2 };
      y += V.labelRow;
    } else {
      junction = { x: V.busX, y: y + 4 };
      y += 8;
    }
    traces.push(trace(trunkId(g.branch), g.branch, elbowV(from, junction, junction.y - G.chamfer)));
    vias.push(junction);
    const ls = g.links.map((l) => {
      const n = leaf(l, V.leafX, y + G.row / 2);
      y += G.row;
      const end = { x: n.x - hexR - 4, y: n.y };
      traces.push(trace(leafId(n.id), g.branch, cornerVH(junction, end)));
      pads.push(end);
      return n;
    });
    out.push({ branch: g.branch, label: lb, junction, labelAt: lb ? { x: V.busX + 12, y: junction.y } : null, leaves: ls });
    leaves.push(...ls);
    y += G.gap;
  }
  const width = V.leafX + hexR; // nodes' labels extend to the container's right edge
  return { orientation, width, height: y - G.gap, root, hexR, groups: out, leaves, traces, vias, pads };
}

/** Trace ids lit when `id` (a leaf) is active: its own trace and its branch's trunk back to the root. */
export const litPath = (layout: TreeLayout, id: string | null): Set<string> =>
  new Set(id ? (layout.leaves.find((l) => l.id === id)?.path ?? []) : []);
