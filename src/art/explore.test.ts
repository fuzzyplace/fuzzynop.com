import { describe, expect, it } from 'vitest';
import { choosePoi, collectPois, remember, type Poi, type Scene, type SceneSurface } from './explore';
import { rng } from './geometry';

const plate = (x0: number, x1: number, y: number, h = 300): SceneSurface => ({ left: x0 + 36, right: x1 - 36, y, bottom: y + h, x0, x1, ledge: false, plate: true });
const ledge = (cx: number, y: number): SceneSurface => ({ left: cx - 8, right: cx + 8, y, bottom: y + 26, x0: cx - 42, x1: cx + 42, ledge: true, plate: false });
const ground = (y: number): SceneSurface => ({ left: 1000, right: 1400, y, bottom: y, x0: 0, x1: 1440, ledge: false, plate: false });
const scene = (over: Partial<Scene> = {}): Scene => ({
  surfaces: [ground(800), ledge(1150, 670), plate(100, 700, 300)],
  splats: [],
  printers: [],
  headings: [],
  view: { left: 0, right: 1440, top: 0, bottom: 900 },
  reach: 110,
  tapOut: 26,
  pad: 40,
  sitOut: 13,
  ...over,
});

describe('points of interest', () => {
  it('plates have two edges to peek over, facing out', () => {
    const edges = collectPois(scene()).filter((p) => p.kind === 'edge');
    expect(edges.map((e) => [e.x, e.face])).toEqual([
      [136, -1],
      [664, 1],
    ]);
    expect(edges.every((e) => e.activity === 'peek')).toBe(true);
  });

  it('a hung stone within reach is tapped from beside it, facing it', () => {
    const stones = collectPois(scene()).filter((p) => p.kind === 'stone');
    expect(stones.map((p) => [p.s, p.x, p.face, p.target])).toEqual([
      [0, 1108 - 26, 1, 1],
      [0, 1192 + 26, -1, 1],
    ]);
    // out of reach: none
    expect(collectPois(scene({ reach: 80 })).some((p) => p.kind === 'stone')).toBe(false);
  });

  it('seats sit his knees at the very edge (he faces out over it)', () => {
    const seats = collectPois(scene()).filter((p) => p.activity === 'sit');
    const onLedge = seats.filter((p) => p.s === 1);
    expect(onLedge.map((p) => [p.x, p.face])).toEqual([
      [1108 + 13, -1],
      [1192 - 13, 1],
    ]);
    expect(seats.some((p) => p.s === 0)).toBe(false); // not on the open ground
  });

  it('nothing off screen', () => {
    const sc = scene({ surfaces: [plate(-400, 300, 300)] });
    expect(collectPois(sc).every((p) => p.x >= 40 && p.x <= 1400)).toBe(true);
  });

  it('a heading: stands on the plate top just past the text, looking back at it', () => {
    const h = collectPois(scene({ headings: [{ s: 2, left: 150, right: 420, top: 380 }] })).find((p) => p.kind === 'heading')!;
    expect(h.s).toBe(2);
    expect(h.x).toBe(450);
    expect(h.face).toBe(-1);
    expect(h.look!.y).toBeGreaterThan(300); // looks down at it; he stands on the edge above it
  });

  it('a printing arm: watches from a nearby surface, clear of the arm', () => {
    const p = collectPois(scene({ printers: [{ s: 9, tip: { x: 1180, y: 840 } }] })).find((q) => q.kind === 'printer')!;
    expect(p.activity).toBe('watch');
    expect(Math.abs(p.x - 1180)).toBeGreaterThanOrEqual(90);
  });

  it('an ink splat below a surface: crouches over it', () => {
    const p = collectPois(scene({ splats: [{ x: 1300, y: 860, r: 60 }] })).find((q) => q.kind === 'splat')!;
    expect(p).toMatchObject({ s: 0, x: 1300, activity: 'crouch' });
  });
});

describe('choosing', () => {
  const pois: Poi[] = [
    { id: 'a', kind: 'edge', s: 0, x: 100, face: 1, look: null, activity: 'peek', weight: 1 },
    { id: 'b', kind: 'edge', s: 0, x: 900, face: 1, look: null, activity: 'peek', weight: 1 },
    { id: 'c', kind: 'seat', s: 0, x: 500, face: 1, look: null, activity: 'sit', weight: 1 },
  ];
  const cost = (p: Poi) => Math.abs(p.x - 120) / 50;

  it('skips where he already is, unreachable spots, and seats unless resting', () => {
    const r = rng(1);
    expect(choosePoi(pois, { from: { s: 0, x: 110 }, cost, recent: [], rand: r, mood: 'explore' })?.id).toBe('b');
    expect(choosePoi(pois, { from: { s: 0, x: 110 }, cost: (p) => (p.id === 'b' ? null : 1), recent: [], rand: r, mood: 'explore' })).toBeNull();
    expect(choosePoi(pois, { from: { s: 0, x: 110 }, cost, recent: [], rand: r, mood: 'rest' })?.id).toBe('c');
  });

  it('prefers somewhere new', () => {
    const two: Poi[] = [pois[0], { ...pois[1], x: 140, id: 'd' }];
    let fresh = 0;
    for (let i = 0; i < 200; i++) {
      const p = choosePoi(two, { from: { s: 0, x: 600 }, cost: () => 1, recent: ['a'], rand: rng(i), mood: 'explore' });
      if (p?.id === 'd') fresh++;
    }
    expect(fresh).toBeGreaterThan(180);
  });

  it('remembers the last few, most recent first', () => {
    expect(remember(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c']);
    expect(remember(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
