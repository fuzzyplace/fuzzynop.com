/**
 * The character's state machine (v2.7: he's his own agent; the claw is only the visitor's hand).
 * Pure: no DOM, no clock reads — the stage feeds it events and performs the motion each mode implies.
 *
 *   idle ⇄ walking                                  on a surface under his own power
 *   idle | walking ⇄ swatting                        the pointer buzzing round him like a fly
 *   idle | walking → hopping → idle                  his own route: walk / run / jump / climb / fall
 *   idle → exploring → idle                          his own route to something he wants to look at
 *   idle → fidget → idle | sitting → idle            something on the spot / sitting on an edge
 *   most → teleport → idle                           he runs off into ink and gathers himself elsewhere
 *   idle → stunt → idle                              the title stunt, when he feels like showing off
 *   press on him → grabbed → carried(hand) → release → falling → idle
 *
 * The claw exists for one thing: the visitor pressing on him. `take` is that press (plan.kind
 * 'hand', why 'press'); nothing else ever takes him. His own whims (exploring, fidgets, sitting)
 * yield to the user when they come near him (`attend`), to a press, and to his own need to leave
 * (`vanish`: the surface under him is going away). While the user holds him, nothing else does.
 */
export type Mode =
  | StuntMode // ---- stunt ---- (block at the end of this file)
  | 'idle'
  | 'walking'
  | 'swatting'
  | 'grabbed'
  | 'carried'
  | 'falling'
  | 'hopping'
  | 'exploring'
  | 'fidget'
  | 'sitting'
  | 'teleport';
export type Why = 'press';
export type Plan = {
  kind: 'hand'; // the claw follows the pointer until release
  why: Why;
  to: number; // unused (-1): kept so a plan reads like a destination
  x: number;
};
export type Machine = { mode: Mode; plan: Plan | null; since: number };
export type Ev =
  | StuntEv // ---- stunt ----
  | { type: 'move' } // he started walking
  | { type: 'stop' } // he came to rest
  | { type: 'take'; plan: Plan } // the visitor pressed on him: the claw drops in
  | { type: 'gripped' } // claw closed on his collar
  | { type: 'arrived' } // a fall / route / teleport reached its end
  | { type: 'pester' } // pointer buzzing close around him
  | { type: 'clear' } // it went away
  | { type: 'release' } // pointer up: the claw lets go
  | { type: 'hop' } // he set off on a route of his own to another surface
  | { type: 'explore' } // he set off for something he wants to look at
  | { type: 'fidget' } // he started an on-the-spot animation
  | { type: 'done' } // it finished
  | { type: 'sit' } // he sat down
  | { type: 'vanish' } // he runs off into ink (to reappear somewhere else)
  | { type: 'attend' }; // the user came to him: his own whims stop

export const PRESS: Plan = { kind: 'hand', why: 'press', to: -1, x: 0 };

export const initial = (now: number): Machine => ({ mode: 'idle', plan: null, since: now });

/** Returns the same object when the event doesn't apply, so callers can detect a transition by identity. */
export function transition(m: Machine, ev: Ev, now: number): Machine {
  const to = (mode: Mode, plan: Plan | null = m.plan): Machine => ({ mode, plan, since: now });
  if (m.mode === 'stunt' || ev.type === 'stunt') return stuntTransition(m, ev, now); // ---- stunt ----
  const press = ev.type === 'take' && ev.plan.why === 'press';
  switch (m.mode) {
    case 'idle':
      if (ev.type === 'move') return to('walking');
      if (ev.type === 'pester') return to('swatting');
      if (ev.type === 'hop') return to('hopping', null);
      if (ev.type === 'explore') return to('exploring', null);
      if (ev.type === 'fidget') return to('fidget', null);
      if (ev.type === 'sit') return to('sitting', null);
      if (ev.type === 'vanish') return to('teleport', null);
      if (press) return to('grabbed', ev.plan);
      return m;
    case 'exploring':
    case 'fidget':
    case 'sitting':
      if (ev.type === 'attend') return to('idle', null);
      if (ev.type === 'pester') return to('swatting', null);
      if (m.mode === 'exploring' && ev.type === 'arrived') return to('idle', null);
      if (m.mode === 'fidget' && ev.type === 'done') return to('idle', null);
      if (m.mode === 'fidget' && ev.type === 'sit') return to('sitting', null);
      if (ev.type === 'vanish') return to('teleport', null);
      if (press) return to('grabbed', ev.plan);
      return m;
    case 'walking':
      if (ev.type === 'stop') return to('idle');
      if (ev.type === 'pester') return to('swatting');
      if (ev.type === 'hop') return to('hopping', null);
      if (ev.type === 'vanish') return to('teleport', null);
      if (press) return to('grabbed', ev.plan);
      return m;
    case 'swatting':
      if (ev.type === 'clear') return to('idle');
      if (ev.type === 'vanish') return to('teleport', null);
      if (press) return to('grabbed', ev.plan);
      return m;
    case 'grabbed':
      if (ev.type === 'gripped') return to('carried');
      if (ev.type === 'release') return to('falling', null); // let go before the claw closed: he just drops
      return m;
    case 'carried':
      return ev.type === 'release' ? to('falling', null) : m;
    case 'falling':
      if (ev.type === 'arrived') return to('idle', null);
      if (ev.type === 'vanish') return to('teleport', null); // fell out of sight: he'll gather himself back on screen
      if (press) return to('grabbed', ev.plan); // caught mid-fall
      return m;
    case 'hopping':
      if (ev.type === 'arrived') return to('idle', null);
      if (ev.type === 'vanish') return to('teleport', null);
      if (press) return to('grabbed', ev.plan);
      return m;
    case 'teleport':
      if (ev.type === 'arrived') return to('idle', null);
      return m;
  }
}

/** The claw has him (grip closed or closing). */
export const held = (mode: Mode) => mode === 'grabbed' || mode === 'carried';
/** Standing on a surface under his own power, minding the pointer. */
export const free = (mode: Mode) => mode === 'idle' || mode === 'walking' || mode === 'swatting';
/** Busy with his own whims (on a surface, or on his way to something). */
export const own = (mode: Mode) => mode === 'exploring' || mode === 'fidget' || mode === 'sitting';
/** On (or travelling between) surfaces under his own power: not held, not falling, not ink. */
export const afoot = (mode: Mode) => free(mode) || own(mode) || mode === 'hopping';

// ---- stunt ----
/**
 * The title stunt (stunt.ts, played by stuntDriver.ts): from standing idle on the hero ground, when he
 * feels like showing off. The pointer moving doesn't stop it; a press on him does (`take`), and he may
 * finish it with a teleport back down (`vanish`). `done`: he finished on the ground.
 */
export type StuntMode = 'stunt';
export type StuntEv = { type: 'stunt' };
function stuntTransition(m: Machine, ev: Ev, now: number): Machine {
  if (m.mode === 'idle' && ev.type === 'stunt') return { mode: 'stunt', plan: null, since: now };
  if (m.mode !== 'stunt') return m;
  if (ev.type === 'done') return { mode: 'idle', plan: null, since: now };
  if (ev.type === 'vanish') return { mode: 'teleport', plan: null, since: now };
  if (ev.type === 'take' && ev.plan.why === 'press') return { mode: 'grabbed', plan: ev.plan, since: now };
  return m;
}
