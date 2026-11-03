import { describe, expect, it } from 'vitest';
import { chooseDest, chooseFloor, chooseReal, hopDur, hopPhase, startHop, type Spot } from './teleport';

describe('hop timing', () => {
  it('runs out, a beat, in, done', () => {
    const h = startHop(1000, 800);
    expect(hopPhase(h, 1000).phase).toBe('out');
    expect(hopPhase(h, 1000 + h.out * 1000 + 1).phase).toBe('gone');
    expect(hopPhase(h, 1000 + (h.out + h.gap) * 1000 + 1).phase).toBe('in');
    expect(hopPhase(h, 1000 + hopDur(h) * 1000 + 1).phase).toBe('done');
    expect(startHop(0, 3000).gap).toBeGreaterThan(startHop(0, 100).gap);
  });
  it('is instant under reduced motion', () => {
    expect(hopPhase(startHop(0, 500, true), 0).phase).toBe('done');
  });
});

describe('chooseDest', () => {
  const view = { left: 0, right: 1440, top: 140, bottom: 900 };
  const spots: Spot[] = [
    { id: 'a', i: 0, x: 200, y: 600, inside: false },
    { id: 'b', i: 1, x: 900, y: 500, inside: true },
    { id: 'c', i: 2, x: 1300, y: 300, inside: false },
    { id: 'off', i: 3, x: 700, y: 1400, inside: false },
  ];
  const r = () => 0.5;
  it('only picks spots on screen', () => {
    for (let i = 0; i < 20; i++) expect(chooseDest(spots, { focus: { x: 700, y: 1300 }, view, me: null, rand: Math.random })!.id).not.toBe('off');
  });
  it('lands near your attention, never on it', () => {
    expect(chooseDest(spots, { focus: { x: 1100, y: 420 }, view, me: null, rand: r })!.id).not.toBe('a');
    expect(chooseDest(spots, { focus: { x: 905, y: 505 }, view, me: null, rand: r })!.id).not.toBe('b');
  });
  it('goes somewhere else than where he is', () => {
    expect(chooseDest(spots, { focus: null, view, me: { x: 900, y: 500 }, rand: r })!.id).not.toBe('b');
  });
  it('honours a preference for inside', () => {
    expect(chooseDest(spots, { focus: { x: 300, y: 500 }, view, me: null, prefer: 'inside', rand: r })!.id).toBe('b');
  });
  it('scrolling down: prefers spots the scroll will keep in view a while', () => {
    const two: Spot[] = [
      { id: 'high', i: 0, x: 600, y: 200, inside: false },
      { id: 'low', i: 1, x: 640, y: 700, inside: false },
    ];
    expect(chooseDest(two, { focus: { x: 620, y: 450 }, view, me: null, rand: r, drift: { dir: 1, px: 400 } })!.id).toBe('low');
    expect(chooseDest(two, { focus: { x: 620, y: 450 }, view, me: null, rand: r, drift: { dir: -1, px: 400 } })!.id).toBe('high');
  });
  it('while the page scrolls: never where the scroll takes him straight out of view, and the longer it keeps him the better', () => {
    const two: Spot[] = [
      { id: 'soon', i: 0, x: 600, y: 300, inside: false, stay: 0.1 },
      { id: 'later', i: 1, x: 640, y: 700, inside: false, stay: 3 },
    ];
    for (let i = 0; i < 20; i++) expect(chooseDest(two, { focus: { x: 600, y: 320 }, view, me: null, rand: Math.random })!.id).toBe('later');
    expect(chooseDest([two[0]], { focus: null, view, me: null, rand: r })).toBeNull();
    const kept: Spot[] = [
      { id: 'brief', i: 0, x: 600, y: 450, inside: false, stay: 0.6 },
      { id: 'long', i: 1, x: 640, y: 450, inside: false, stay: 5 },
    ];
    expect(chooseDest(kept, { focus: { x: 620, y: 250 }, view, me: null, rand: r })!.id).toBe('long');
  });
  it('null when nothing is on screen', () => {
    expect(chooseDest([spots[3]], { focus: null, view, me: null, rand: r })).toBeNull();
  });
});

describe('the screen floor (v2.13: he always has somewhere to be)', () => {
  const view = { left: 0, right: 1440, top: 140, bottom: 892 };
  const r = () => 0.5;
  const floor: Spot[] = [
    { id: 'floor:0#0', i: 10, x: 72, y: 886, inside: false, floor: true },
    { id: 'floor:2#0', i: 12, x: 720, y: 886, inside: false, floor: true },
    { id: 'floor:4#0', i: 14, x: 1368, y: 886, inside: false, floor: true },
  ];
  it('is never chosen while somewhere real will do', () => {
    const real: Spot = { id: 'plate', i: 0, x: 600, y: 500, inside: false };
    for (let i = 0; i < 20; i++) expect(chooseDest([...floor, real], { focus: { x: 300, y: 300 }, view, me: null, rand: Math.random })!.id).toBe('plate');
    expect(chooseReal(floor, { focus: null, view, me: null, rand: r })).toBeNull();
  });
  it('is chosen when nothing real is on screen', () => {
    const off: Spot = { id: 'below', i: 1, x: 600, y: 1600, inside: false };
    expect(chooseDest([off, ...floor], { focus: null, view, me: null, rand: r })?.floor).toBe(true);
  });
  it('is chosen even when every real spot is ruled out (under the pointer, scrolling out of view)', () => {
    const under: Spot = { id: 'under', i: 2, x: 600, y: 500, inside: false };
    const leaving: Spot = { id: 'leaving', i: 3, x: 900, y: 300, inside: false, stay: 0.05 };
    const d = chooseDest([under, leaving, ...floor], { focus: { x: 600, y: 500 }, view, me: null, rand: Math.random });
    expect(d?.floor).toBe(true);
  });
  it('ignores the pointer and the scroll for the floor itself', () => {
    const one: Spot[] = [{ ...floor[1], stay: 0 }];
    expect(chooseDest(one, { focus: { x: 720, y: 880 }, view, me: null, rand: r, drift: { dir: 1, px: 400 } })?.id).toBe('floor:2#0');
  });
  it('prefers the floor spot that covers the least reading', () => {
    const cover = (s: Spot) => (s.id === 'floor:4#0' ? 0 : 0.7);
    for (let i = 0; i < 20; i++) expect(chooseFloor(floor, { focus: null, view, me: null, rand: Math.random, cover })!.id).toBe('floor:4#0');
  });
  it('then one away from your attention', () => {
    expect(chooseFloor(floor, { focus: { x: 80, y: 860 }, view, me: null, rand: r })!.id).toBe('floor:4#0');
  });
  it('somewhere other than where he is, unless it is the only one', () => {
    expect(chooseFloor(floor, { focus: { x: 1368, y: 700 }, view, me: { x: 72, y: 886 }, rand: r })!.id).not.toBe('floor:0#0');
    expect(chooseFloor([floor[0]], { focus: null, view, me: { x: 72, y: 886 }, rand: r })!.id).toBe('floor:0#0');
  });
  it('null only when there is no floor either', () => {
    expect(chooseDest([], { focus: null, view, me: null, rand: r })).toBeNull();
  });
});
