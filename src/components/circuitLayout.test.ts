import { describe, expect, it } from 'vitest';
import { circuit, type CircuitData, type CircuitLink } from '../content/links';
import { G, elbowH, elbowV, groupLinks, layoutTree, litPath, modeFor, type Pt } from './circuitLayout';

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
  const widths = { columns: 760, stack: 343 } as const;
  for (const mode of ['columns', 'stack'] as const) {
    describe(mode, () => {
      const W = widths[mode];
      const t = layoutTree(circuit, mode, W);

      it('renders every non-hidden link once, in keyboard order root → work → make', () => {
        const visible = circuit.links.filter((l) => l.status !== 'hidden');
        expect(t.leaves).toHaveLength(visible.length);
        expect(new Set(t.leaves.map((l) => l.id)).size).toBe(visible.length);
        const rank = { root: 0, work: 1, make: 2 } as const;
        const ranks = t.leaves.map((l) => rank[l.branch]);
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      });

      it('one trunk per group plus one trace per leaf, all orthogonal / 45°', () => {
        expect(t.traces).toHaveLength(t.groups.length + t.leaves.length);
        for (const tr of t.traces) {
          expect(orthoOr45(tr.points), tr.id).toBe(true);
          expect(tr.d.startsWith('M')).toBe(true);
        }
      });

      it('rows in a group are 44px targets that never overlap, and everything sits inside the box', () => {
        expect(G.row).toBeGreaterThanOrEqual(44);
        for (const g of t.groups) {
          for (let i = 1; i < g.leaves.length; i++) expect(g.leaves[i].y - g.leaves[i - 1].y).toBeGreaterThanOrEqual(G.row);
        }
        for (const l of t.leaves) {
          expect(l.y - G.row / 2).toBeGreaterThanOrEqual(0);
          expect(l.y + G.row / 2).toBeLessThanOrEqual(t.height);
          expect(l.x - G.slot).toBeGreaterThanOrEqual(0);
          expect(l.x - G.slot + l.w).toBeLessThanOrEqual(W + 1e-6);
          expect(l.w).toBeGreaterThanOrEqual(150); // room for the longest label
        }
        for (const tr of t.traces) for (const p of tr.points) expect(p.x).toBeLessThanOrEqual(W);
      });

      it('each leaf trace ends on a pad just before its hex, and lights back to the root', () => {
        for (const l of t.leaves) {
          const tr = t.traces.find((x) => x.id === `leaf:${l.id}`)!;
          const end = tr.points[tr.points.length - 1];
          expect(end).toEqual({ x: l.x - t.hexR - 4, y: l.y });
          expect(t.pads).toContainEqual(end);
          const trunk = t.traces.find((x) => x.id === `trunk:${l.branch}`)!;
          expect(trunk.points[trunk.points.length - 1]).toEqual(tr.points[0]); // trunk meets the leaf trace at the via
          expect([...litPath(t, l.id)].sort()).toEqual([`leaf:${l.id}`, `trunk:${l.branch}`].sort());
        }
        expect(litPath(t, null).size).toBe(0);
      });

      it('heads all three groups: Connect, Work, Play', () => {
        expect(t.groups.map((g) => g.label)).toEqual(['Connect', 'Work', 'Play']);
      });

      it('is stable: same input, same output', () => {
        expect(layoutTree(structuredClone(circuit), mode, W)).toEqual(t);
      });
    });
  }

  it('columns: three distinct, non-overlapping column bands, about half the old height', () => {
    const t = layoutTree(circuit, 'columns', 760);
    const bands = t.groups.map((g) => {
      const xs = g.leaves.map((l) => l.x);
      expect(new Set(xs).size).toBe(1); // one column per group
      return { left: xs[0] - G.slot, right: xs[0] - G.slot + g.leaves[0].w };
    });
    expect(bands).toHaveLength(3);
    for (let i = 1; i < bands.length; i++) expect(bands[i].left).toBeGreaterThanOrEqual(bands[i - 1].right);
    expect(t.height).toBeLessThan(480);
  });

  it('stack: one column of rows down the left', () => {
    const t = layoutTree(circuit, 'stack', 343);
    expect(new Set(t.leaves.map((l) => l.x)).size).toBe(1);
    const ys = t.leaves.map((l) => l.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(G.row);
  });

  it('picks columns when wide, a stack when narrow', () => {
    expect(modeFor(544)).toBe('columns'); // the plate at 1024px
    expect(modeFor(G.minColumns)).toBe('columns');
    expect(modeFor(G.minColumns - 1)).toBe('stack');
    expect(modeFor(239)).toBe('stack'); // the plate at 375px
  });

  it('adding one link re-lays out: one more leaf and trace, the stack grows by one row', () => {
    const before = layoutTree(circuit, 'stack', 343);
    const after = layoutTree({ ...circuit, links: [...circuit.links, L('new', 'work', 6)] }, 'stack', 343);
    expect(after.leaves).toHaveLength(before.leaves.length + 1);
    expect(after.traces).toHaveLength(before.traces.length + 1);
    expect(after.height - before.height).toBe(G.row);
    expect(after.leaves.findIndex((l) => l.id === 'new')).toBe(after.leaves.findIndex((l) => l.id === 'book') + 1);
  });

  it('hiding a link removes it from the layout', () => {
    const links = circuit.links.map((l) => (l.id === 'spotify' ? { ...l, status: 'hidden' as const } : l));
    for (const mode of ['columns', 'stack'] as const) {
      const t = layoutTree({ ...circuit, links }, mode, 760);
      expect(t.leaves.find((l) => l.id === 'spotify')).toBeUndefined();
      expect(t.traces.find((x) => x.id === 'leaf:spotify')).toBeUndefined();
    }
  });

  it('a live link without a URL is not clickable', () => {
    const t = layoutTree(data([{ ...L('x', 'work', 1), href: null }]), 'stack', 343);
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
    // mirrors docs/CONTENT.md "Allowed links"
    const allowed = new Set([
      'https://www.linkedin.com/in/joshuaaschwartz/',
      'https://x.com/FuzzyNop',
      'https://github.com/fuzzyplace',
      'https://infocondb.org/presenter/josh-schwartz-fuzzynop',
      'https://www.pcmag.com/opinions/the-head-of-verizon-medias-red-team-has-one-simple-security-tip',
      'https://securityconversations.com/episode/josh-schwartz-on-red-teaming-and-proactive-security-engineering/',
      'https://www.ksat.com/news/2019/03/14/some-hackers-use-their-skills-for-good-help-with-cybersecurity/',
      'https://fuzzy.place',
      'https://suno.com/@fuzzymmm',
      'https://www.youtube.com/watch?v=E_Jd_RxyoEc',
      'https://www.skool.com/the-fuzzy-place',
      'https://soundcloud.com/fuzzynop',
      'https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM',
      'https://www.mixcloud.com/FZZY/',
    ]);
    for (const l of circuit.links) {
      if (l.status !== 'live') expect(l.href, l.id).toBeNull();
      if (l.href) expect(allowed.has(l.href), l.href).toBe(true);
    }
  });
  it('Suno sits in Play right after The Fuzzy Place, ahead of the other music links', () => {
    const play = groupLinks(circuit).find((g) => g.branch === 'make')!.links.map((l) => l.id);
    expect(play.slice(0, 2)).toEqual(['fuzzy-place', 'suno']);
    for (const id of ['live-set', 'soundcloud', 'spotify', 'mixcloud']) expect(play.indexOf('suno')).toBeLessThan(play.indexOf(id));
    expect(circuit.links.find((l) => l.id === 'suno')).toMatchObject({ href: 'https://suno.com/@fuzzymmm', status: 'live' });
  });
});
