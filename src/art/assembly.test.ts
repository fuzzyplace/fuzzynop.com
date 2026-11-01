import { describe, expect, it } from 'vitest';
import { armAt, groupAt, groupLines, memberOffset, paceFor, planAssembly, sheetAt, sheetCornerAt, type GroupIn, type PlanOpts } from './assembly';

const groups: GroupIn[] = [
  { box: { x: 48, y: 56, w: 160, h: 36 }, mode: 'carry' }, // badge row
  { box: { x: 48, y: 112, w: 180, h: 52 }, mode: 'carry' }, // title word
  { box: { x: 240, y: 112, w: 220, h: 52 }, mode: 'carry' }, // title word
  ...Array.from({ length: 8 }, (_, i): GroupIn => ({ box: { x: 48, y: 200 + i * 29, w: 480, h: 29 }, mode: 'deal' })),
  { box: { x: 48, y: 470, w: 180, h: 56 }, mode: 'carry' }, // CTA
];
const desk: PlanOpts = { w: 690, h: 640, side: 'right', arms: 2, mobile: false, seed: 7, rest: { x: 620, y: -50 }, reach: 360 };
const phone: PlanOpts = { w: 295, h: 900, side: 'left', arms: 1, mobile: true, seed: 3, rest: { x: 70, y: -50 }, reach: 300 };

describe('assembly plan', () => {
  for (const [name, o] of [['desktop', desk], ['phone', phone]] as const) {
    it(`${name}: everything lands, in reading order, within ~1.5-2.8 s, then the arms leave`, () => {
      const p = planAssembly(groups, o);
      expect(p.end).toBeGreaterThan(1.2);
      expect(p.end).toBeLessThan(2.8);
      for (let i = 1; i < p.groups.length; i++) expect(p.groups[i].t0).toBeGreaterThanOrEqual(p.groups[i - 1].t0);
      for (const g of p.groups) {
        expect(groupAt(g, g.t0 - 0.01)).toBeNull();
        expect(groupAt(g, p.end)).toEqual({ dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1 });
        expect(g.t0 + g.dur).toBeLessThanOrEqual(p.placed + 1e-9);
      }
      expect(sheetAt(p.sheet, p.end)).toMatchObject({ x: 0, y: 0, rot: 0, rx: 0, scale: 1, opacity: 1, lift: 0 });
      // arm 0 ends parked at its rest spot; a second arm is gone
      expect(armAt(p, 0, p.end).tip).toEqual(o.rest);
      expect(armAt(p, 0, p.end).active).toBe(false);
      if (o.arms === 2) expect(armAt(p, 1, p.end).gone).toBe(true);
    });
  }

  it('the claws hold the sheet by its corners while carrying it, and the sheet starts off its spot', () => {
    const p = planAssembly(groups, desk);
    const s0 = sheetAt(p.sheet, 0);
    expect(Math.hypot(s0.x, s0.y)).toBeGreaterThan(100);
    expect(s0.lift).toBe(1);
    const t = 0.2;
    expect(armAt(p, 0, t).tip).toEqual(sheetCornerAt(p.sheet, { x: desk.w, y: 0 }, t));
    expect(armAt(p, 1, t).tip).toEqual(sheetCornerAt(p.sheet, { x: 0, y: 0 }, t));
  });

  it('a held group rides in the claw: the tip moves with it', () => {
    const p = planAssembly(groups, desk);
    const g = p.groups[1];
    const t = g.t0 + g.dur * g.hold * 0.5;
    const a = armAt(p, g.arm, t);
    const q = groupAt(g, t)!;
    expect(a.tip.x).toBeCloseTo(g.grip.x + q.dx, 5);
    expect(a.tip.y).toBeCloseTo(g.grip.y + q.dy, 5);
  });

  it('a title word is not carried in over words already placed in its row', () => {
    const p = planAssembly(groups, desk);
    const [, a, b] = p.groups;
    // the second (right-hand) word comes from the right: its claw is the right-side arm
    expect(p.arms[b.arm].side).toBe(1);
    expect(a.from.dx * p.arms[a.arm].side).toBeGreaterThan(0);
  });

  it('is deterministic per seed', () => {
    expect(planAssembly(groups, desk)).toEqual(planAssembly(groups, desk));
  });
});

describe('helpers', () => {
  it('groupLines splits words by line', () => {
    const b = (x: number, y: number) => ({ x, y, w: 40, h: 28 });
    expect(groupLines([b(0, 0), b(50, 1), b(100, 0), b(0, 29), b(50, 29), b(0, 58)])).toEqual([[0, 1, 2], [3, 4], [5]]);
  });
  it('memberOffset: a group with no rotation moves every member by its offset', () => {
    const grp = { x: 0, y: 0, w: 200, h: 30 };
    expect(memberOffset(grp, { x: 150, y: 0, w: 50, h: 30 }, { dx: 12, dy: -5, rot: 0, scale: 1, opacity: 1 })).toEqual({ x: 12, y: -5 });
  });
  it('paceFor: normal speed low on screen, much faster as the plate climbs', () => {
    expect(paceFor(0.85)).toBe(1);
    expect(paceFor(0.3)).toBeGreaterThan(5);
  });
});
