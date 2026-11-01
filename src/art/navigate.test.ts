import { describe, expect, it } from 'vitest';
import { LIMITS, links, planRoute, sampleMove, type Surface } from './navigate';

const kinds = (r: { kind: string }[] | null) => r?.map((m) => m.kind);

describe('navigate', () => {
  const A: Surface = { left: 0, right: 300, y: 500 };

  it('same surface: a single walk', () => {
    const r = planRoute([A], { s: 0, x: 50 }, { s: 0, x: 250 });
    expect(kinds(r)).toEqual(['walk']);
    expect(r![0].duration).toBeCloseTo(200 / LIMITS.speed);
  });

  it('level gap: walk to the edge, jump, walk on', () => {
    const B: Surface = { left: 400, right: 700, y: 500 };
    const r = planRoute([A, B], { s: 0, x: 100 }, { s: 1, x: 600 });
    expect(kinds(r)).toEqual(['walk', 'jump', 'walk']);
    expect(r![1].from.x).toBeGreaterThan(290);
    expect(r![1].to.x).toBeGreaterThanOrEqual(400);
  });

  it('higher plate whose side stands on his surface: climb it', () => {
    const B: Surface = { left: 150, right: 600, y: 250, bottom: 520 };
    const r = planRoute([A, B], { s: 0, x: 40 }, { s: 1, x: 400 });
    expect(kinds(r)).toContain('climb');
  });

  it('lower plate past his edge: step off and fall', () => {
    const B: Surface = { left: 200, right: 800, y: 900 };
    const r = planRoute([A, B], { s: 0, x: 40 }, { s: 1, x: 600 });
    expect(kinds(r)).toContain('fall');
  });

  it('too far: no route', () => {
    const B: Surface = { left: 2000, right: 2300, y: 100 };
    expect(planRoute([A, B], { s: 0, x: 40 }, { s: 1, x: 2100 })).toBeNull();
    expect(links(A, B)).toEqual([]);
  });

  it('multi-hop via a stepping stone', () => {
    const B: Surface = { left: 450, right: 600, y: 420 };
    const C: Surface = { left: 750, right: 1000, y: 340 };
    const r = planRoute([A, B, C], { s: 0, x: 100 }, { s: 2, x: 900 });
    expect(r).not.toBeNull();
    expect(r![r!.length - 1].onto).toBe(2);
  });

  it('sampleMove hits both ends and arcs above them on a jump', () => {
    const m = { kind: 'jump' as const, from: { x: 0, y: 500 }, to: { x: 200, y: 500 }, duration: 1, onto: 1 };
    expect(sampleMove(m, 0).p).toEqual({ x: 0, y: 500 });
    expect(sampleMove(m, 1).p.x).toBeCloseTo(200);
    expect(sampleMove(m, 1).p.y).toBeCloseTo(500);
    expect(sampleMove(m, 0.575).p.y).toBeLessThan(470);
    const c = { kind: 'climb' as const, from: { x: 10, y: 500 }, to: { x: 40, y: 300 }, duration: 1, onto: 1 };
    expect(sampleMove(c, 1).p).toEqual({ x: 40, y: 300 });
    const f = { kind: 'fall' as const, from: { x: 298, y: 500 }, to: { x: 330, y: 900 }, duration: 1, onto: 1 };
    expect(sampleMove(f, 1).p).toEqual({ x: 330, y: 900 });
  });
});

describe('navigate: climbing a plate whose bottom is above him', () => {
  it('jumps to catch the lower edge, then climbs; too high to reach = no climb', () => {
    const below: Surface = { left: 500, right: 1250, y: 1878 };
    const above: Surface = { left: 190, right: 780, y: 1180, bottom: 1750 };
    const r = planRoute([below, above], { s: 0, x: 1000 }, { s: 1, x: 400 });
    const c = r?.find((m) => m.kind === 'climb');
    expect(c?.grab).toBe(1750);
    expect(sampleMove(c!, 0.02).action).toBe('jump');
    expect(sampleMove(c!, 0.5).action).toBe('climb');
    expect(sampleMove(c!, 1).p.y).toBe(1180);
    expect(planRoute([below, { ...above, bottom: 1500 }], { s: 0, x: 1000 }, { s: 1, x: 400 })).toBeNull();
  });
});

describe('navigate: ledges', () => {
  it('jumps straight up onto a ledge overhead, then across to the next', () => {
    const ground: Surface = { left: 1036, right: 1404, y: 800 };
    const a: Surface = { left: 1146, right: 1158, y: 670, bottom: 700, x0: 1110, x1: 1194 };
    const b: Surface = { left: 1304, right: 1316, y: 550, bottom: 580, x0: 1268, x1: 1352 };
    const r = planRoute([ground, a, b], { s: 0, x: 1300 }, { s: 2, x: 1310 });
    expect(r).not.toBeNull();
    expect(r!.filter((m) => m.kind !== 'walk').length).toBeGreaterThanOrEqual(1);
    expect(r![r!.length - 1].onto).toBe(2);
    const up = planRoute([ground, a], { s: 0, x: 1300 }, { s: 1, x: 1152 });
    const hops = up!.filter((m) => m.kind !== 'walk');
    expect(hops).toHaveLength(1);
    expect(['jump', 'climb']).toContain(hops[0].kind);
    // with nothing to climb beside it (narrow ground right under it), the straight jump is the way
    const under = planRoute([{ left: 1140, right: 1165, y: 800 }, a], { s: 0, x: 1150 }, { s: 1, x: 1152 });
    expect(under?.map((m) => m.kind)).toContain('jump');
  });

  it('climbs outside the body edge, not the walkable edge', () => {
    const below: Surface = { left: 0, right: 1000, y: 900 };
    const plate: Surface = { left: 336, right: 664, y: 700, bottom: 880, x0: 300, x1: 700 };
    const c = links(below, plate).find((l) => l.kind === 'climb')!;
    expect([300 - LIMITS.edge, 700 + LIMITS.edge]).toContain(c.takeoff);
  });
});
