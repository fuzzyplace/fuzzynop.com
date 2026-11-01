import { describe, expect, it } from 'vitest';
import { holdSpot, type Box } from './hold';
import { placeSlip } from './TrustLine';

const body = (p: { x: number; y: number }, up: number, down: number, half: number): Box => ({ left: p.x - half, right: p.x + half, top: p.y - up, bottom: p.y + down });
const hits = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('holdSpot', () => {
  const base = { vw: 1440, vh: 900, minTop: 76, up: 90, down: 60, half: 40, pref: { x: 1240, y: 306 } };
  it('keeps the preferred spot when it is clear', () => {
    const p = holdSpot({ ...base, plates: [{ left: 150, right: 800, top: 200, bottom: 700 }] });
    expect(Math.hypot(p.x - 1240, p.y - 306)).toBeLessThan(12);
  });
  it('moves off a plate that sits where he would hang', () => {
    const plate = { left: 600, right: 1300, top: 100, bottom: 800 };
    const p = holdSpot({ ...base, plates: [plate] });
    expect(hits(body(p, 90, 60, 40), plate)).toBe(false);
  });
  it('narrow screen, a plate filling it: hangs in the gap above its top edge, below the header', () => {
    const plate = { left: 16, right: 359, top: 420, bottom: 1200 };
    const p = holdSpot({ ...base, vw: 375, vh: 812, pref: { x: 292, y: 276 }, plates: [plate] });
    const b = body(p, 90, 60, 40);
    expect(hits(b, plate)).toBe(false);
    expect(b.top).toBeGreaterThanOrEqual(76);
  });
});

describe('placeSlip', () => {
  const spot = { x: 300, head: 400, feet: 530, gap: 10, half: 26, top: 76 };
  it('goes above him when it fits below the header', () => {
    const p = placeSlip(spot, 180, 58, 1440);
    expect(p.top + 58).toBeLessThanOrEqual(spot.head - 10);
    expect(p.top).toBeGreaterThanOrEqual(76);
  });
  it('goes beside his head when there is no room above, and stays below the header and on screen', () => {
    const p = placeSlip({ ...spot, x: 340, head: 100, feet: 230 }, 180, 58, 375);
    expect(p.top).toBeGreaterThanOrEqual(76);
    expect(p.left).toBeGreaterThanOrEqual(16);
    expect(p.left + 180).toBeLessThanOrEqual(375 - 16);
    expect(p.top + 58).toBeLessThanOrEqual(230); // above the surface he stands on
  });
});
