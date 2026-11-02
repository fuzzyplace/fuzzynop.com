import { describe, expect, it } from 'vitest';
import { ARM_FAST, ArmTracker, breathing, footfalls, frameCues, nextBreath, noteCues, plateCues, pokeCues, type PlanLike, type Snap } from './events';
import { SOUNDS } from './mix';

const snap = (o: Partial<Snap> = {}): Snap => ({ mode: 'idle', x: 400, y: 300, hidden: false, band: 'tolerant', patting: false, phase: 0, walk: 0, ...o });
const names = (cs: { name: string }[]) => cs.map((c) => c.name);

describe('footfalls', () => {
  it('counts each foot down, forwards and back, across the wrap', () => {
    expect(footfalls(0.4, 0.6)).toBe(1);
    expect(footfalls(0.9, 0.1)).toBe(1);
    expect(footfalls(0.1, 0.2)).toBe(0);
    expect(footfalls(0.6, 0.4)).toBe(1); // a step back
    expect(footfalls(0.3, 0.3)).toBe(0);
    expect(footfalls(NaN, 0.3)).toBe(0);
  });
});

describe('frameCues', () => {
  it('nothing on the first frame', () => {
    expect(frameCues(null, snap())).toEqual([]);
  });
  it('steps while walking, not in the air, not when the gait has eased off', () => {
    const a = snap({ mode: 'walking', walk: 1, phase: 0.45 });
    expect(names(frameCues(a, { ...a, phase: 0.55 }))).toEqual(['step']);
    expect(frameCues(a, { ...a, phase: 0.55, action: 'jump' }).filter((c) => c.name === 'step')).toEqual([]);
    expect(frameCues({ ...a, walk: 0.1 }, { ...a, walk: 0.1, phase: 0.55 })).toEqual([]);
  });
  it('maps action starts once', () => {
    const a = snap();
    expect(names(frameCues(a, { ...a, action: 'land' }))).toEqual(['land']);
    expect(frameCues({ ...a, action: 'land' }, { ...a, action: 'land' })).toEqual([]);
    expect(names(frameCues(a, { ...a, action: 'sit' }))).toEqual(['sit']);
    expect(names(frameCues(a, { ...a, action: 'flinch' }))).toEqual(['gasp']);
    expect(frameCues(a, { ...a, action: 'look' })).toEqual([]);
  });
  it('teleport: out, then in', () => {
    const a = snap();
    const out = { ...a, mode: 'teleport', ink: { k: 0.1, out: true } };
    expect(names(frameCues(a, out))).toEqual(['inkOut']);
    expect(names(frameCues(out, { ...out, ink: { k: 0.2, out: false } }))).toEqual(['inkIn']);
    expect(frameCues(out, { ...out, ink: { k: 0.5, out: true } })).toEqual([]);
  });
  it('claw: comes down, grips, lets go', () => {
    const a = snap();
    expect(names(frameCues(a, { ...a, mode: 'grabbed' }))).toEqual(['whirr']);
    expect(names(frameCues({ ...a, mode: 'grabbed' }, { ...a, mode: 'carried' }))).toEqual(['click']);
    expect(names(frameCues({ ...a, mode: 'carried' }, { ...a, mode: 'falling' }))).toEqual(['click', 'rustle']);
  });
  it('a pat, a stunt poke; silent while out of sight', () => {
    const a = snap();
    expect(names(frameCues(a, { ...a, patting: true }))).toEqual(['pat']);
    expect(names(frameCues({ ...a, mode: 'stunt' }, { ...a, mode: 'stunt', stunt: 'poke' }))).toEqual(['tap']);
    expect(frameCues({ ...a, hidden: true }, { ...a, hidden: true, action: 'land' })).toEqual([]);
  });
  it('every cue names a real sound', () => {
    for (const k of ['jump', 'climb', 'land', 'swat', 'scratch', 'shift', 'glasses', 'crouch', 'tap', 'duck', 'cower', 'sit', 'wave', 'hop', 'flinch', 'shake', 'lie', 'reach', 'push'])
      for (const c of frameCues(snap(), snap({ action: k }))) expect(SOUNDS).toHaveProperty(c.name);
    for (const k of ['spin', 'lift', 'peek', 'tug', 'rattle', 'twitch', 'tap', 'jiggle', 'flick'])
      for (const win of [false, true]) {
        expect(pokeCues(k, win).length).toBeGreaterThan(0);
        for (const c of pokeCues(k, win)) expect(SOUNDS).toHaveProperty(c.name);
      }
  });
});

describe('notes', () => {
  it('letter play slides; other notes are covered by the frame', () => {
    expect(names(noteCues('letters:carry'))).toEqual(['slide']);
    expect(names(noteCues('letters:stack'))).toEqual(['slide', 'tap']);
    expect(noteCues('flinch')).toEqual([]);
  });
});

describe('breath', () => {
  it('only when still and on screen', () => {
    expect(breathing(snap(), 800, 600)).toBe(true);
    expect(breathing(snap({ mode: 'sitting' }), 800, 600)).toBe(true);
    expect(breathing(snap({ mode: 'walking', walk: 1 }), 800, 600)).toBe(false);
    expect(breathing(snap({ hidden: true }), 800, 600)).toBe(false);
    expect(breathing(snap({ y: 900 }), 800, 600)).toBe(false);
    expect(breathing(null, 800, 600)).toBe(false);
  });
  it('inhale on the rise (first half), exhale on the settle', () => {
    expect(nextBreath(0, 4.4)).toEqual({ inhale: 0, exhale: 2.2 });
    const b = nextBreath(3, 4.4);
    expect(b.inhale).toBeCloseTo(1.4);
    expect(b.exhale).toBeCloseTo(3.6);
    expect(nextBreath(4.4 * 3 + 1, 4.4).exhale).toBeCloseTo(1.2);
  });
});

describe('plateCues', () => {
  const plan: PlanLike = {
    w: 400,
    landed: 1,
    end: 5,
    sheet: { carry: 0.8 },
    groups: [
      { box: { x: 0, w: 100 }, mode: 'carry', t0: 1.2, tW: 1.6, tP: 1.7, tS: 2 },
      { box: { x: 300, w: 100 }, mode: 'deal', t0: 2.2, tW: 2.6, tP: 2.7, tS: 3 },
    ],
  };
  it('forward: slap and puff when the sheet lands', () => {
    expect(names(plateCues(plan, 0.9, 1.05))).toEqual(['slap', 'puff']);
  });
  it('press pans with the piece', () => {
    const [press] = plateCues(plan, 2.65, 2.75);
    expect(press.name).toBe('press');
    expect(press.pan).toBeGreaterThan(0);
    expect(plateCues(plan, 1.65, 1.75)[0].pan).toBeLessThan(0);
  });
  it('backward: the sheet peels off', () => {
    expect(names(plateCues(plan, 1.05, 0.95))).toEqual(['peel']);
  });
  it('no cue twice at a boundary, nothing for no movement or NaN', () => {
    expect(names(plateCues(plan, 0.95, 1))).toEqual(['slap']);
    expect(names(plateCues(plan, 1, 1.05))).toEqual(['puff']);
    expect(plateCues(plan, 1, 1)).toEqual([]);
    expect(plateCues(plan, NaN, 2)).toEqual([]);
  });
  it('a jump plays only its last moment; a fast scrub at most four, spaced', () => {
    expect(plateCues(plan, 0, 5).length).toBe(1);
    const fast = plateCues(plan, 0.7, 2.1);
    expect(fast.length).toBeLessThanOrEqual(4);
    expect(fast.map((c) => c.at)).toEqual(fast.map((_, i) => i * 0.03));
  });
});

describe('ArmTracker', () => {
  it('a slow sway never whirrs', () => {
    const a = new ArmTracker();
    const k = {};
    let hits = 0;
    for (let i = 0; i < 300; i++) if (a.update(k, Math.sin(i / 20) * 8, 0, i / 60)) hits++;
    expect(hits).toBe(0);
  });
  it('a big move whirrs after a moment, then clicks when it stops', () => {
    const a = new ArmTracker();
    const k = {};
    const seen: string[] = [];
    let x = 0;
    for (let i = 0; i < 30; i++) {
      x += (ARM_FAST * 2) / 60;
      const c = a.update(k, x, 0, i / 60);
      if (c) seen.push(c.name);
    }
    for (let i = 30; i < 40; i++) {
      const c = a.update(k, x, 0, i / 60);
      if (c) seen.push(c.name);
    }
    expect(seen[0]).toBe('whirr');
    expect(seen.at(-1)).toBe('click');
    expect(seen.filter((n) => n === 'whirr').length).toBeLessThanOrEqual(2); // retriggers at most every 0.3 s
  });
  it('a long gap (it slept) is not speed', () => {
    const a = new ArmTracker();
    const k = {};
    a.update(k, 0, 0, 0);
    expect(a.update(k, 900, 0, 1)).toBeNull();
  });
});
