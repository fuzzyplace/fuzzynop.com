import { describe, expect, it } from 'vitest';
import { chooseDest, hopDur, hopPhase, startHop, type Spot } from './teleport';

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
