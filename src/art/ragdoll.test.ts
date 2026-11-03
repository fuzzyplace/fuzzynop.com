import { describe, expect, it } from 'vitest';
import { createRagdoll, ragSettled, stepRagdoll } from './ragdoll';

const DT = 1 / 60;

describe('ragdoll', () => {
  it('hanging still stays at rest', () => {
    const rd = createRagdoll();
    let pose = stepRagdoll(rd, { x: 0, y: 0 }, DT, 1);
    for (let i = 0; i < 60; i++) pose = stepRagdoll(rd, { x: 0, y: 0 }, DT, 1);
    expect(Math.abs(pose.torso)).toBeLessThan(1e-6);
    expect(ragSettled(rd)).toBe(true);
  });

  it('yanked right, the body trails left (+ angle), then settles', () => {
    const rd = createRagdoll();
    stepRagdoll(rd, { x: 0, y: 0 }, DT, 1);
    let x = 0;
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      x += 12; // ~720 px/s
      peak = Math.max(peak, stepRagdoll(rd, { x, y: 0 }, DT, 1).torso);
    }
    expect(peak).toBeGreaterThan(0.05);
    for (let i = 0; i < 600; i++) stepRagdoll(rd, { x, y: 0 }, DT, 1);
    expect(Math.abs(rd.torso.a)).toBeLessThan(0.01);
  });

  it('respects joint limits under violent motion', () => {
    const rd = createRagdoll();
    for (let i = 0; i < 300; i++) {
      const p = stepRagdoll(rd, { x: Math.sin(i * 0.9) * 400, y: Math.cos(i * 1.3) * 300 }, DT, 1.85);
      expect(Math.abs(p.torso)).toBeLessThanOrEqual(1.35 + 1e-9);
      expect(Math.abs(p.legL)).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(Math.abs(p.armR)).toBeLessThanOrEqual(2.4 + 1e-9);
      expect(Math.abs(p.head)).toBeLessThanOrEqual(0.45 + 1e-9);
      expect(Number.isFinite(p.torso)).toBe(true);
    }
  });

  it('a long frame does not blow up', () => {
    const rd = createRagdoll();
    stepRagdoll(rd, { x: 0, y: 0 }, DT, 1);
    const p = stepRagdoll(rd, { x: 2000, y: -900 }, 2, 1);
    expect(Number.isFinite(p.torso) && Math.abs(p.torso) <= 1.35).toBe(true);
  });
});
