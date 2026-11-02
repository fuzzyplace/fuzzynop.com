import { describe, expect, it } from 'vitest';
import { bodyAt, freeSpaces, overlaps, type Rect } from './interior';

const R = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
const O = { inset: 16, pad: 6, w: 34, h: 90, lieW: 100 };

describe('freeSpaces', () => {
  // a 663 x 389 plate like "Before" at 1440: a title and two paragraphs on the left 480 px
  const plate = R(0, 0, 663, 389);
  const title = [R(47, 105, 200, 70), R(259, 102, 224, 70)];
  const lines = [R(48, 200, 390, 24), R(48, 229, 360, 24), R(49, 278, 330, 24), R(49, 307, 280, 24)];
  const text = [...title, ...lines];
  const nooks = freeSpaces(plate, text, { ...O, titles: title });

  it('finds the margin right of the copy', () => {
    expect(nooks.length).toBeGreaterThan(0);
    expect(nooks.some((n) => n.left > 483 && n.right <= 663 - 16 - 17)).toBe(true);
  });
  it('never puts his body over text, wherever he stands in a nook', () => {
    for (const n of nooks)
      for (const x of [n.left, (n.left + n.right) / 2, n.right]) {
        const b = bodyAt(x, n.y, O);
        for (const t of text) expect(overlaps(b, t)).toBe(false);
        expect(b.top).toBeGreaterThanOrEqual(16);
        expect(b.bottom).toBeLessThanOrEqual(389 - 16);
        expect(b.left).toBeGreaterThanOrEqual(16 - 0.01);
        expect(b.right).toBeLessThanOrEqual(663 - 16 + 0.01);
      }
  });
  it('marks the nook after the title as a title nook', () => {
    expect(nooks.some((n) => n.title && n.left > 483)).toBe(true);
  });
  it('knows which side the words are on', () => {
    const right = nooks.find((n) => n.left > 483)!;
    expect(right.wall).toBe(-1);
  });
  it('flags room to lie down', () => {
    expect(nooks.some((n) => n.lie)).toBe(true);
  });
  it('is empty when the plate is all text', () => {
    expect(freeSpaces(R(0, 0, 300, 200), [R(0, 0, 300, 200)], O)).toEqual([]);
  });
  it('is empty when the plate is smaller than him', () => {
    expect(freeSpaces(R(0, 0, 40, 60), [], O)).toEqual([]);
  });
  it('finds the gap beside a narrow column (a tree of nodes)', () => {
    const nodes = [R(330, 40, 230, 30), R(330, 120, 230, 30), R(330, 200, 230, 30)];
    const n = freeSpaces(R(0, 0, 757, 300), nodes, O);
    expect(n.some((q) => q.right < 330)).toBe(true);
    expect(n.some((q) => q.left > 560)).toBe(true);
  });
  it('caps the count', () => {
    const many = Array.from({ length: 30 }, (_, i) => R(10 + (i % 6) * 120, 20 + Math.floor(i / 6) * 120, 20, 20));
    expect(freeSpaces(R(0, 0, 760, 640), many, { ...O, max: 5 }).length).toBeLessThanOrEqual(5);
  });
});
