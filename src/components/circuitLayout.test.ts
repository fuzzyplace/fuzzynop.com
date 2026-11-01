import { describe, expect, it } from 'vitest';
import { circuit, type CircuitData, type CircuitLink } from '../content/links';
import { G, elbowH, elbowV, groupLinks, layoutTree, litPath, type Pt } from './circuitLayout';

const L = (id: string, branch: CircuitLink['branch'], order: number, status: CircuitLink['status'] = 'live', href: string | null = `https://example.test/${id}`): CircuitLink => ({
  id,
  branch,
  label: id,
  href: status === 'live' ? href : null,
  status,
  order,
});
const data = (links: CircuitLink[]): Pick<CircuitData, 'branches' | 'links'> => ({ branches: circuit.branches, links });

/** every segment is horizontal, vertical, or exactly 45° */
const orthoOr45 = (pts: Pt[]) =>
  pts.slice(1).every((p, i) => {
    const dx = Math.abs(p.x - pts[i].x);
    const dy = Math.abs(p.y - pts[i].y);
    return dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6;
  });

describe('groupLinks', () => {
  it('drops hidden links, orders branches root → work → make, sorts by order then id', () => {
    const g = groupLinks(data([L('m2', 'make', 2), L('w1', 'work', 1), L('gone', 'work', 0, 'hidden'), L('m1b', 'make', 1), L('m1a', 'make', 1), L('r', 'root', 9, 'soon')]));
    expect(g.map((x) => x.branch)).toEqual(['root', 'work', 'make']);
    expect(g[1].links.map((l) => l.id)).toEqual(['w1']);
    expect(g[2].links.map((l) => l.id)).toEqual(['m1a', 'm1b', 'm2']);
  });

  it('omits a branch whose links are all hidden', () => {
    expect(groupLinks(data([L('a', 'work', 1), L('b', 'make', 1, 'hidden')])).map((x) => x.branch)).toEqual(['work']);
  });
});

describe('layoutTree', () => {
  for (const o of ['horizontal', 'vertical'] as const) {
    describe(o, () => {
      const t = layoutTree(circuit, o);

      it('renders every non-hidden link once, in keyboard order root → work → make', () => {
        const visible = circuit.links.filter((l) => l.status !== 'hidden');
        expect(t.leaves).toHaveLength(visible.length);
        const rank = { root: 0, work: 1, make: 2 } as const;
        const ranks = t.leaves.map((l) => rank[l.branch]);
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      });

      it('one trunk per branch plus one trace per leaf, all orthogonal / 45°', () => {
        expect(t.traces).toHaveLength(t.groups.length + t.leaves.length);
        for (const tr of t.traces) {
          expect(orthoOr45(tr.points), tr.id).toBe(true);
          expect(tr.d.startsWith('M')).toBe(true);
        }
      });

      it('leaves never overlap and sit inside the box', () => {
        const ys = t.leaves.map((l) => l.y);
        const xs = new Set(t.leaves.map((l) => l.x));
        expect(xs.size).toBe(1); // one column
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(G.row);
        for (const l of t.leaves) {
          expect(l.y - 24).toBeGreaterThanOrEqual(0);
          expect(l.y + 24).toBeLessThanOrEqual(t.height);
        }
      });

      it('each leaf trace ends on a pad just before its hex, and lights back to the root', () => {
        for (const l of t.leaves) {
          const tr = t.traces.find((x) => x.id === `leaf:${l.id}`)!;
          const end = tr.points[tr.points.length - 1];
          expect(end).toEqual({ x: l.x - t.hexR - 4, y: l.y });
          expect(t.pads).toContainEqual(end);
          const trunk = t.traces.find((x) => x.id === `trunk:${l.branch}`)!;
          expect(trunk.points[trunk.points.length - 1]).toEqual(tr.points[0]); // trunk meets the leaf trace at the junction
          expect([...litPath(t, l.id)].sort()).toEqual([`leaf:${l.id}`, `trunk:${l.branch}`].sort());
        }
        expect(litPath(t, null).size).toBe(0);
      });

      it('labels the work and make branches only', () => {
        expect(t.groups.map((g) => g.label)).toEqual([null, 'Work', 'Make']);
      });

      it('is stable: same input, same output', () => {
        expect(layoutTree(structuredClone(circuit), o)).toEqual(t);
      });
    });
  }

  it('adding one link re-lays out: one more leaf and trace, the tree grows by one row', () => {
    const before = layoutTree(circuit, 'vertical');
    const after = layoutTree({ ...circuit, links: [...circuit.links, L('new', 'work', 3)] }, 'vertical');
    expect(after.leaves).toHaveLength(before.leaves.length + 1);
    expect(after.traces).toHaveLength(before.traces.length + 1);
    expect(after.height - before.height).toBe(G.row);
    expect(after.leaves.findIndex((l) => l.id === 'new')).toBe(after.leaves.findIndex((l) => l.id === 'book') + 1);
  });

  it('hiding a link removes it from the layout', () => {
    const links = circuit.links.map((l) => (l.id === 'spotify' ? { ...l, status: 'hidden' as const } : l));
    const t = layoutTree({ ...circuit, links }, 'horizontal');
    expect(t.leaves.find((l) => l.id === 'spotify')).toBeUndefined();
    expect(t.traces.find((x) => x.id === 'leaf:spotify')).toBeUndefined();
  });

  it('a live link without a URL is not clickable', () => {
    const t = layoutTree(data([{ ...L('x', 'work', 1), href: null }]), 'vertical');
    expect(t.leaves[0].live).toBe(false);
  });
});

describe('elbows', () => {
  it('straight when aligned', () => {
    expect(elbowH({ x: 0, y: 5 }, { x: 50, y: 5 }, 20)).toEqual([{ x: 0, y: 5 }, { x: 50, y: 5 }]);
    expect(elbowV({ x: 5, y: 0 }, { x: 5, y: 50 }, 20)).toEqual([{ x: 5, y: 0 }, { x: 5, y: 50 }]);
  });
  it('45° chamfers, shrunk for small jogs', () => {
    const p = elbowH({ x: 0, y: 0 }, { x: 100, y: 6 }, 50);
    expect(orthoOr45(p)).toBe(true);
    expect(p[p.length - 1]).toEqual({ x: 100, y: 6 });
  });
});

describe('links data', () => {
  it('is JSON-serialisable (Edge Config ready)', () => {
    expect(JSON.parse(JSON.stringify(circuit))).toEqual(circuit);
  });
  it('ids are unique; only live links carry a URL; only allowed URLs', () => {
    const ids = circuit.links.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const allowed = new Set([
      'https://www.linkedin.com/in/joshuaaschwartz/',
      'https://soundcloud.com/fuzzynop',
      'https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM',
      'https://www.mixcloud.com/FZZY/',
    ]);
    for (const l of circuit.links) {
      if (l.status !== 'live') expect(l.href, l.id).toBeNull();
      if (l.href) expect(allowed.has(l.href), l.href).toBe(true);
    }
  });
});
