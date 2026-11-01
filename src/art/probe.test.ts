import { describe, expect, it } from 'vitest';
import { rng } from './geometry';
import { actionFor, chooseProbe, COOLDOWN, CTA_MAX, type ProbeKind, type ProbeState, type ProbeTarget } from './probe';

const rect = (x: number, y = 1000) => ({ left: x, right: x + 40, top: y, bottom: y + 40 });
const T: ProbeTarget[] = [
  { id: 'badge', kind: 'spin', rect: rect(100), reach: 'top', winnable: true },
  { id: 'corner', kind: 'lift', rect: rect(300), reach: 'top' },
  { id: 'node', kind: 'tug', rect: rect(500), reach: 'side' },
  { id: 'cta', kind: 'rattle', rect: rect(700), reach: 'side', winnable: true },
  { id: 'edge', kind: 'peek', rect: rect(900), reach: 'top' },
  { id: 'arm', kind: 'twitch', rect: rect(1100), reach: 'dangle' },
  { id: 'footer', kind: 'tap', rect: rect(1300), reach: 'top' },
];
const st = (o: Partial<ProbeState> = {}): ProbeState => ({ now: 1000, band: 'warm', full: false, findsSinceProbe: 2, recentKinds: [], ctaProbes: 0, ...o });
const many = (targets: ProbeTarget[], s: ProbeState, n = 400) => {
  const r = rng(11);
  return Array.from({ length: n }, () => chooseProbe(targets, s, r));
};

describe('daring by band', () => {
  it('shaken never probes; wary only looks', () => {
    expect(many(T, st({ band: 'shaken' })).every((c) => c === null)).toBe(true);
    const w = many(T, st({ band: 'wary' }));
    expect(w.every((c) => c && c.action === 'look' && !c.win && !c.glanceBack)).toBe(true);
  });
  it('tolerant: small pokes only, no glance back', () => {
    const c = many(T, st({ band: 'tolerant' }));
    expect(new Set(c.map((x) => x!.target.kind))).toEqual(new Set(['spin', 'lift', 'tug', 'tap']));
    expect(c.every((x) => x!.action === 'poke' && !x!.glanceBack)).toBe(true);
  });
  it('warm: hands-on too, and glances back', () => {
    const c = many(T, st());
    const kinds = new Set(c.map((x) => x!.target.kind));
    for (const k of ['rattle', 'peek', 'twitch'] as ProbeKind[]) expect(kinds.has(k)).toBe(true);
    expect(c.every((x) => x!.glanceBack)).toBe(true);
    expect(actionFor('rattle', 'warm')).toBe('handsOn');
    expect(actionFor('rattle', 'tolerant')).toBeNull();
  });
});

describe('caps', () => {
  it('needs 2 finds since the last probe', () => {
    expect(many(T, st({ findsSinceProbe: 1 })).every((c) => c === null)).toBe(true);
  });
  it('per-target cooldown', () => {
    const cooled = T.map((t) => ({ ...t, lastPoked: 1000 - COOLDOWN + 5 }));
    expect(chooseProbe(cooled, st())).toBeNull();
    const ok = T.map((t) => ({ ...t, lastPoked: 1000 - COOLDOWN - 1 }));
    expect(chooseProbe(ok, st())).not.toBeNull();
  });
  it('CTA at most twice a session', () => {
    const c = many(T, st({ ctaProbes: CTA_MAX }));
    expect(c.some((x) => x!.target.kind === 'rattle')).toBe(false);
  });
  it('no repeat of the last 3 kinds', () => {
    const c = many(T, st({ recentKinds: ['tap', 'spin', 'tug', 'lift'] }));
    const kinds = new Set(c.map((x) => x!.target.kind));
    for (const k of ['spin', 'tug', 'lift'] as ProbeKind[]) expect(kinds.has(k)).toBe(false);
    expect(kinds.has('tap')).toBe(true); // 4th back is allowed again
  });
});

describe('wins', () => {
  it('only at full trust, only on winnable targets, roughly 15%', () => {
    expect(many(T, st()).some((c) => c!.win)).toBe(false);
    const c = many(T, st({ full: true }), 4000);
    const wins = c.filter((x) => x!.win);
    expect(wins.every((x) => x!.target.winnable)).toBe(true);
    const winnable = c.filter((x) => x!.target.winnable).length;
    expect(wins.length / winnable).toBeGreaterThan(0.1);
    expect(wins.length / winnable).toBeLessThan(0.2);
  });
});

it('prefers nearer targets', () => {
  const c = many(T, st({ from: { x: 100, y: 1000 } }), 2000);
  const near = c.filter((x) => x!.target.id === 'badge').length;
  const far = c.filter((x) => x!.target.id === 'footer').length;
  expect(near).toBeGreaterThan(far);
});

it('bias scales a target (0 rules it out)', () => {
  const biased = T.map((t) => (t.id === 'badge' ? { ...t, bias: 0 } : t.id === 'corner' ? { ...t, bias: 4 } : t));
  const c = many(biased, st({ band: 'tolerant' }), 2000);
  expect(c.some((x) => x!.target.id === 'badge')).toBe(false);
  const corner = c.filter((x) => x!.target.id === 'corner').length;
  expect(corner / c.length).toBeGreaterThan(0.5);
});
