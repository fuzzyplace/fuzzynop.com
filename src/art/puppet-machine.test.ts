import { describe, expect, it } from 'vitest';
import { initial, transition, type Ev, type Machine, type Plan } from './puppet-machine';

const plan = (p: Partial<Plan> = {}): Plan => ({ kind: 'carry', why: 'edge', to: 0, x: 100, ...p });
const run = (m: Machine, evs: Ev[]) => evs.reduce((acc, ev, i) => transition(acc, ev, i + 1), m);

describe('puppet machine', () => {
  it('walks and stops', () => {
    const m = run(initial(0, null), [{ type: 'move' }]);
    expect(m.mode).toBe('walking');
    expect(transition(m, { type: 'stop' }, 9).mode).toBe('idle');
  });

  it('edge reset: grabbed → carried → landing → idle', () => {
    const modes: string[] = [];
    let m = initial(0, null);
    for (const ev of [{ type: 'move' }, { type: 'take', plan: plan() }, { type: 'gripped' }, { type: 'arrived' }, { type: 'landed' }] as Ev[]) {
      m = transition(m, ev, 1);
      modes.push(m.mode);
    }
    expect(modes).toEqual(['walking', 'grabbed', 'carried', 'landing', 'idle']);
    expect(m.plan).toBeNull();
  });

  it('a drag plan goes through dragged', () => {
    const m = run(initial(0, null), [{ type: 'take', plan: plan({ kind: 'drag', why: 'relocate' }) }, { type: 'gripped' }]);
    expect(m.mode).toBe('dragged');
    expect(transition(m, { type: 'arrived' }, 5).mode).toBe('landing');
  });

  it('no perch: carried to the hold → dangling → carried back down', () => {
    let m = run(initial(0, null), [{ type: 'take', plan: plan({ why: 'lost', to: -1 }) }, { type: 'gripped' }, { type: 'arrived' }]);
    expect(m.mode).toBe('dangling');
    m = transition(m, { type: 'take', plan: plan({ why: 'scroll', to: 2 }) }, 9);
    expect(m.mode).toBe('carried');
    expect(m.plan?.to).toBe(2);
  });

  it("the claw's whims don't interrupt a handling; scroll does", () => {
    const m = run(initial(0, null), [{ type: 'take', plan: plan({ kind: 'tour', why: 'relocate' }) }, { type: 'gripped' }]);
    expect(transition(m, { type: 'take', plan: plan({ why: 'edge' }) }, 9)).toBe(m);
    const s = transition(m, { type: 'take', plan: plan({ why: 'scroll', to: 3 }) }, 9);
    expect(s.mode).toBe('carried');
    expect(s.plan?.to).toBe(3);
  });

  it('a scroll mid-drag lifts him into a carry', () => {
    const m = run(initial(0, null), [{ type: 'take', plan: plan({ kind: 'drag', why: 'relocate' }) }, { type: 'gripped' }, { type: 'take', plan: plan({ kind: 'drag', why: 'scroll', to: 1 }) }]);
    expect(m.mode).toBe('carried');
    expect(m.plan?.kind).toBe('carry');
  });

  it('ignores events that do not apply (same object)', () => {
    const m = initial(0, null);
    expect(transition(m, { type: 'arrived' }, 1)).toBe(m);
    expect(transition(m, { type: 'gripped' }, 1)).toBe(m);
  });
});
