import { describe, expect, it } from 'vitest';
import { armAt, asmShare, follow, groupAt, groupLines, memberOffset, planAssembly, puffAt, scrollKeys, sheetAt, sheetCornerAt, snapBeat, timeAtScroll, TIMING, type GroupIn, type PlanOpts } from './assembly';

const groups: GroupIn[] = [
  { box: { x: 48, y: 56, w: 160, h: 36 }, mode: 'carry' }, // badge row
  { box: { x: 48, y: 112, w: 180, h: 52 }, mode: 'carry' }, // title word
  { box: { x: 240, y: 112, w: 220, h: 52 }, mode: 'carry' }, // title word
  ...Array.from({ length: 8 }, (_, i): GroupIn => ({ box: { x: 48, y: 200 + i * 29, w: 480, h: 29 }, mode: 'deal' })),
  { box: { x: 48, y: 470, w: 180, h: 56 }, mode: 'carry' }, // CTA
];
const desk: PlanOpts = { w: 690, h: 640, side: 'right', arms: 2, mobile: false, seed: 7, rest: { x: 620, y: -50 }, reach: 360 };
const phone: PlanOpts = { w: 295, h: 900, side: 'left', arms: 1, mobile: true, seed: 3, rest: { x: 70, y: -50 }, reach: 300 };
const SETTLED = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, opacity: 1, lift: 0 };

describe('assembly plan', () => {
  for (const [name, o] of [['desktop', desk], ['phone', phone]] as const) {
    it(`${name}: everything lands in reading order, a beat apart, then the arms leave`, () => {
      const p = planAssembly(groups, o);
      const T = o.mobile ? TIMING.mobile : TIMING.desktop;
      for (let i = 1; i < p.groups.length; i++) {
        expect(p.groups[i].t0).toBeGreaterThanOrEqual(p.groups[i - 1].t0);
        expect(p.groups[i].tP - p.groups[i - 1].tP).toBeGreaterThanOrEqual(T.beat * 0.65 - 1e-9);
      }
      for (const g of p.groups) {
        expect(groupAt(g, g.t0 - 0.01)).toBeNull();
        expect(groupAt(g, p.end)).toEqual(SETTLED);
        expect(g.tS).toBeLessThanOrEqual(p.placed + 1e-9);
        expect(g.t0).toBeGreaterThan(p.landed);
      }
      expect(sheetAt(p.sheet, p.end)).toMatchObject({ x: 0, y: 0, rot: 0, rx: 0, sx: 1, sy: 1, opacity: 1, lift: 0 });
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
    const t = 0.3;
    expect(armAt(p, 0, t).tip).toEqual(sheetCornerAt(p.sheet, { x: desk.w, y: 0 }, t));
    expect(armAt(p, 1, t).tip).toEqual(sheetCornerAt(p.sheet, { x: 0, y: 0 }, t));
  });

  it('the sheet lands with a slap: pressed flatter than at rest for a moment, and an ink puff', () => {
    const p = planAssembly(groups, desk);
    const t = p.landed + p.sheet.settle * 0.12;
    expect(sheetAt(p.sheet, t).lift).toBeLessThan(0);
    const puff = puffAt(p, p.landed + 0.15)!;
    expect(puff.length).toBeGreaterThan(4);
    expect(Math.max(...puff.map((d) => d.opacity))).toBeGreaterThan(0.3);
    expect(puffAt(p, p.landed - 0.1)).toBeNull();
    expect(puffAt(p, p.end)).toBeNull();
  });

  it('a held group rides in the claw, winds up above its slot, and squashes when it lands', () => {
    const p = planAssembly(groups, desk);
    const g = p.groups[1];
    const t = (g.t0 + g.tA) / 2;
    const a = armAt(p, g.arm, t);
    const q = groupAt(g, t)!;
    expect(a.tip.x).toBeCloseTo(g.grip.x + q.dx, 5);
    expect(a.tip.y).toBeCloseTo(g.grip.y + q.dy, 5);
    expect(a.grip).toBe(1);
    // the rest beat: held in the air, above its slot
    const w = groupAt(g, g.tW - 0.02)!;
    expect(w.dy).toBeLessThan(-g.lift);
    expect(w.opacity).toBe(1);
    // just landed: squashed
    const s = groupAt(g, g.tP + 0.005)!;
    expect(s.sy).toBeLessThan(0.95);
    expect(s.sx).toBeGreaterThan(1.02);
    // the claw lets go and springs up
    const after = armAt(p, g.arm, g.tP + 0.08);
    expect(after.tip.y).toBeLessThan(gripAt0(p, g).y);
  });

  it('a title word is not carried in over words already placed in its row', () => {
    const p = planAssembly(groups, desk);
    const [, a, b] = p.groups;
    expect(p.arms[b.arm].side).toBe(1);
    expect(a.from.dx * p.arms[a.arm].side).toBeGreaterThan(0);
  });

  it('when only a crossing arm can reach a title word, it is lowered in from above its row', () => {
    const p = planAssembly(groups, { ...desk, w: 800, side: 'left', reach: 300 });
    const b = p.groups[2];
    expect(Math.abs(b.from.dx)).toBeLessThan(20);
    expect(b.from.dy).toBeLessThan(-b.box.h);
  });

  it('is deterministic per seed, and every pose is a function of time (reversible)', () => {
    const a = planAssembly(groups, desk);
    expect(a).toEqual(planAssembly(groups, desk));
    const t = a.groups[4].tA;
    expect(groupAt(a.groups[4], t)).toEqual(groupAt(a.groups[4], t));
    expect(armAt(a, 0, t)).toEqual(armAt(a, 0, t));
  });

  it('rest beats: 0, the sheet in the air, each piece in the air, the end', () => {
    const p = planAssembly(groups, desk);
    expect(p.beats[0]).toBe(0);
    expect(p.beats[p.beats.length - 1]).toBe(p.end);
    expect(p.beats.length).toBe(groups.length + 3);
    for (let i = 1; i < p.beats.length; i++) expect(p.beats[i]).toBeGreaterThan(p.beats[i - 1]);
  });
});

const gripAt0 = (p: ReturnType<typeof planAssembly>, g: (typeof p.groups)[number]) => ({ x: g.grip.x, y: g.grip.y });

describe('scroll → time', () => {
  const p = planAssembly(groups, desk);
  const geo = { s0: 1000, sheet: 1500, pinStart: 1550, pinEnd: 2350, ready: groups.map(() => -Infinity) };
  const k = scrollKeys(p, geo);

  it('starts at s0, lands the sheet, ends before the pin releases; monotonic', () => {
    expect(timeAtScroll(k, 900)).toBe(0);
    expect(timeAtScroll(k, 1500)).toBeCloseTo(p.landed + p.sheet.settle * 0.4, 5);
    expect(timeAtScroll(k, 2350 - 10)).toBe(p.end);
    for (let i = 1; i < k.s.length; i++) {
      expect(k.s[i]).toBeGreaterThan(k.s[i - 1]);
      expect(k.t[i]).toBeGreaterThan(k.t[i - 1]);
    }
  });

  it('v2.11: with a share, it is whole by then and stays whole through the read pause', () => {
    for (const [vw, tall] of [[1440, false], [375, false], [1440, true], [375, true]] as const) {
      const share = asmShare(vw, tall);
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.6);
      const k3 = scrollKeys(p, { ...geo, share });
      const whole = geo.pinStart + (geo.pinEnd - geo.pinStart) * share;
      expect(timeAtScroll(k3, whole)).toBe(p.end);
      // the read pause is at least as long as a third of the pin
      expect(geo.pinEnd - whole).toBeGreaterThanOrEqual((geo.pinEnd - geo.pinStart) / 3);
    }
  });

  it('a group is never pressed before its slot is in view (tall plates)', () => {
    const ready = groups.map((_, i) => 1500 + i * 30);
    const k2 = scrollKeys(p, { ...geo, ready });
    p.groups.forEach((g, i) => {
      const j = k2.t.indexOf(g.tP);
      if (j >= 0) expect(k2.s[j]).toBeGreaterThanOrEqual(Math.min(ready[i], geo.pinStart));
    });
  });

  it('snapBeat: down → the next beat, up → the one behind', () => {
    const b = [0, 1, 2, 3];
    expect(snapBeat(b, 1.4, 1)).toBe(2);
    expect(snapBeat(b, 1.4, -1)).toBe(1);
    expect(snapBeat(b, 2, 1)).toBe(2);
  });

  it('follow: glides to the target without overshoot, speed limited', () => {
    const st = { t: 0, v: 0 };
    let maxStep = 0;
    for (let i = 0; i < 300; i++) {
      const before = st.t;
      follow(st, 5, 1 / 60);
      maxStep = Math.max(maxStep, st.t - before);
      expect(st.t).toBeLessThanOrEqual(5);
    }
    expect(st.t).toBe(5);
    expect(maxStep).toBeLessThanOrEqual(3.2 / 60 + 1e-9);
    // reversal is smooth: velocity turns round, no jump
    follow(st, 0, 1 / 60);
    expect(5 - st.t).toBeLessThan(0.05);
  });
});

describe('helpers', () => {
  it('groupLines splits words by line', () => {
    const b = (x: number, y: number) => ({ x, y, w: 40, h: 28 });
    expect(groupLines([b(0, 0), b(50, 1), b(100, 0), b(0, 29), b(50, 29), b(0, 58)])).toEqual([[0, 1, 2], [3, 4], [5]]);
  });
  it('memberOffset: a group with no rotation moves every member by its offset', () => {
    const grp = { x: 0, y: 0, w: 200, h: 30 };
    expect(memberOffset(grp, { x: 150, y: 0, w: 50, h: 30 }, { ...SETTLED, dx: 12, dy: -5 })).toEqual({ x: 12, y: -5 });
  });
  it('memberOffset: a squash keeps the bottom edge on its line', () => {
    const grp = { x: 0, y: 0, w: 200, h: 30 };
    const o = memberOffset(grp, grp, { ...SETTLED, sx: 1.05, sy: 0.9 });
    // the member scales about its own centre; its bottom stays put when moved down by h*(1-sy)/2
    expect(o.y).toBeCloseTo((30 * (1 - 0.9)) / 2, 5);
  });
});
