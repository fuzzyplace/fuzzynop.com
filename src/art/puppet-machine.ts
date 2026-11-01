/**
 * The claw's state machine for the character. Pure: no DOM, no clock reads — the Puppeteer
 * feeds it events and performs the motion each mode implies.
 *
 *   idle ⇄ walking → grabbed → carried | dragged → landing → idle
 *   carried(to: hold) → dangling → carried → landing
 *
 * `take` is the claw deciding to handle him; its `plan` says why and where. While he's already
 * being handled, only the page (scroll / perch lost) may interrupt — the claw's own whims
 * (edge reset, idle relocation, a press) wait their turn.
 */
export type Mode = 'idle' | 'walking' | 'grabbed' | 'carried' | 'dragged' | 'landing' | 'dangling';
export type Why = 'scroll' | 'lost' | 'edge' | 'relocate' | 'press' | 'enter';
export type Plan = {
  kind: 'carry' | 'tour' | 'drag';
  why: Why;
  to: number; // perch index, -1 = hold him up in the air (no perch to stand on)
  x: number; // px offset along that perch where he's set down
};
export type Machine = { mode: Mode; plan: Plan | null; since: number };
export type Ev =
  | { type: 'move' } // he started walking
  | { type: 'stop' } // he came to rest
  | { type: 'take'; plan: Plan }
  | { type: 'gripped' } // claw closed on his collar
  | { type: 'arrived' } // carry / drag reached its end
  | { type: 'landed' }; // claw let go

/** The page itself (scroll, a perch disappearing) outranks the claw's own ideas. */
export const urgent = (why: Why) => why === 'scroll' || why === 'lost';

export const initial = (now: number, plan: Plan | null): Machine =>
  plan ? { mode: 'carried', plan, since: now } : { mode: 'idle', plan: null, since: now };

/** Returns the same object when the event doesn't apply, so callers can detect a transition by identity. */
export function transition(m: Machine, ev: Ev, now: number): Machine {
  const to = (mode: Mode, plan: Plan | null = m.plan): Machine => ({ mode, plan, since: now });
  switch (m.mode) {
    case 'idle':
      if (ev.type === 'move') return to('walking');
      if (ev.type === 'take') return to('grabbed', ev.plan);
      return m;
    case 'walking':
      if (ev.type === 'stop') return to('idle');
      if (ev.type === 'take') return to('grabbed', ev.plan);
      return m;
    case 'grabbed':
      if (ev.type === 'gripped') return to(m.plan?.kind === 'drag' ? 'dragged' : 'carried');
      if (ev.type === 'take' && urgent(ev.plan.why)) return { ...m, plan: ev.plan }; // keep closing the grip, new destination
      return m;
    case 'carried':
      if (ev.type === 'arrived') return to(m.plan && m.plan.to < 0 ? 'dangling' : 'landing');
      if (ev.type === 'take' && urgent(ev.plan.why)) return to('carried', ev.plan); // retarget mid-air
      return m;
    case 'dragged':
      if (ev.type === 'arrived') return to('landing');
      if (ev.type === 'take' && urgent(ev.plan.why)) return to('carried', { ...ev.plan, kind: 'carry' }); // lift him off the surface
      return m;
    case 'dangling':
      if (ev.type === 'take') return to('carried', { ...ev.plan, kind: ev.plan.kind === 'drag' ? 'carry' : ev.plan.kind }); // already in the claw
      return m;
    case 'landing':
      if (ev.type === 'landed') return to('idle', null);
      if (ev.type === 'take' && urgent(ev.plan.why)) return to('grabbed', ev.plan);
      return m;
  }
}

/** Claw has him (grip closed or closing). */
export const held = (mode: Mode) => mode === 'grabbed' || mode === 'carried' || mode === 'dragged' || mode === 'dangling';
/** Standing on a perch under his own power. */
export const free = (mode: Mode) => mode === 'idle' || mode === 'walking';
