/**
 * The claw's state machine for the character. Pure: no DOM, no clock reads — the Puppeteer
 * feeds it events and performs the motion each mode implies.
 *
 *   idle ⇄ walking → grabbed → carried | dragged → landing → idle
 *   carried(to: hold) → dangling → carried → landing
 *   idle | walking ⇄ swatting (the pointer buzzing round him like a fly)
 *   press on him → grabbed → carried(hand: the claw follows the pointer) → release → falling → idle
 *   idle | walking → hopping (his own route: walk / jump / climb / fall between perches) → idle
 *   idle → fidget (an on-the-spot idle animation, or what he does at a point of interest) → idle
 *   idle → exploring (his own route to a point of interest, when the pointer's been quiet) → idle
 *   idle → sitting (legs over an edge) → idle
 *
 * `take` is the claw deciding to handle him; its `plan` says why and where. While he's already
 * being handled, only the page (scroll / perch lost) may interrupt — the claw's own whims
 * (edge reset, idle relocation) wait their turn. While the user holds him (`hand`), nothing does.
 * His own whims (exploring, fidgets, sitting) yield to the user at once (`attend`: the pointer
 * moved, a tap, a scroll), to a press on him, and to the page; never to the claw's whims.
 */
export type Mode =
  | StuntMode // ---- stunt ---- (block at the end of this file)
  | 'idle'
  | 'walking'
  | 'swatting'
  | 'grabbed'
  | 'carried'
  | 'dragged'
  | 'landing'
  | 'dangling'
  | 'falling'
  | 'hopping'
  | 'exploring'
  | 'fidget'
  | 'sitting';
export type Why = 'scroll' | 'lost' | 'edge' | 'relocate' | 'press' | 'enter';
export type Plan = {
  kind: 'carry' | 'tour' | 'drag' | 'hand'; // hand = the claw follows the pointer until release
  why: Why;
  to: number; // perch index, -1 = hold him up in the air (no perch to stand on)
  x: number; // px offset along that perch where he's set down
};
export type Machine = { mode: Mode; plan: Plan | null; since: number };
export type Ev =
  | StuntEv // ---- stunt ----
  | { type: 'move' } // he started walking
  | { type: 'stop' } // he came to rest
  | { type: 'take'; plan: Plan }
  | { type: 'gripped' } // claw closed on his collar
  | { type: 'arrived' } // carry / drag / fall reached its end
  | { type: 'landed' } // claw let go
  | { type: 'pester' } // pointer buzzing close around him
  | { type: 'clear' } // it went away
  | { type: 'release' } // pointer up while the claw holds him by hand
  | { type: 'hop' } // he set off on a route of his own to another perch
  | { type: 'explore' } // he set off for a point of interest
  | { type: 'fidget' } // he started an on-the-spot animation
  | { type: 'done' } // it finished
  | { type: 'sit' } // he sat down
  | { type: 'attend' }; // the user is back (pointer moved, tap, scroll): his own whims stop

/** The page itself (scroll, a perch disappearing) outranks the claw's own ideas. */
export const urgent = (why: Why) => why === 'scroll' || why === 'lost';

export const initial = (now: number, plan: Plan | null): Machine =>
  plan ? { mode: 'carried', plan, since: now } : { mode: 'idle', plan: null, since: now };

/** Returns the same object when the event doesn't apply, so callers can detect a transition by identity. */
export function transition(m: Machine, ev: Ev, now: number): Machine {
  const to = (mode: Mode, plan: Plan | null = m.plan): Machine => ({ mode, plan, since: now });
  const byHand = m.plan?.kind === 'hand'; // the user has him: the page doesn't get a say until release
  if (m.mode === 'stunt' || ev.type === 'stunt') return stuntTransition(m, ev, now); // ---- stunt ----
  switch (m.mode) {
    case 'idle':
      if (ev.type === 'move') return to('walking');
      if (ev.type === 'pester') return to('swatting');
      if (ev.type === 'hop') return to('hopping', null);
      if (ev.type === 'explore') return to('exploring', null);
      if (ev.type === 'fidget') return to('fidget', null);
      if (ev.type === 'sit') return to('sitting', null);
      if (ev.type === 'take') return to('grabbed', ev.plan);
      return m;
    case 'exploring':
    case 'fidget':
    case 'sitting':
      if (ev.type === 'attend') return to('idle', null);
      if (ev.type === 'pester') return to('swatting', null);
      if (m.mode === 'exploring' && ev.type === 'arrived') return to('idle', null);
      if (m.mode === 'fidget' && ev.type === 'done') return to('idle', null);
      if (m.mode === 'fidget' && ev.type === 'sit') return to('sitting', null);
      if (ev.type === 'take' && (urgent(ev.plan.why) || ev.plan.why === 'press')) return to('grabbed', ev.plan); // the claw's whims wait
      return m;
    case 'walking':
      if (ev.type === 'stop') return to('idle');
      if (ev.type === 'pester') return to('swatting');
      if (ev.type === 'hop') return to('hopping', null);
      if (ev.type === 'take') return to('grabbed', ev.plan);
      return m;
    case 'swatting':
      if (ev.type === 'clear') return to('idle');
      if (ev.type === 'take') return to('grabbed', ev.plan);
      return m;
    case 'grabbed':
      if (ev.type === 'gripped') return to(m.plan?.kind === 'drag' ? 'dragged' : 'carried');
      if (ev.type === 'take' && urgent(ev.plan.why) && !byHand) return { ...m, plan: ev.plan }; // keep closing the grip, new destination
      return m;
    case 'carried':
      if (byHand) return ev.type === 'release' ? to('falling', null) : m;
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
      if (ev.type === 'take' && (urgent(ev.plan.why) || ev.plan.why === 'press')) return to('grabbed', ev.plan);
      return m;
    case 'falling':
      if (ev.type === 'arrived') return to('idle', null);
      if (ev.type === 'take' && ev.plan.why === 'press') return to('grabbed', ev.plan); // caught mid-fall
      return m;
    case 'hopping':
      if (ev.type === 'arrived') return to('idle', null);
      if (ev.type === 'take' && (urgent(ev.plan.why) || ev.plan.why === 'press')) return to('grabbed', ev.plan); // only the page or the user stops him
      return m;
  }
}

/** Claw has him (grip closed or closing). */
export const held = (mode: Mode) => mode === 'grabbed' || mode === 'carried' || mode === 'dragged' || mode === 'dangling';
/** Standing on a perch under his own power, minding the pointer. */
export const free = (mode: Mode) => mode === 'idle' || mode === 'walking' || mode === 'swatting';
/** Busy with his own whims (on a perch, or on his way to one). */
export const own = (mode: Mode) => mode === 'exploring' || mode === 'fidget' || mode === 'sitting';
/** On (or travelling between) perches under his own power: not held, not falling. */
export const afoot = (mode: Mode) => free(mode) || own(mode) || mode === 'hopping';

// ---- stunt ----
/**
 * The title stunt (stunt.ts, played by stuntDriver.ts): once per page load, from standing idle on the
 * hero ground. Not his whim (the pointer moving doesn't stop it), but any `take` does: a press on him,
 * the page (scroll), or the claw fetching him when it's over. `done`: he finished on the ground.
 */
export type StuntMode = 'stunt';
export type StuntEv = { type: 'stunt' };
function stuntTransition(m: Machine, ev: Ev, now: number): Machine {
  if (m.mode === 'idle' && ev.type === 'stunt') return { mode: 'stunt', plan: null, since: now };
  if (m.mode !== 'stunt') return m;
  if (ev.type === 'done') return { mode: 'idle', plan: null, since: now };
  if (ev.type === 'take') return { mode: 'grabbed', plan: ev.plan, since: now };
  return m;
}
