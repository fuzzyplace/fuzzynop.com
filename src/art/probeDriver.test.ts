import { describe, expect, it } from 'vitest';
import { rng } from './geometry';
import { BODY, aimAt, bodyBox, chooseWhim, fidgetRecent, heistSpot, overlaps, planBeats, standFor, whimWeights, type Beat } from './probeDriver';
import { PROBE_REACH, isProbeMove, probePose, base, PROBE_MOVES, PROBE_HIT } from './poses';
import type { ProbeKind } from './probe';

const view = { left: 0, right: 1440, top: 0, bottom: 900 };
const scale = 1.85;

describe('heistSpot', () => {
  const cta = { left: 486, right: 616, top: 321, bottom: 378 };
  it('holds him beside the target, hand on it, body clear of text', () => {
    const text = [
      { left: 484, right: 1100, top: 200, bottom: 260 }, // a paragraph above
      { left: 640, right: 900, top: 330, bottom: 360 }, // a label to the right
    ];
    const s = heistSpot({ contact: cta, avoid: [...text, cta], view, minTop: 76, scale, reach: PROBE_REACH.rattle!, prefer: 1 })!;
    expect(s).not.toBeNull();
    expect(s.side).toBe(-1); // the right is blocked by the label: he's on the left
    expect(s.facing).toBe(1);
    const box = bodyBox(s.at, s.facing, scale);
    for (const r of [...text, cta]) expect(overlaps(box, r)).toBe(false);
    // his hand (reach) lands on the target's near edge
    const hand = s.at.x + s.facing * PROBE_REACH.rattle![0] * scale;
    expect(Math.abs(hand - cta.left)).toBeLessThan(4);
  });
  it('never under the header, never off screen', () => {
    const high = { left: 600, right: 640, top: 70, bottom: 100 };
    expect(heistSpot({ contact: high, avoid: [], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: 1 })).toBeNull();
    const edge = { left: 2, right: 30, top: 400, bottom: 430 };
    const s = heistSpot({ contact: edge, avoid: [], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: -1 })!;
    expect(s.side).toBe(1); // no room on the left
    expect(bodyBox(s.at, s.facing, scale).left).toBeGreaterThanOrEqual(8);
  });
  it('prefers the side whose column above is clear (the claw comes down it)', () => {
    const t = { left: 700, right: 740, top: 500, bottom: 535 };
    const above = { left: 500, right: 690, top: 100, bottom: 400 }; // text above the left side
    const s = heistSpot({ contact: t, avoid: [above, t], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: -1 })!;
    expect(s.side).toBe(1);
    expect(s.column).toBe(0);
  });
  it('maxColumn: rules out a spot whose claw line crosses too much text', () => {
    const t = { left: 700, right: 740, top: 500, bottom: 535 };
    const above = { left: 0, right: 1440, top: 100, bottom: 300 };
    expect(heistSpot({ contact: t, avoid: [above, t], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: -1, maxColumn: 40 })).toBeNull();
    expect(heistSpot({ contact: t, avoid: [above, t], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: -1 })).not.toBeNull();
  });
  it('null when boxed in', () => {
    const t = { left: 700, right: 740, top: 500, bottom: 535 };
    const wall = { left: 0, right: 1440, top: 380, bottom: 700 };
    expect(heistSpot({ contact: t, avoid: [wall], view, minTop: 76, scale, reach: PROBE_REACH.prod!, prefer: 1 })).toBeNull();
  });
});

describe('standFor', () => {
  const surf = { left: 188, right: 779, y: 1197, x0: 152, x1: 815 };
  const o = { scale, feet: 26 * scale, from: 500, rand: rng(3) };
  it('a corner: at the end of the edge, facing it', () => {
    const r = standFor('lift', 'poke', { left: 152, right: 176, top: 1197, bottom: 1221 }, surf, { ...o, dir: -1 });
    expect(r.facing).toBe(-1);
    expect(r.x).toBeLessThan(surf.left + 4); // as far out as he may go
    const r2 = standFor('lift', 'poke', { left: 791, right: 815, top: 1197, bottom: 1221 }, surf, { ...o, dir: 1 });
    expect(r2.facing).toBe(1);
    expect(r2.x).toBeGreaterThan(740);
  });
  it('the parked arm: on the plate side of the tip, reaching up toward it', () => {
    const tip = { left: 733, right: 757, top: 1134, bottom: 1158 };
    const r = standFor('twitch', 'handsOn', tip, surf, o);
    expect(r.facing).toBe(1);
    expect(r.x).toBeLessThan(745);
    expect(r.x).toBeGreaterThan(680);
    expect(r.aim).toBeLessThan(-1.2); // ahead and a little up
    expect(r.aim).toBeGreaterThan(-2.6);
  });
  it('looking only: keeps a little distance and faces it', () => {
    const t = { left: 400, right: 440, top: 1260, bottom: 1300 };
    const r = standFor('spin', 'look', t, surf, { ...o, from: 700 });
    expect(r.x).toBeGreaterThan(440);
    expect(r.facing).toBe(-1);
    expect(r.look).toEqual({ x: 420, y: 1280 });
  });
  it('always on the surface', () => {
    for (const kind of ['lift', 'peek', 'twitch', 'tap'] as ProbeKind[]) {
      for (let i = 0; i < 30; i++) {
        const r = standFor(kind, 'poke', { left: 100 + i * 40, right: 140 + i * 40, top: 1100, bottom: 1140 }, surf, { ...o, from: 100 + i * 25 });
        expect(r.x).toBeGreaterThanOrEqual(surf.left);
        expect(r.x).toBeLessThanOrEqual(surf.right);
      }
    }
  });
});

it('aimAt: ahead is -PI/2, up is more negative, down less', () => {
  const c = { x: 0, y: 0 };
  expect(aimAt(c, 1, { x: 200, y: -7 * scale }, scale)).toBeCloseTo(-Math.PI / 2, 2);
  expect(aimAt(c, 1, { x: 100, y: -100 }, scale)).toBeLessThan(-Math.PI / 2);
  expect(aimAt(c, 1, { x: 100, y: 100 }, scale)).toBeGreaterThan(-Math.PI / 2);
  expect(aimAt(c, -1, { x: -200, y: -7 * scale }, scale)).toBeCloseTo(-Math.PI / 2, 2); // mirrored
});

describe('planBeats', () => {
  const plans = (c: Parameters<typeof planBeats>[0], n = 200) => {
    const r = rng(9);
    return Array.from({ length: n }, () => planBeats(c, r));
  };
  const touches = (b: Beat[]) => b.filter((x) => (x.hits ?? []).length > 0);
  it('wary looks: never touches, no shrug', () => {
    for (const b of plans({ kind: 'rattle', action: 'look', win: false, glanceBack: false })) {
      expect(touches(b)).toHaveLength(0);
      expect(b.some((x) => x.kind === 'shrug')).toBe(false);
      expect(b[0].look).toBe('target');
    }
  });
  it('a poke: considers first, touches once with the right move', () => {
    const moves: Record<string, string> = { spin: 'prod', tug: 'tug', lift: 'pick', tap: 'knock' };
    for (const kind of Object.keys(moves) as ProbeKind[]) {
      for (const b of plans({ kind, action: 'poke', win: false, glanceBack: false }, 60)) {
        expect(['consider', 'tilt', 'inspect']).toContain(b[0].kind);
        const t = touches(b);
        expect(t).toHaveLength(1);
        expect(t[0].kind).toBe(moves[kind]);
        expect(b.some((x) => x.kind === 'shrug')).toBe(false);
      }
    }
  });
  it('warm: hands-on, then turns to the visitor with a shrug', () => {
    for (const b of plans({ kind: 'rattle', action: 'handsOn', win: false, glanceBack: true }, 100)) {
      expect(touches(b)[0].kind).toBe('rattle');
      expect(b[b.length - 1]).toMatchObject({ kind: 'shrug', look: 'visitor', face: 'visitor' });
    }
  });
  it('a win: the touch carries the win, he startles and looks closer', () => {
    for (const b of plans({ kind: 'rattle', action: 'handsOn', win: true, glanceBack: true }, 50)) {
      const t = touches(b);
      expect(t).toHaveLength(1);
      expect(t[0].win).toBe(true);
      const i = b.indexOf(t[0]);
      expect(b[i + 1].kind).toBe('flinch');
      expect(b[i + 2].kind).toBe('inspect');
    }
  });
  it('sometimes checks whether he is watched, sometimes feints: not always', () => {
    const all = plans({ kind: 'spin', action: 'poke', win: false, glanceBack: false }, 400);
    const checks = all.filter((b) => b.some((x) => x.kind === 'still' && x.look === 'visitor')).length;
    const feints = all.filter((b) => b.some((x) => x.kind === 'feint')).length;
    expect(checks / all.length).toBeGreaterThan(0.15);
    expect(checks / all.length).toBeLessThan(0.45);
    expect(feints / all.length).toBeGreaterThan(0.2);
    expect(feints / all.length).toBeLessThan(0.5);
  });
  it('opens differently from last time', () => {
    const r = rng(4);
    for (let i = 0; i < 100; i++) {
      const prev = planBeats({ kind: 'lift', action: 'poke', win: false, glanceBack: false }, r)[0].kind;
      const next = planBeats({ kind: 'lift', action: 'poke', win: false, glanceBack: false }, r, [prev])[0].kind;
      expect(next).not.toBe(prev);
    }
  });
});

describe('whims', () => {
  it('no probes when not ready or shaken', () => {
    expect(whimWeights({ band: 'warm', cursor: 'gone', region: 'page', ready: false }).probe).toBe(0);
    expect(whimWeights({ band: 'shaken', cursor: 'gone', region: 'page', ready: true }).probe).toBe(0);
  });
  it('weighted by trust, the pointer and the page', () => {
    const w = (o: Partial<Parameters<typeof whimWeights>[0]>) => whimWeights({ band: 'tolerant', cursor: 'watching', region: 'page', ready: true, ...o }).probe!;
    expect(w({ band: 'warm' })).toBeGreaterThan(w({ band: 'tolerant' }));
    expect(w({ band: 'tolerant' })).toBeGreaterThan(w({ band: 'wary' }));
    expect(w({ cursor: 'gone' })).toBeGreaterThan(w({ cursor: 'near' }));
    expect(w({ band: 'warm', cursor: 'watching' })).toBeGreaterThan(w({ band: 'warm', cursor: 'near' }));
    expect(w({ region: 'footer' })).toBeGreaterThan(w({ region: 'hero' }));
  });
  it('never a probe straight after a probe; explores may repeat', () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) expect(chooseWhim({ band: 'warm', cursor: 'gone', region: 'footer', ready: true, recent: ['probe', 'explore'], rand: r })).toBe('explore');
    const picks = Array.from({ length: 300 }, () => chooseWhim({ band: 'warm', cursor: 'gone', region: 'page', ready: true, recent: ['explore', 'probe'], rand: r }));
    expect(picks.includes('probe')).toBe(true);
    expect(picks.includes('explore')).toBe(true);
  });
  it('fidgets avoid what he just did anywhere', () => {
    expect(fidgetRecent(['crouch', 'probe:spin', 'look'], ['scratch', 'shift'])).toEqual(['crouch', 'scratch', 'shift']);
    expect(fidgetRecent(['sit', 'peek'], ['look'])).toEqual(['look']);
  });
});

describe('probe poses', () => {
  const b = base({ x: 0, lift: 0 }, { x: 0, lift: 0 }, 0);
  it('every move starts and ends at rest and stays finite', () => {
    for (const m of PROBE_MOVES) {
      expect(isProbeMove(m)).toBe(true);
      for (let k = 0; k <= 1.0001; k += 0.05) {
        const o = probePose(m, k, b);
        for (const v of [...o.handL, ...o.handR, o.dx, o.dy, o.head]) expect(Number.isFinite(v)).toBe(true);
      }
      const end = probePose(m, 1, b);
      expect(Math.hypot(end.handR[0] - b.handR[0], end.handR[1] - b.handR[1])).toBeLessThan(0.6);
      expect(Math.abs(end.dx) + Math.abs(end.dy)).toBeLessThan(0.3);
    }
    expect(isProbeMove('look')).toBe(false);
  });
  it('the hand is out at the moment of contact', () => {
    for (const m of ['prod', 'tug', 'rattle'] as const) {
      const at = PROBE_HIT[m]![0];
      const o = probePose(m, at + 0.02, b);
      expect(o.handR[0] + o.dx).toBeGreaterThan(14);
    }
  });
  it('his body box is the one the stage keeps off text', () => {
    expect(BODY.up).toBeGreaterThanOrEqual(43);
    expect(BODY.down).toBeGreaterThanOrEqual(26);
  });
});
