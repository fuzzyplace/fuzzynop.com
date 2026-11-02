import { describe, expect, it } from 'vitest';
import { PRESS, afoot, free, held, initial, own, transition, type Ev, type Machine, type Mode } from './puppet-machine';

const run = (m: Machine, evs: Ev[]) => evs.reduce((acc, ev, i) => transition(acc, ev, i + 1), m);
const take: Ev = { type: 'take', plan: PRESS };
const MODES: Mode[] = ['idle', 'walking', 'swatting', 'grabbed', 'carried', 'falling', 'hopping', 'exploring', 'fidget', 'sitting', 'teleport', 'stunt'];

describe('puppet machine', () => {
  it('walks and stops', () => {
    const m = run(initial(0), [{ type: 'move' }]);
    expect(m.mode).toBe('walking');
    expect(transition(m, { type: 'stop' }, 9).mode).toBe('idle');
  });

  it('ignores events that do not apply (same object)', () => {
    const m = initial(0);
    expect(transition(m, { type: 'arrived' }, 1)).toBe(m);
    expect(transition(m, { type: 'gripped' }, 1)).toBe(m);
  });

  it('pointer buzzing: swatting until it clears', () => {
    const m = run(initial(0), [{ type: 'move' }, { type: 'pester' }]);
    expect(m.mode).toBe('swatting');
    expect(transition(m, { type: 'clear' }, 9).mode).toBe('idle');
  });

  it('the claw only ever comes for a press: grabbed → carried by hand → release → falling → idle', () => {
    let m = run(initial(0), [take, { type: 'gripped' }]);
    expect(m.mode).toBe('carried');
    expect(m.plan?.kind).toBe('hand');
    expect(transition(m, { type: 'arrived' }, 5)).toBe(m);
    expect(transition(m, { type: 'vanish' }, 5)).toBe(m); // in your hand he stays in your hand
    m = transition(m, { type: 'release' }, 6);
    expect(m.mode).toBe('falling');
    expect(m.plan).toBeNull();
    expect(transition(m, { type: 'arrived' }, 7).mode).toBe('idle');
  });

  it('let go before the claw closed: he drops', () => {
    expect(run(initial(0), [take, { type: 'release' }]).mode).toBe('falling');
  });

  it('a press takes him from anything he does on his own', () => {
    for (const ev of [{ type: 'move' }, { type: 'pester' }, { type: 'hop' }, { type: 'explore' }, { type: 'fidget' }, { type: 'sit' }, { type: 'stunt' }] as Ev[]) {
      expect(transition(run(initial(0), [ev]), take, 9).mode).toBe('grabbed');
    }
    expect(transition(run(initial(0), [take, { type: 'gripped' }, { type: 'release' }]), take, 9).mode).toBe('grabbed'); // caught mid-fall
  });

  it('nothing but a press puts him in the claw', () => {
    const others: Ev[] = [{ type: 'move' }, { type: 'stop' }, { type: 'arrived' }, { type: 'pester' }, { type: 'clear' }, { type: 'hop' }, { type: 'explore' }, { type: 'fidget' }, { type: 'done' }, { type: 'sit' }, { type: 'vanish' }, { type: 'attend' }, { type: 'stunt' }, { type: 'release' }];
    for (const mode of MODES) {
      if (held(mode)) continue;
      for (const ev of others) expect(held(transition({ mode, plan: null, since: 0 }, ev, 1).mode)).toBe(false);
    }
  });

  it('teleport: from his own modes, a fall or a route; arrives idle', () => {
    for (const ev of [{ type: 'move' }, { type: 'explore' }, { type: 'fidget' }, { type: 'sit' }, { type: 'hop' }, { type: 'stunt' }] as Ev[]) {
      expect(transition(run(initial(0), [ev]), { type: 'vanish' }, 9).mode).toBe('teleport');
    }
    expect(transition(initial(0), { type: 'vanish' }, 1).mode).toBe('teleport');
    const t = transition(initial(0), { type: 'vanish' }, 1);
    expect(transition(t, take, 2)).toBe(t); // ink can't be picked up
    expect(transition(t, { type: 'arrived' }, 2).mode).toBe('idle');
  });

  it('his own whims: idle → exploring → idle → fidget → idle; idle → sitting', () => {
    let m = run(initial(0), [{ type: 'explore' }]);
    expect(m.mode).toBe('exploring');
    m = run(m, [{ type: 'arrived' }, { type: 'fidget' }]);
    expect(m.mode).toBe('fidget');
    expect(transition(m, { type: 'done' }, 9).mode).toBe('idle');
    expect(transition(initial(0), { type: 'sit' }, 1).mode).toBe('sitting');
  });

  it('the user coming to him outranks his whims', () => {
    for (const mode of ['explore', 'fidget', 'sit'] as const) {
      const m = transition(initial(0), { type: mode }, 1);
      expect(own(m.mode)).toBe(true);
      expect(transition(m, { type: 'attend' }, 2).mode).toBe('idle');
      expect(transition(m, { type: 'pester' }, 2).mode).toBe('swatting');
    }
  });

  it('whims only start from idle', () => {
    const walking = transition(initial(0), { type: 'move' }, 1);
    for (const ev of [{ type: 'explore' }, { type: 'fidget' }, { type: 'sit' }] as Ev[]) expect(transition(walking, ev, 2)).toBe(walking);
  });

  it('mode groups', () => {
    expect(free('exploring')).toBe(false);
    expect(afoot('exploring') && afoot('sitting') && afoot('hopping') && afoot('idle')).toBe(true);
    expect(afoot('carried') || afoot('falling') || afoot('teleport')).toBe(false);
    expect(held('sitting')).toBe(false);
  });
});

// ---- stunt ----
describe('stunt mode', () => {
  it('starts only from idle; a press ends it; done = idle; vanish = teleport down', () => {
    const s = transition(initial(0), { type: 'stunt' }, 1);
    expect(s.mode).toBe('stunt');
    expect(transition({ mode: 'walking', plan: null, since: 0 }, { type: 'stunt' }, 1).mode).toBe('walking');
    expect(transition(s, { type: 'attend' }, 2)).toBe(s); // the pointer moving doesn't stop it
    expect(transition(s, { type: 'pester' }, 2)).toBe(s);
    expect(transition(s, take, 2).mode).toBe('grabbed');
    expect(transition(s, { type: 'done' }, 2).mode).toBe('idle');
    expect(transition(s, { type: 'vanish' }, 2).mode).toBe('teleport');
    expect(afoot('stunt') || held('stunt') || own('stunt') || free('stunt')).toBe(false);
  });
});
