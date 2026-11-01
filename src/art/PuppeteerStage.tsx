import { useReducedMotion } from './reducedMotion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character, STRIDE, type Action, type CharacterHandle, type Pose } from './Character';
import { choosePoi, collectPois, remember, type Poi, type Scene, type SceneSurface } from './explore';
import { KICK, QUIET, SIT_FOR, decideIdle, idleDelay, kickAt, kickDelay, type Fidget } from './idle';
import { noteRecent, pickVaried } from './moodVariety';
import { ACT_DUR, FLIP, TAP_AT, TAP_HOP, TURN } from './poses';
import { holdSpot } from './hold';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { LIMITS, planRoute, sampleMove, type Move, type Surface } from './navigate';
import { afoot, free, held, initial, own, transition, type Ev, type Machine, type Plan } from './puppet-machine';
import { createRagdoll, primeRagdoll, stepRagdoll, type RagPose, type Ragdoll } from './ragdoll';
import { onLayout, setAttr, ticker, view as viewport } from './ticker';
import { TrustLine, type TrustLineHandle } from './TrustLine';
import {
  FAR,
  FULL,
  RANK,
  SWAT_COST,
  advance,
  band,
  classify,
  freeze,
  initTrust,
  keepGap,
  nextChange,
  nudge,
  observe,
  pesterDist,
  scare,
  tap,
  thaw,
  uneasy,
  type Band,
  type Cond,
  type Trust,
} from './trust';
import { WALK, clampTo, lookAngle, perchExtent, settledWalk, stepWalk, type Extent, type WalkState } from './walk';

/**
 * A ceiling-rail arm that handles the character. Perches = elements with [data-perch] (fraction
 * along their top edge where he's set down); optional [data-perch-span] = px half-width he may
 * walk. A plate only becomes a perch once it's printed ([data-printed="1"]).
 *
 * Behaviour is an explicit state machine (`puppet-machine.ts`):
 *   idle ⇄ walking → grabbed → carried | dragged → landing → idle, plus dangling with no perch.
 * - On a perch he walks toward the pointer's x (mouse: live; touch: last tap).
 * - Edge reset: pointer beyond the perch and he's stuck at its end for a beat → the claw takes
 *   him by the collar and sets him back near the middle; he then waits until the pointer comes
 *   back over his perch (or a few seconds pass) before following again.
 * - Idle relocation: 8–15 s without a big pointer move → the claw carries him to another visible
 *   perch, gives him a short dangle tour, or drags him along the surface, feet scraping.
 * - Scroll: carried to the perch nearest the reading line.
 * - Pointer buzzing close round him (mouse): he backs off and swats at it like a fly.
 * - Pressing on him: the claw picks him up and follows the pointer; he hangs from the collar as a
 *   ragdoll (ragdoll.ts). Let go and he falls onto the printed perch below (or the nearest one).
 * - Pointer resting over another printed plate: he makes his own way there — walk, jump, climb,
 *   drop (navigate.ts) — if he can; otherwise he stays put and the claw may move him later.
 * - Left alone (idle.ts): he fidgets — looks round, scratches his head, shifts his weight, pushes his
 *   glasses up, crouches, looks up at the claw. Once the pointer's been quiet a few seconds he
 *   explores (explore.ts): picks a point of interest (another perch, a plate's edge, a hung stone, an
 *   ink splatter, a plate being printed, a heading), makes his way there and does something with it —
 *   peeks over the edge, hops up and taps the stone so it swings, crouches over the ink, watches the
 *   arm print, stands beside the heading. After a few finds he sits on an edge, legs dangling. Any
 *   pointer move, tap or scroll and he drops it and attends to you. The claw's idle relocation is now
 *   one of the things that can happen when he's left alone, not the default.
 * - Turns are an instant flip of facing sold by a short pivot (poses.ts `turnPose`), never a squash.
 * - A plate's print arm swinging close past him: he ducks.
 * - Trust (trust.ts): he starts wary of the pointer (keeps his distance, swats, glances round). A calm,
 *   patient pointer slowly earns trust: he stops swatting, lets it closer, comes to it, looks up at it
 *   and, when it rests, sits down beside it. Rough movement and chasing cost a little; picking him up
 *   costs a lot: he's shaken for a while (trembles, cowers, keeps away, startles early, doesn't wander).
 *   The first time he fully trusts you in a session the hidden line appears (TrustLine). Never explained.
 *   Trust is arithmetic over elapsed time, so it changes while the loop sleeps; a timer wakes the loop
 *   when it next crosses a band. It survives carries and perches, and a reload (sessionStorage).
 * - Moods read at a glance (poses.ts `applyMood`): wary he hunches and his head follows the pointer;
 *   tolerant he stands up straight, tilts his head, steps toward what he's looking at; warm he comes
 *   to you, looks up, waves, sits beside a resting pointer; shaken he trembles and cowers.
 * - Turning points: crossing into tolerant / warm he stops dead, a beat, tilts his head at the pointer,
 *   then takes one deliberate step toward it. Losing trust (rough, chasing, a swat) makes him flinch.
 * - A pat: the pointer resting / drifting just over his head and he pushes up into it. Wary, he ducks
 *   away the first time and accepts the second. Set down somewhere new while he trusts you, he greets
 *   you. Touch: gentle taps near him and staying on a section build trust. Thinking tells: a glance
 *   at where he's going before he sets off, blink-like dips, nothing twice in a row (moodVariety.ts).
 *
 * Perch rects are cached in document space; a frame does no layout reads (choosing a point of
 * interest measures decor once, every few seconds at most). The loop sleeps once he's idle and
 * settled — sitting still counts — and timers wake it for the next fidget / kick / decision; scroll,
 * layout, print-state and pointer input wake it too.
 *
 * Loaded on demand: `Puppeteer` (Puppeteer.tsx) mounts this after the first paint, when the main
 * thread goes idle, so the hero's text paints first.
 */
const TRANSIT = 1.25; // s, scroll carry
const GRAB = 0.32; // s for the claw to close on his collar
const LAND = 0.3; // s for it to let go
const EDGE_BEAT = 0.7; // s stuck at an edge before the claw says no
const FOLLOW_HOLD = 5; // s max he ignores the pointer after an edge reset
const BIG_MOVE = 48; // px of pointer travel that counts as attention
const FEET = 26; // character units from origin to feet
const COLLAR = { x: -4, y: -12 };
const MARGIN = 36; // px kept clear at each end of a perch
const LOOK = 1.8; // s he keeps glancing at the pointer after it last moved
const HOVER = 70; // px from him where the idle claw hangs
const PESTER = 60; // px: pointer this close round him and he swats at it
const SWAT = 0.42; // s per swat
const DWELL = 0.7; // s the pointer rests over another plate before he sets off for it
const GRAB_HAND = 0.16; // s: the claw snaps onto him when you press
const GRAVITY = 2200; // px/s², falls
const HEADER = 64; // px of fixed header at the top of the viewport
const TALL = 70; // character units from the top of his head (hair) to his feet
const CLEAR = 12; // px kept between the header and the top of his head
const ATTEND = 6; // px of pointer travel that means the user is around (his own whims stop)
const EXPLORE_PACE = 0.72; // exploring walk speed vs. his usual
const SIT_REST = 2.5; // s the pointer rests beside him (fully trusted) before he sits down by it
const SIT_BESIDE: [number, number] = [40, 70]; // s he stays sat by it if it doesn't move
const FACE_GAP = 0.7; // s after an about-face before he turns to the pointer again
const NODE_LIT = 1.6; // s a circuit node's trace stays lit after he taps the edge above it
const NODE_TAP = 0.45; // progress of his crouch at which his hand meets the edge
// moods and reactions
const TURN_GAP = 6; // s between turning points (trust hovering on a band edge doesn't repeat it)
const TURN_WAIT = 4; // s a turning point waits for him to be free (busy, carried) before it's dropped
const FLINCH_GAP = 2.5; // s between flinches
const PAT_LO = 14; // px above the top of his head where a pat zone starts
const PAT_HI = 85; // … and ends
const PAT_HALF = 22; // character units either side of his head that count as "over him"
const PAT_SPEED = 260; // px/s: slow enough to be a hand, not a swipe
const DODGE_FOR = 1.4; // s after ducking a first pat (wary) before a second try is accepted
const LINGER_AFTER = 2.5; // s without scrolling (touch) before staying on a section counts
const SAVE_KEY = 'fz:trust';
/** How he holds himself in each band (poses.ts `Mood`, less the pat). */
const POSTURE: Record<Band, { hunch: number; open: number }> = {
  shaken: { hunch: 1.5, open: 0 },
  wary: { hunch: 1, open: 0 },
  tolerant: { hunch: 0, open: 0.5 },
  warm: { hunch: 0, open: 1 },
};
/** Greetings when he's set down somewhere new and trusts you (picked without repeats). */
const GREET: Record<string, Action[]> = { wave: ['wave'], hop: ['hop', 'wave'], tilt: ['tilt', 'wave'], up: ['hop', 'lookUp'] };
const GREET_W = { wave: 1.4, hop: 1, tilt: 0.8, up: 0.7 };
/** What he does after the step at a turning point into warm. */
const WARM_W = { wave: 1.4, lookUp: 1, hop: 0.6, blink: 0.5 };

/** Something he does on the spot: a fidget, an activity at a point of interest, a reaction. */
type Act = {
  kind: Action;
  at: number;
  dur: number;
  reverse?: boolean;
  block?: boolean; // holds him where he is (no following) while it plays
  look?: boolean; // his head aims at the pointer while it plays
  then?: (now: number) => void; // what happens when it ends
};

type State = {
  m: Machine;
  char: Pt;
  from: Pt; // where the current carry / drag started (screen)
  fromX: number; // drag start offset along the perch
  dur: number; // s, current carry / drag
  lift: number; // px above the higher end the carry arcs to
  idx: number; // perch he stands on (or is headed to while carried), -1 = held in the air
  placedBest: number; // reading-line perch when he was last placed (scroll carry only fires when it changes)
  grip: number;
  swing: number;
  swingV: number;
  baseX: number;
  hoverX: number;
  bend: 1 | -1;
  facing: 1 | -1;
  walk: WalkState; // x = offset from the perch's left edge
  anchored: boolean; // still where he was set down (follows the perch point if layout shifts)
  amt: number; // gait amplitude 0..1
  shown: 1 | -1; // facing as drawn: flips instantly partway through a turn
  turnAt: number; // ms a turn started (0 = not turning)
  turnTo: 1 | -1;
  turnHop: boolean;
  tilt: number; // head tilt, rad
  squash: number;
  edgeSince: number; // when he got stuck at an edge with the pointer beyond it (0 = not)
  holdUntil: number; // after an edge reset he ignores the pointer until this time (or it returns)
  idleAt: number; // when he (or the claw) next decides what to do with himself
  rd: Ragdoll | null; // limbs hang loose while held by hand / falling
  rag: RagPose | null;
  ragW: number; // 0..1 blend of the ragdoll pose (eases out after he lands)
  hv: Pt; // smoothed screen velocity while held by hand, px/s
  fall: Fall | null;
  route: Move[] | null; // his own way to another perch
  leg: number;
  legAt: number;
  action: Action | undefined;
  actionK: number;
  want: number; // perch the pointer rests over (-1 = none)
  wantSince: number;
  wantFail: number; // perch he already found no way to
  act: Act | null;
  ignoreBefore: number; // pointer positions older than this no longer pull him (he went exploring since)
  goal: Poi | null; // the point of interest he's on his way to / busy at
  recent: string[];
  explored: number;
  fidgets: Fidget[]; // recent fidgets, most recent first
  look: Pt | null; // document px his head turns to while busy
  amp: number; // tap hop scale
  tapped: boolean;
  seat: number; // px he's shuffled out past his walk extent to sit on the edge
  seatFrom: number;
  seatTo: number;
  sitUntil: number;
  kickAt: number; // next leg swing
  kickFrom: number; // current one started (0 = none)
  kick: number; // -1..1 shin swing this frame
  duckUntil: number;
  arms: string[]; // last seen print-arm positions per perch (a duck needs one moving)
  side: 1 | -1; // which side of the pointer he keeps to (hysteresis for keepGap)
  sitWake: number; // pointer timestamp a sit-beside wake was set for
  tremble: boolean;
  faceAt: number; // ms his last about-face started
  // moods
  band: Band; // the band he last acted on (a change = a turning point or a flinch)
  cond: Cond; // what the pointer was last classified as doing
  hunch: number; // posture, eased toward POSTURE[band]
  open: number;
  patW: number; // 0..1 pushing up into a pat
  patting: boolean;
  patDodged: boolean; // wary: ducked the first pat already
  dodgeUntil: number;
  turnPtAt: number; // ms of the last turning point
  turnPending: { band: Band; at: number } | null; // a turning point waiting for him to be free
  flinchAt: number;
  flinchSwat: boolean; // the swat episode that just started opens with a flinch
  stepGoal: number | null; // a deliberate step: walk.x he's stepping to
  afterStep: ((now: number) => void) | null;
  slowUntil: number; // following at a careful pace until then
  greetAt: number; // set down somewhere new: greet the visitor then (0 = no)
  pending: { poi: Poi; route: Move[] } | null; // where he's going once he's had a look (a glance first)
  reacts: string[]; // recent reactions (greetings, flourishes), for no repeats
};
/** A fall in document px: start, initial velocity, landing (char origin), duration. */
type Fall = { x0: number; y0: number; vx: number; vy: number; x1: number; y1: number; T: number; to: number };
type Perch = { el: HTMLElement; left: number; top: number; width: number; height: number; f: number; ext: Extent; ledge: boolean };
type Pointer = { x: number; y: number; t: number };
/** A perch as seen this frame (viewport px). */
type Seen = { ok: boolean; left: number; pt: Pt; top: number; visible: boolean; bottom: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function PuppeteerStage() {
  const reduce = useReducedMotion();
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const st = useRef<State | null>(null);
  const ptr = useRef<Pointer | null>(null);
  const charRef = useRef<CharacterHandle>(null);
  const armRef = useRef<ArmHandle>(null);
  const tiltRef = useRef<SVGGElement>(null);
  const lineRef = useRef<TrustLineHandle>(null);
  const tr = useRef<Trust | null>(null); // survives resizes / the effect re-running
  const lineShown = useRef(false);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // layout effect: a resize re-poses the arm in the same commit that gives it new lengths
  useLayoutEffect(() => {
    if (!vp.w) return;
    const scale = vp.w < 700 ? 1.3 : 1.85;
    const cfg = { ...WALK, cycle: 2 * STRIDE * scale }; // distance per gait cycle that keeps the planted foot still
    const reach = (FEET - COLLAR.y) * scale; // collar → feet, px
    // a perch is only somewhere to put him if all of him fits below the fixed header: its top (his
    // feet) at least his full height plus a margin under it. Every placement goes through `visible`.
    const headroom = HEADER + CLEAR + TALL * scale;
    let cache: Perch[] = [];
    const home = (i: number) => clampTo(cache[i].width * cache[i].f, cache[i].ext);
    const measure = () => {
      const { sx, sy } = viewport();
      const s = st.current;
      const prev = s && s.idx >= 0 ? cache[s.idx] : undefined;
      cache = Array.from(document.querySelectorAll<HTMLElement>('[data-perch]')).map((el) => {
        const r = el.getBoundingClientRect();
        const f = parseFloat(el.dataset.perch ?? '0.5');
        const half = parseFloat(el.dataset.perchSpan ?? '');
        const ext = perchExtent(r.width, MARGIN, half > 0 ? { center: r.width * f, half } : undefined);
        return { el, left: r.left + sx, top: r.top + sy, width: r.width, height: r.height, f, ext, ledge: el.dataset.ledge !== undefined };
      });
      // the perch he stands on resized (window resize, late layout): keep his place on it proportionally
      const now = s && s.idx >= 0 ? cache[s.idx] : undefined;
      if (s && now) {
        const x = s.anchored ? now.width * now.f : prev && prev.el === now.el && prev.width > 0 ? (s.walk.x * now.width) / prev.width : s.walk.x;
        s.walk = { ...s.walk, x: clampTo(x, now.ext) };
      }
    };
    measure();
    let dirty = false;
    let pressed: Pt | null = null;
    let holding = false; // pointer still down after pressing on him
    let hand: Pt | null = null; // where the pointer holding him is (any pointer type)
    const k185 = scale / 1.85;
    const lim = { ...LIMITS, jumpUp: LIMITS.jumpUp * k185, gap: LIMITS.gap * k185, reach: LIMITS.reach * k185, climbSpeed: LIMITS.climbSpeed * k185 };
    const limX = { ...lim, speed: lim.speed * EXPLORE_PACE }; // an amble, not an errand
    let attnAt = performance.now(); // the user was last around (pointer moved, tap, scroll)
    const surfaces = (ok: boolean[]): Surface[] =>
      cache.map((c, i) =>
        ok[i] ? { left: c.left + c.ext.lo, right: c.left + c.ext.hi, y: c.top, bottom: c.top + c.height, x0: c.left, x1: c.left + c.width } : { left: Infinity, right: -Infinity, y: Infinity },
      );

    // timers wake the sleeping loop (idle relocation, end of the follow hold) instead of keeping it awake
    const timers = new Set<number>();
    const wakeIn = (s: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        loop.wake();
      }, Math.max(0, s * 1000) + 20);
      timers.add(id);
    };
    const armIdle = (now: number, what: Parameters<typeof idleDelay>[0] = 'settled') => {
      const s = st.current;
      if (!s || reduce) return;
      // the pointer resting by him (or still shaken): he's minding it, so fidgets come at the slower pace
      // (shaken, though, he keeps cowering and glancing round: the quicker pace, so it reads)
      const minding = !!company(s, ptr.current) || uneasy(tr.current!, now);
      const quiet = feel(now) === 'shaken' ? QUIET * 2 : minding ? 0 : (now - attnAt) / 1000;
      const wait = idleDelay(what, quiet, Math.random);
      s.idleAt = now + wait * 1000;
      wakeIn(wait);
    };

    // ---- trust ----
    if (!tr.current) {
      // a reload in the same session keeps how he feels about you (storage can throw: then he starts wary)
      let saved: Trust | null = null;
      try {
        const raw = window.sessionStorage.getItem(SAVE_KEY);
        saved = raw ? thaw(JSON.parse(raw), performance.now(), Date.now()) : null;
      } catch {
        saved = null;
      }
      tr.current = saved ?? initTrust(performance.now());
    }
    const trustNow = (now: number, f: (t: Trust) => Trust = (t) => advance(t, now)) => (tr.current = f(tr.current!));
    const feel = (now: number): Band => band(tr.current!, now);
    let saved = { v: -1, band: '' as string, at: 0 };
    const save = (now: number, force = false) => {
      const t = advance(tr.current!, now);
      const b = feel(now);
      if (!force && Math.abs(t.v - saved.v) < 0.02 && b === saved.band) return;
      if (!force && b === saved.band && now - saved.at < 800) return;
      saved = { v: t.v, band: b, at: now };
      try {
        window.sessionStorage.setItem(SAVE_KEY, JSON.stringify(freeze(t, now, Date.now())));
      } catch {
        // no storage: trust lasts for this page load only
      }
    };
    // what the pointer has been doing, for trust (mouse / pen; touch taps, and lingering on a section)
    const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
    const sense = { speed: 0, approach: 0, touch: coarse, gone: false, last: null as { x: number; y: number; t: number; d: number } | null };
    let lastScroll = -Infinity; // ms the page last scrolled (touch: lingering = not scrolling)
    let lingerTimer = 0;
    const events: { k: string; t: number }[] = []; // dev: what he did and when (reactions, turning points)
    const note = (k: string, now: number) => {
      if (!import.meta.env.DEV) return;
      events.push({ k, t: Math.round(now) });
      if (events.length > 200) events.shift();
      console.debug(`[puppet] ${k}`);
    };
    let trustTimer = 0;
    /** The pointer if it's a mouse that's about and within reach of his attention (screen px), plus its distance. */
    const company = (s: State, p: Pointer | null) => {
      if (!p || sense.touch || sense.gone) return null;
      const d = Math.hypot(p.x - s.char.x, p.y - (s.char.y - 8 * scale));
      return d <= FAR ? { p, d } : null;
    };

    const go = (s: State, ev: Ev, now: number) => {
      const next = transition(s.m, ev, now);
      if (next === s.m) return false;
      if (import.meta.env.DEV && next.mode !== s.m.mode) console.debug(`[puppet] ${s.m.mode} → ${next.mode}`, ev.type === 'take' ? ev.plan : ev.type);
      const prev = s.m.mode;
      const prevPlan = s.m.plan;
      s.m = next;
      // entry actions
      if (next.mode !== 'fidget') s.pending = null; // the glance before setting off was interrupted
      if (next.mode !== 'idle' && next.mode !== 'walking') {
        s.stepGoal = null;
        s.afterStep = null;
      }
      if (next.mode === 'swatting' && now - s.flinchAt > FLINCH_GAP * 1000 && !reduce) {
        // the swatting episode opens with a flinch: he recoils first, then bats at it
        s.flinchSwat = true;
        s.flinchAt = now;
        note('flinch:swat', now);
      }
      if (next.mode === 'idle' && prev === 'landing' && prevPlan && prevPlan.why !== 'edge' && prevPlan.why !== 'press') {
        // set down somewhere new: if he trusts you he greets you once he's found his feet
        s.greetAt = now + rand(250, 600);
        wakeIn((s.greetAt - now) / 1000);
      }
      if (next.mode === 'carried' || next.mode === 'dragged') {
        const plan = next.plan!;
        s.from = { ...s.char };
        s.fromX = s.walk.x;
        s.idx = plan.to;
        s.walk = { ...s.walk, v: 0, walking: false };
        const dist = Math.abs((plan.to >= 0 ? plan.x : 0) - s.walk.x);
        if (plan.kind === 'hand') s.dur = Infinity;
        else if (next.mode === 'dragged') s.dur = clamp(dist / 110 + 0.3, 1.2, 3.2);
        else if (plan.kind === 'tour') s.dur = 3.4;
        else if (plan.why === 'edge') s.dur = 0.9;
        else if (plan.why === 'relocate' || plan.why === 'press') s.dur = 1.7;
        else s.dur = TRANSIT;
        s.lift = plan.kind === 'tour' ? Math.min(200, vp.h * 0.24) : plan.why === 'edge' ? 46 : Math.min(220, vp.h * 0.25);
        if (prev === 'carried' || prev === 'dangling') s.lift = Math.min(s.lift, 80); // already up
      }
      if (next.mode === 'landing') {
        s.squash = next.plan?.kind === 'drag' ? 0.05 : 0.12;
        if (s.idx >= 0) {
          s.walk = { x: next.plan!.x, v: 0, phase: s.walk.phase, walking: false };
          s.anchored = Math.abs(next.plan!.x - home(s.idx)) < 1;
        }
        if (next.plan?.why === 'edge') {
          s.holdUntil = now + FOLLOW_HOLD * 1000;
          s.ignoreBefore = now; // a pointer parked past the end doesn't pull him straight back there: it has to move again
        }
        else s.placedBest = next.plan?.why === 'scroll' || next.plan?.why === 'enter' ? s.idx : s.placedBest;
      }
      if (next.mode === 'carried' && next.plan?.kind === 'hand') {
        s.rd = createRagdoll(s.swing);
        primeRagdoll(s.rd, collarOf(s), { x: 0, y: 0 });
        s.hv = { x: 0, y: 0 };
        s.route = null;
        s.fall = null;
        s.idx = -1;
      }
      if (next.mode === 'falling') startFall(s);
      if (next.mode === 'grabbed' && next.plan?.kind === 'hand') trustNow(now, (t) => scare(t, now));
      if (next.mode === 'grabbed') {
        s.route = null;
        s.fall = null;
        s.goal = null;
        s.act = prev === 'sitting' ? { kind: 'sit', at: now, dur: ACT_DUR.sit * 0.6, reverse: true } : null; // up off the edge as the claw takes him
      }
      if (next.mode === 'carried' || next.mode === 'dragged') s.seat = 0;
      if (prev === 'sitting' && next.mode !== 'grabbed') {
        // stands up (and shuffles back from the edge) before anything else
        s.act = { kind: 'sit', at: now, dur: ACT_DUR.sit * 0.75, reverse: true, block: true };
        s.seatFrom = s.seat;
        s.seatTo = 0;
        s.kickFrom = 0;
      }
      if (next.mode === 'idle' && (prev === 'landing' || prev === 'falling' || prev === 'hopping' || prev === 'walking')) {
        if (s.holdUntil > now) wakeIn((s.holdUntil - now) / 1000);
        armIdle(now);
      }
      if (next.mode === 'idle' && own(prev)) {
        if (prev === 'fidget' && s.act && s.act.kind !== 'sit') s.act = null;
        s.look = null;
        if (ev.type === 'attend') {
          s.goal = null;
          s.explored = 0;
          armIdle(now, 'attention');
        } else if (prev === 'sitting') armIdle(now, 'activity');
        else if (prev === 'fidget') armIdle(now, s.goal ? 'activity' : 'fidget');
        if (prev === 'fidget') s.goal = null;
      }
      if (next.mode === 'swatting' && own(prev)) {
        s.goal = null;
        s.look = null;
        if (prev === 'fidget') s.act = null;
      }
      return true;
    };

    const collarOf = (s: State): Pt => ({ x: s.char.x + COLLAR.x * s.shown * scale, y: s.char.y + COLLAR.y * scale });

    // let go: pick the printed perch under him (or the nearest one) and throw him at it in document space
    const startFall = (s: State) => {
      const { sx, sy } = viewport();
      const feet = s.char.y + FEET * scale;
      const vis = cache.map((c, i) => ({ c, i, top: c.top - sy, l: c.left - sx + c.ext.lo, r: c.left - sx + c.ext.hi })).filter((q) => q.c.el.dataset.printed !== '0' && q.top >= headroom && q.top < vp.h);
      const below = vis.filter((q) => q.top >= feet - 4);
      const under = below.filter((q) => s.char.x >= q.l - 20 && s.char.x <= q.r + 20).sort((a, b) => a.top - b.top)[0];
      const off = (q: (typeof vis)[number]) => Math.max(0, q.l - s.char.x, s.char.x - q.r);
      const pick = under ?? below.sort((a, b) => off(a) + 0.3 * (a.top - feet) - (off(b) + 0.3 * (b.top - feet)))[0] ?? vis.sort((a, b) => off(a) - off(b))[0];
      const x0 = s.char.x + sx;
      const y0 = s.char.y + sy;
      const vx = clamp(s.hv.x, -900, 900);
      let vy = clamp(s.hv.y, -900, 900);
      let x1: number;
      let y1: number;
      if (pick) {
        x1 = pick.c.left + clampTo(s.char.x + sx - pick.c.left, pick.c.ext);
        y1 = pick.c.top - FEET * scale;
      } else {
        x1 = x0 + vx * 0.3;
        y1 = sy + vp.h + 200; // nothing to land on: out the bottom; the claw fetches him
      }
      const dy = y1 - y0;
      let T: number;
      if (dy >= 0) T = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * dy)) / GRAVITY;
      else {
        T = 0.8; // perch above him (fallback only): a hop up onto it
        vy = (dy - (GRAVITY * T * T) / 2) / T;
      }
      s.fall = { x0, y0, vx, vy, x1, y1, T: Math.max(0.15, T), to: pick ? pick.i : -1 };
      s.idx = pick ? pick.i : -1;
      if (s.rd) primeRagdoll(s.rd, collarOf(s), s.hv);
    };

    // ---- his own ideas: fidgets, points of interest, sitting ----
    const play = (s: State, kind: Action, now: number, extra: Partial<Act> = {}) => {
      s.act = { kind, at: now, dur: ACT_DUR[kind], ...extra };
      wakeIn(s.act.dur);
    };
    /** Where the visitor is, as far as he knows (screen px): the mouse, or the last tap. Null = no idea. */
    const visitor = (): Pt | null => {
      const p = ptr.current;
      if (!p || (sense.gone && !sense.touch)) return null;
      return { x: p.x, y: p.y };
    };
    const faceTo = (s: State, x: number) => {
      if (Math.abs(x - s.char.x) > 10) s.facing = x > s.char.x ? 1 : -1;
    };
    /** One deliberate step (walk.x offset `to`), at a careful pace; `then` when he's stopped. */
    const startStep = (s: State, to: number, then: ((now: number) => void) | null = null) => {
      if (s.idx < 0) return false;
      const x = clampTo(to, cache[s.idx].ext);
      if (Math.abs(x - s.walk.x) < 5) return false;
      s.stepGoal = x;
      s.afterStep = then;
      return true;
    };
    /** px of a deliberate step toward `x` (screen), not closer than `gap` px to it. */
    const stepToward = (s: State, x: number, gap: number) => {
      const dir = x > s.char.x ? 1 : -1;
      const room = Math.abs(x - s.char.x) - gap;
      const len = Math.min(13 * scale, room);
      return len >= 6 ? s.walk.x + dir * len : null;
    };
    /** Play a sequence of acts, one after another (`then` chains them). */
    const chain = (s: State, now: number, acts: (Partial<Act> & { kind: Action })[], last?: (now: number) => void) => {
      const run = (i: number, t: number) => {
        if (i >= acts.length) return last?.(t);
        const a = acts[i];
        s.act = { at: t, dur: ACT_DUR[a.kind], ...a, then: (t2) => run(i + 1, t2) };
        wakeIn(s.act.dur);
      };
      run(0, now);
    };
    const freeNow = (s: State) => (s.m.mode === 'idle' || s.m.mode === 'walking') && s.idx >= 0 && !reduce;
    /**
     * The turning point: he's just come to trust you more. He stops dead, a beat, tilts his head at
     * the pointer, then takes one deliberate step toward it. Into warm, a flourish after the step.
     */
    const turningPoint = (s: State, to: Band, now: number) => {
      const v = visitor();
      s.turnPending = null;
      s.turnPtAt = now;
      s.walk = { ...s.walk, v: s.walk.v * 0.25 };
      s.stepGoal = null;
      if (v) faceTo(s, v.x);
      note(`turn:${to}`, now);
      chain(s, now, [
        { kind: 'still', dur: rand(0.35, 0.5), block: true, look: true },
        { kind: 'tilt', dur: rand(0.9, 1.15), block: true, look: true },
      ], (t) => {
        const vv = visitor();
        const at = vv ? stepToward(s, vv.x, to === 'warm' ? 36 : 70) : null;
        const flourish = (t2: number) => {
          s.slowUntil = t2 + 1500; // the rest of the way, carefully
          if (to !== 'warm' || !freeNow(s)) return;
          const k = pickVaried(WARM_W, s.reacts, Math.random) ?? 'wave';
          s.reacts = noteRecent(s.reacts, k, 4);
          chain(s, t2, [{ kind: k as Action, look: true }]);
        };
        if (at === null || !startStep(s, at, flourish)) flourish(t);
        else note('step', t);
      });
    };
    /** Trust just dropped (rough, chased, swatted at): a quick recoil, leaning back. */
    const flinch = (s: State, now: number) => {
      if (reduce || now - s.flinchAt < FLINCH_GAP * 1000 || s.idx < 0) return;
      if (s.m.mode === 'fidget') go(s, { type: 'done' }, now);
      if (s.m.mode === 'swatting' || !freeNow(s)) return;
      const v = visitor();
      if (v) faceTo(s, v.x);
      s.flinchAt = now;
      s.stepGoal = null;
      s.walk = { ...s.walk, v: 0 };
      note('flinch', now);
      chain(s, now, [{ kind: 'flinch', dur: ACT_DUR.flinch * rand(0.9, 1.15), block: true }]);
    };
    /** Set down somewhere new and he trusts you: he looks for you and says hello. */
    const greet = (s: State, now: number) => {
      s.greetAt = 0;
      if (!freeNow(s) || s.act || RANK[feel(now)] < RANK.tolerant) return;
      const v = visitor();
      faceTo(s, v ? v.x : vp.w / 2);
      const k = pickVaried(GREET_W, s.reacts, Math.random) ?? 'wave';
      s.reacts = noteRecent(s.reacts, k, 4);
      note(`greet:${k}`, now);
      chain(s, now, GREET[k].map((kind) => ({ kind, look: true })));
    };
    /** Wary, a hand over his head the first time: he ducks out from under it. */
    const dodge = (s: State, p: Pointer, now: number) => {
      s.patDodged = true;
      s.dodgeUntil = now + DODGE_FOR * 1000;
      faceTo(s, p.x);
      note('dodge', now);
      const away = s.walk.x + (p.x > s.char.x ? -1 : 1) * 16 * scale;
      chain(s, now, [{ kind: 'duck', block: true }], () => void startStep(s, away));
    };
    const startFidget = (s: State, f: Fidget, now: number) => {
      s.fidgets = noteRecent(s.fidgets, f, 3);
      if (f === 'step') {
        // a pace toward whatever he's facing (the pointer, usually), then a curious look
        const v = visitor();
        const at = v && Math.abs(v.x - s.char.x) > 12 ? stepToward(s, v.x, keepGap(tr.current!, now) - 20) : s.walk.x + s.facing * 11 * scale;
        if (at !== null && startStep(s, at, (t) => freeNow(s) && !s.act && chain(s, t, [{ kind: 'tilt', look: !!v }]))) return note('fidget:step', now);
        f = 'tilt';
      }
      if (!go(s, { type: 'fidget' }, now)) return;
      note(`fidget:${f}`, now);
      s.goal = null;
      s.look = null;
      // at ease with you (or curious about you: a head tilt, a wave): he turns to the pointer and looks at it
      const near = feel(now) === 'warm' || f === 'tilt' || f === 'wave' ? company(s, ptr.current) : null;
      if (near) {
        if (Math.abs(near.p.x - s.char.x) > 12) s.facing = near.p.x > s.char.x ? 1 : -1;
      } else if (f === 'lookUp' && Math.abs(s.hoverX - s.char.x) > 20) s.facing = s.hoverX > s.char.x ? 1 : -1; // toward the claw
      play(s, f, now);
      if (near && f !== 'look') s.look = { x: near.p.x + viewport().sx, y: near.p.y + viewport().sy };
    };
    /** Fully trusted, the pointer resting beside him: he sits down by it. */
    const sitBeside = (s: State, p: Pointer, now: number) => {
      if (!go(s, { type: 'sit' }, now)) return;
      s.goal = null;
      if (Math.abs(p.x - s.char.x) > 8) s.facing = p.x > s.char.x ? 1 : -1;
      play(s, 'sit', now);
      s.look = { x: p.x + viewport().sx, y: p.y + viewport().sy };
      s.seatFrom = s.seat;
      s.seatTo = 0;
      s.sitUntil = now + rand(SIT_BESIDE[0], SIT_BESIDE[1]) * 1000;
      s.kickAt = now + (ACT_DUR.sit + kickDelay(Math.random)) * 1000;
      s.kickFrom = 0;
      wakeIn((s.kickAt - now) / 1000);
      wakeIn((s.sitUntil - now) / 1000);
    };
    /** The scene for explore.ts: usable surfaces, decor and headings in document px (measured now: rare). */
    const scene = (ps: Seen[]): Scene => {
      const { sx, sy } = viewport();
      const view = { left: sx, right: sx + vp.w, top: sy, bottom: sy + vp.h };
      // he only wanders onto surfaces with room for all of him below the header (`visible`)
      const surfaces = cache.map((c, i): SceneSurface | null =>
        ps[i].ok && ps[i].visible
          ? { left: c.left + c.ext.lo, right: c.left + c.ext.hi, y: c.top, bottom: c.top + c.height, x0: c.left, x1: c.left + c.width, ledge: c.ledge, plate: c.el.dataset.printed !== undefined }
          : null,
      );
      const splats = Array.from(document.querySelectorAll<SVGElement>('[data-poi="splat"]'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.bottom > 0 && r.top < vp.h && r.right > 0 && r.left < vp.w)
        .map((r) => ({ x: r.left + sx + r.width / 2, y: r.top + sy + r.height * 0.4, r: r.width / 2 }));
      const printers: Scene['printers'] = [];
      const headings: Scene['headings'] = [];
      const nodes: Scene['nodes'] = [];
      nodeEls = [];
      cache.forEach((c, i) => {
        const arm = c.el.dataset.printing === '1' ? c.el.dataset.arm?.split(' ').map(Number) : undefined;
        if (arm && arm.length === 4) printers.push({ s: i, tip: { x: c.left + arm[2], y: c.top + arm[3] } });
        if (!surfaces[i]) return;
        c.el.querySelectorAll('h2').forEach((h) => {
          const range = document.createRange();
          range.selectNodeContents(h);
          const r = range.getBoundingClientRect(); // the text itself, not the block
          if (r.width > 0 && r.top < vp.h) headings.push({ s: i, left: r.left + sx, right: r.right + sx, top: r.top + sy });
        });
        // circuit-tree link nodes on this plate (the hex, not the label), on screen
        c.el.querySelectorAll<HTMLElement>('[data-poi="node"]').forEach((el) => {
          const r = (el.querySelector('svg') ?? el).getBoundingClientRect();
          if (r.width === 0 || r.top > vp.h - 20 || r.bottom < 0) return;
          nodes.push({ s: i, x: r.left + sx + r.width / 2, y: r.top + sy + r.height / 2 });
          nodeEls.push(el);
        });
      });
      // hand raised (≈48 units above his feet) plus the hop
      return { surfaces, splats, printers, headings, nodes, view, reach: (44 + TAP_HOP * 1.5) * scale, tapOut: 13 * scale, pad: 40, sitOut: 7 * scale }; // sat, his knees reach ≈ 13 units ahead: just past the edge, shins clear of it
    };
    let nodeEls: HTMLElement[] = []; // the elements behind Scene.nodes (last measured scene)
    let goalNode: HTMLElement | undefined; // the node he's headed to / tapping above
    let litNode: { el: HTMLElement; id: number } | null = null;
    /**
     * He taps the plate's edge above a circuit node: its trace lights for a moment, through the
     * tree's own hover hook (a synthetic pointerover / pointerout; no focus, no click). Skipped while
     * the visitor's pointer is on the tree, so he never fights a real hover.
     */
    const lightNode = (el: HTMLElement | undefined) => {
      if (!el || !el.isConnected || el.closest('nav')?.matches(':hover')) return;
      unlightNode();
      el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      litNode = { el, id: window.setTimeout(unlightNode, NODE_LIT * 1000) };
    };
    const unlightNode = () => {
      if (!litNode) return;
      window.clearTimeout(litNode.id);
      const { el } = litNode;
      litNode = null;
      if (!el.matches(':hover')) el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
    };
    /** Pick a point of interest and set off for it. False = nowhere to go. */
    const startExplore = (s: State, mood: 'explore' | 'rest', ps: Seen[], now: number, only?: (p: Poi) => boolean) => {
      const sc = scene(ps);
      const S: Surface[] = sc.surfaces.map((q) => q ?? { left: Infinity, right: -Infinity, y: Infinity });
      const from = { s: s.idx, x: cache[s.idx].left + s.walk.x };
      const routes = new Map<string, Move[]>();
      const onScreen = (r: Move[]) => r.every((m) => m.to.x >= sc.view.left + sc.pad && m.to.x <= sc.view.right - sc.pad);
      const pois = collectPois(sc).filter((q) => !only || only(q));
      const poi = choosePoi(pois, {
        from,
        recent: s.recent,
        rand: Math.random,
        mood,
        cost: (q) => {
          const sf = S[q.s];
          const r = planRoute(S, from, { s: q.s, x: clamp(q.x, sf.left, sf.right) }, limX);
          if (!r || !onScreen(r)) return null;
          routes.set(q.id, r);
          return r.reduce((t, m) => t + m.duration, 0);
        },
      });
      if (import.meta.env.DEV) console.debug(`[puppet] curious (${mood}): ${poi ? `${poi.id} → ${poi.activity}` : 'nothing'}; of ${pois.map((q) => q.id + (routes.has(q.id) ? '' : '✗')).join(' ')}`);
      if (!poi) return false;
      const route = routes.get(poi.id)!;
      s.goal = poi;
      goalNode = poi.kind === 'node' && poi.target !== undefined ? nodeEls[poi.target] : undefined;
      s.recent = remember(s.recent, poi.id);
      s.ignoreBefore = now;
      if (!route.length) {
        arrive(s, now);
        return true;
      }
      // a thinking tell: most times he stops and looks where he's going first, a beat, then sets off
      if (!reduce && Math.random() < 0.75 && go(s, { type: 'fidget' }, now)) {
        const to = poi.look ?? { x: route[route.length - 1].to.x, y: route[route.length - 1].to.y - 30 * scale };
        const sx = viewport().sx;
        faceTo(s, route[0].to.x - sx);
        s.look = to;
        s.goal = poi;
        s.pending = { poi, route };
        play(s, 'glance', now, { dur: rand(0.45, 0.95) });
        note(`glance:${poi.id}`, now);
        return true;
      }
      beginRoute(s, poi, route, now);
      return true;
    };
    const beginRoute = (s: State, poi: Poi, route: Move[], now: number) => {
      s.goal = poi;
      goalNode = poi.kind === 'node' && poi.target !== undefined ? nodeEls[poi.target] : undefined;
      s.route = route;
      s.leg = 0;
      s.legAt = now;
      s.ignoreBefore = now;
      go(s, { type: 'explore' }, now);
      s.idx = poi.s;
    };
    /** At the point of interest: face it and do the thing. */
    const arrive = (s: State, now: number) => {
      const poi = s.goal;
      if (!poi || s.idx < 0) return;
      const sx = viewport().sx;
      const me = s.char.x + sx;
      if (poi.face) s.facing = poi.face;
      else if (poi.look && Math.abs(poi.look.x - me) > 12) s.facing = poi.look.x > me ? 1 : -1;
      s.look = poi.look;
      if (poi.activity === 'sit') {
        if (!go(s, { type: 'sit' }, now)) return;
        play(s, 'sit', now);
        s.seatFrom = s.seat;
        s.seatTo = poi.x - cache[s.idx].left - s.walk.x; // shuffle out to the edge as he sits
        s.sitUntil = now + rand(SIT_FOR[0], SIT_FOR[1]) * 1000;
        s.kickAt = now + (ACT_DUR.sit + kickDelay(Math.random)) * 1000;
        s.kickFrom = 0;
        s.explored = 0;
        wakeIn((s.kickAt - now) / 1000);
        wakeIn((s.sitUntil - now) / 1000);
        return;
      }
      if (!go(s, { type: 'fidget' }, now)) return;
      s.explored++;
      s.tapped = false;
      if (poi.activity === 'tap' && poi.target !== undefined) {
        const stone = cache[poi.target];
        const gap = (cache[poi.s].top - (stone.top + stone.height)) / scale; // units from his feet up to the stone
        s.amp = clamp((gap - 40) / TAP_HOP, 0.15, 1.5); // hand up and forward ≈ 44 units over his feet: meet the stone a little above its underside
      } else s.amp = 1;
      play(s, poi.activity, now);
    };
    /** The claw's idea: carry him to another perch, give him a dangle tour, or drag him along. */
    const clawRelocate = (s: State, ps: Seen[], now: number) => {
      const ext = cache[s.idx].ext;
      const others = ps.map((_, i) => i).filter((i) => i !== s.idx && ps[i].ok && ps[i].visible);
      const span = ext.hi - ext.lo;
      const options: Plan[] = [];
      if (others.length) {
        const j = others[Math.floor(Math.random() * others.length)];
        options.push({ kind: 'carry', why: 'relocate', to: j, x: home(j) });
      }
      if (span >= 160) {
        // drag him toward the far side of his perch, at least 120 px
        const toHi = s.walk.x - ext.lo < ext.hi - s.walk.x;
        const x = toHi ? rand(Math.max(ext.lo, s.walk.x + 120), ext.hi) : rand(ext.lo, Math.min(ext.hi, s.walk.x - 120));
        options.push({ kind: 'drag', why: 'relocate', to: s.idx, x: clampTo(x, ext) });
      }
      options.push({ kind: 'tour', why: 'relocate', to: s.idx, x: span > 80 ? rand(ext.lo + span * 0.25, ext.hi - span * 0.25) : home(s.idx) });
      go(s, { type: 'take', plan: options[Math.floor(Math.random() * options.length)] }, now);
    };

    /** Where the claw holds him with nowhere to set him down: clear of every plate (hold.ts); cached per scroll / layout. */
    let holdMemo: { key: string; at: Pt } | null = null;
    const holdAt = (sx: number, sy: number): Pt => {
      const key = `${sx},${sy},${cache.length},${cache[0]?.top}`;
      if (holdMemo && holdMemo.key === key && !dirty) return holdMemo.at;
      const plates = cache
        .filter((c) => !c.ledge && c.height > 0)
        .map((c) => ({ left: c.left - sx, right: c.left - sx + c.width, top: c.top - sy, bottom: c.top - sy + c.height }))
        .filter((b) => b.bottom > 0 && b.top < vp.h);
      const at = holdSpot({ vw: vp.w, vh: vp.h, minTop: HEADER + CLEAR, plates, up: 48 * scale, down: (FEET + 6) * scale, half: 22 * scale, pref: { x: vp.w * (vp.w < 700 ? 0.78 : 0.86), y: vp.h * 0.34 } });
      holdMemo = { key, at };
      return at;
    };

    let lastSeen: Seen[] = []; // dev: the last frame's view of the perches
    let frames = 0; // dev: frames run (to check the loop sleeps when he's settled)
    const frame = (now: number, dt: number) => {
      if (import.meta.env.DEV) frames++;
      if (dirty) {
        measure(); // coalesced: at most one layout read per wake
        dirty = false;
      }
      const { sx, sy } = viewport();
      const ps: Seen[] = cache.map((p) => {
        const top = p.top - sy;
        return {
          ok: p.el.dataset.printed !== '0',
          left: p.left - sx,
          pt: { x: p.left - sx + p.width * p.f, y: top - FEET * scale },
          top,
          visible: top >= headroom && top < vp.h - 8,
          bottom: top + p.height,
        };
      });
      lastSeen = ps;
      if (!ps.length) return false; // layout / print-state changes wake us when perches appear
      const line = vp.h * 0.5;
      let best = -1;
      let bestD = Infinity;
      ps.forEach((p, i) => {
        if (!p.ok || !p.visible || cache[i].ledge) return; // the reading line picks plates, never ledges
        const d = Math.abs(p.top - line);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });

      if (!st.current) {
        const first = ps[0].pt;
        const x0 = home(0);
        st.current = {
          m: initial(now, reduce ? null : { kind: 'carry', why: 'enter', to: 0, x: x0 }),
          char: reduce ? { ...first } : { x: first.x, y: -120 },
          from: { x: first.x, y: -120 },
          fromX: x0,
          dur: TRANSIT,
          lift: Math.min(220, vp.h * 0.25),
          idx: 0,
          placedBest: 0,
          grip: reduce ? 0 : 1,
          swing: 0,
          swingV: 0,
          baseX: first.x,
          hoverX: first.x + HOVER,
          bend: -1,
          facing: 1,
          walk: { x: x0, v: 0, phase: 0, walking: false },
          anchored: true,
          amt: 0,
          shown: 1,
          turnAt: 0,
          turnTo: 1,
          turnHop: false,
          tilt: 0,
          squash: 0,
          edgeSince: 0,
          holdUntil: 0,
          idleAt: Infinity,
          rd: null,
          rag: null,
          ragW: 0,
          hv: { x: 0, y: 0 },
          fall: null,
          route: null,
          leg: 0,
          legAt: 0,
          action: undefined,
          actionK: 0,
          want: -1,
          wantSince: 0,
          wantFail: -1,
          act: null,
          ignoreBefore: 0,
          goal: null,
          recent: [],
          explored: 0,
          fidgets: [],
          look: null,
          amp: 1,
          tapped: false,
          seat: 0,
          seatFrom: 0,
          seatTo: 0,
          sitUntil: 0,
          kickAt: 0,
          kickFrom: 0,
          kick: 0,
          duckUntil: 0,
          arms: [],
          side: 1,
          sitWake: 0,
          tremble: false,
          faceAt: 0,
          band: feel(now),
          cond: 'alone',
          ...POSTURE[feel(now)],
          patW: 0,
          patting: false,
          patDodged: false,
          dodgeUntil: 0,
          turnPtAt: 0,
          turnPending: null,
          flinchAt: 0,
          flinchSwat: false,
          stepGoal: null,
          afterStep: null,
          slowUntil: 0,
          greetAt: 0,
          pending: null,
          reacts: [],
        };
        armIdle(now);
      }
      const s = st.current;
      const mode = () => s.m.mode;
      const p = ptr.current;
      // ---- trust: what the pointer has been doing since the last frame / wake ----
      const mouse = !!p && !sense.touch && !sense.gone;
      // the pointer just over his head, roughly over him (a hand reaching out: a pat)
      const headTop = s.char.y - (TALL - FEET) * scale;
      const overHead = mouse && (free(mode()) || own(mode())) && s.idx >= 0 && Math.abs(p!.x - (s.char.x + 2 * scale * s.shown)) <= PAT_HALF * scale && headTop - p!.y >= 0 && headTop - p!.y <= PAT_HI + 60;
      const gentleOver = overHead && headTop - p!.y >= PAT_LO && headTop - p!.y <= PAT_HI && (sense.speed <= PAT_SPEED || now - p!.t > 250);
      {
        const md = mode();
        const before = feel(now);
        // a hand over his head: tolerant or warm he pushes up into it; wary he ducks out once, then lets it
        let pat = false;
        if (gentleOver && before !== 'shaken') {
          if (before === 'wary' && !s.patDodged) {
            if (freeNow(s) && !s.act) dodge(s, p!, now);
            else s.patDodged = !reduce ? s.patDodged : true;
          } else pat = now >= s.dodgeUntil;
        }
        if (pat && !s.patting) note('pat', now);
        s.patting = pat;
        let cond: Cond;
        if (s.m.plan?.kind === 'hand' || md === 'falling') cond = 'held';
        else if (!afoot(md) && md !== 'landing') cond = 'neutral'; // the claw has him: nothing earned or lost
        else {
          const d = mouse ? Math.hypot(p!.x - s.char.x, p!.y - (s.char.y - 8 * scale)) : null;
          const linger = sense.touch && now - lastScroll >= LINGER_AFTER * 1000 && s.idx >= 0 && !!lastSeen[s.idx]?.visible;
          cond = classify({ d, speed: sense.speed, approach: sense.approach, still: p ? (now - p.t) / 1000 : Infinity, touch: sense.touch, pat, linger });
        }
        if ((cond === 'rough' || cond === 'chase') && s.cond !== cond && RANK[before] >= RANK.wary) flinch(s, now); // that costs him
        s.cond = cond;
        const t = trustNow(now, (t) => observe(t, now, cond));
        save(now);
        if (t.full && !lineShown.current && afoot(md) && s.idx >= 0) {
          // the first time he fully trusts you: the hidden line, above him (once a session; TrustLine guards it)
          lineShown.current = true;
          lineRef.current?.show({ x: s.char.x, head: s.char.y - (TALL - FEET) * scale, feet: s.char.y + FEET * scale, gap: 10, half: 14 * scale, top: HEADER + CLEAR });
        }
      }
      const fl = feel(now);
      s.tremble = fl === 'shaken' && !reduce;
      // ---- his mood changed: a turning point (he trusts you more) or a flinch (less) ----
      if (fl !== s.band) {
        const up = RANK[fl] > RANK[s.band];
        if (up && RANK[fl] >= RANK.tolerant) s.turnPending = { band: fl, at: now };
        else if (!up) {
          s.turnPending = null;
          if (fl !== 'shaken') flinch(s, now); // a grab is its own reaction (he's in the claw)
        }
        note(`band:${s.band}->${fl}`, now);
        s.band = fl;
      }
      if (s.turnPending) {
        // under a hand already (a pat): the moment is that; no separate turning point
        if (now - s.turnPending.at > TURN_WAIT * 1000 || reduce || s.patting) s.turnPending = null;
        else if (freeNow(s) && !s.act && now - s.turnPtAt > TURN_GAP * 1000) turningPoint(s, s.turnPending.band, now);
      }
      if (s.greetAt && now >= s.greetAt) greet(s, now);
      const heldPt = { ...holdAt(sx, sy) };
      heldPt.x += Math.sin(now / 1400) * 6;
      heldPt.y += Math.cos(now / 1100) * 4;

      // ---- the page decides: scroll / perch lost (urgent; interrupts anything but the user's hand / a fall) ----
      const byHand = s.m.plan?.kind === 'hand';
      if (mode() !== 'falling' && !byHand) {
        const cur = s.idx >= 0 ? ps[s.idx] : undefined;
        const curOk = !!cur && cur.ok && cur.visible;
        let take: Plan | null = null;
        if (mode() === 'dangling') {
          if (best >= 0) take = { kind: 'carry', why: 'scroll', to: best, x: home(best) };
        } else if (!curOk) {
          if (best >= 0) take = { kind: 'carry', why: 'scroll', to: best, x: home(best) };
          else if (s.idx !== -1 || afoot(mode())) take = { kind: 'carry', why: 'lost', to: -1, x: 0 };
        } else if (mode() !== 'hopping' && mode() !== 'exploring' && best >= 0 && best !== s.idx && best !== s.placedBest && bestD + 80 < Math.abs(cur!.top - line)) {
          take = { kind: 'carry', why: 'scroll', to: best, x: home(best) };
        }
        if (take) {
          if (reduce) {
            // carry stays instant: put him straight there
            s.idx = take.to;
            s.m = { mode: take.to < 0 ? 'dangling' : 'idle', plan: null, since: now };
            s.grip = take.to < 0 ? 1 : 0;
            if (take.to >= 0) {
              s.walk = { x: take.x, v: 0, phase: s.walk.phase, walking: false };
              s.anchored = true;
              s.placedBest = take.to;
            }
          } else go(s, { type: 'take', plan: take }, now);
        }
      }

      // ---- the user is back: his own whims stop (mid-jump he lands first) ----
      if (own(mode()) && attnAt > s.m.since) {
        const mv = s.route?.[s.leg];
        if (mode() === 'exploring' && mv && mv.kind !== 'walk') {
          s.route = s.route!.slice(0, s.leg + 1);
          s.goal = null;
        } else {
          if (mode() === 'exploring' && mv) {
            s.idx = mv.onto;
            s.walk = { ...s.walk, x: clampTo(s.char.x + viewport().sx - cache[mv.onto].left, cache[mv.onto].ext), v: 0, walking: false };
            s.route = null;
          }
          go(s, { type: 'attend' }, now);
        }
      }

      // ---- on a perch under his own power: walk, maybe get reset at an edge ----
      let backing = false; // edging away from the pointer (he keeps facing it)
      if (free(mode()) && s.idx >= 0) {
        const perch = cache[s.idx];
        const ext = perch.ext;
        const raw = p ? p.x - ps[s.idx].left : s.walk.x;
        if (s.holdUntil && (now >= s.holdUntil || (raw >= ext.lo && raw <= ext.hi))) s.holdUntil = 0;
        // a pointer buzzing round him: back off and swat at it (wary or shaken only: trust ends it)
        if (p && !reduce) {
          const d = Math.hypot(p.x - s.char.x, p.y - (s.char.y - 8 * scale));
          const pd = pesterDist(tr.current!, now);
          if (mode() !== 'swatting' && d < pd && now - p.t < 500 && !(overHead && fl !== 'shaken')) {
            if (go(s, { type: 'pester' }, now)) trustNow(now, (t) => nudge(t, now, -SWAT_COST));
          } else if (mode() === 'swatting' && (d > Math.max(pd, PESTER) * 1.8 || now - p.t > 900)) go(s, { type: 'clear' }, now);
        }
        const swatting = mode() === 'swatting';
        const blocked = !!s.act?.block && now < s.act.at + s.act.dur * 1000; // standing up first / a beat / a flinch
        // a hand held over him: he doesn't back off sideways from it (he leans into it, or ducks it)
        const handOver = overHead && fl !== 'shaken' && (sense.speed <= PAT_SPEED * 1.5 || now - p!.t > 250);
        const stepping = s.stepGoal !== null && !blocked && !swatting;
        const follow = !!p && !reduce && !s.holdUntil && p.t > s.ignoreBefore && !blocked && !handOver && !stepping;
        if (stepping) {
          // a deliberate step: slow, all the way (no arrival slack)
          const x0 = s.walk.x;
          const ph0 = s.walk.phase;
          s.walk = stepWalk(s.walk, s.stepGoal!, dt, ext, { ...cfg, vmax: cfg.vmax * 0.5, arrive: 3, restart: 0 });
          s.walk.phase = (((ph0 + ((s.walk.x - x0) * (s.facing || 1)) / cfg.cycle) % 1) + 1) % 1; // a step back is a step back
          s.anchored = false;
          if (!s.walk.walking) {
            s.walk = { ...s.walk, v: 0 };
            const then = s.afterStep;
            s.stepGoal = null;
            s.afterStep = null;
            then?.(now);
          }
        } else if (!follow && !swatting && !settledWalk(s.walk)) {
          s.walk = stepWalk(s.walk, s.walk.x, dt, ext, cfg); // held up mid-stride: ease to a stop where he is
        }
        if (follow || swatting) {
          const prevX = s.walk.x;
          const prevPhase = s.walk.phase;
          // he keeps to his side of the pointer, as far off as he's comfortable with (wary: well back; warm: right by it)
          if (Math.abs(s.walk.x - raw) > 8) s.side = s.walk.x > raw ? 1 : -1;
          const goal = swatting ? s.walk.x + (p!.x > s.char.x ? -70 : 70) : raw + s.side * keepGap(tr.current!, now);
          backing = !swatting && Math.sign(goal - s.walk.x) === s.side && Math.abs(goal - s.walk.x) > 4;
          s.walk = stepWalk(s.walk, goal, dt, ext, swatting ? { ...cfg, vmax: cfg.vmax * 0.8 } : now < s.slowUntil ? { ...cfg, vmax: cfg.vmax * 0.6 } : cfg);
          const moved = s.walk.x - prevX;
          if (moved) {
            s.anchored = false;
            // gait runs backward when he backs away facing the pointer
            s.walk.phase = (((prevPhase + (moved * (s.facing || 1)) / cfg.cycle) % 1) + 1) % 1;
          }
        }
        if (!swatting) {
          if (s.walk.walking && mode() === 'idle') go(s, { type: 'move' }, now);
          else if (!s.walk.walking && mode() === 'walking') go(s, { type: 'stop' }, now);
        }

        // edge: pointer well past the end he's stuck at
        const stuck =
          follow &&
          settledWalk(s.walk) &&
          ext.hi - ext.lo > 60 &&
          !swatting &&
          ((raw > ext.hi + 10 && s.walk.x >= ext.hi - 0.5) || (raw < ext.lo - 10 && s.walk.x <= ext.lo + 0.5));
        if (!stuck) s.edgeSince = 0;
        else if (!s.edgeSince) s.edgeSince = now;
        else if (now - s.edgeSince > EDGE_BEAT * 1000) {
          s.edgeSince = 0;
          go(s, { type: 'take', plan: { kind: 'carry', why: 'edge', to: s.idx, x: home(s.idx) } }, now);
        }
      }

      // ---- the claw's own ideas: a press on him, or boredom ----
      if (pressed && !reduce && !byHand) {
        go(s, { type: 'take', plan: { kind: 'hand', why: 'press', to: -1, x: 0 } }, now);
        if (s.m.plan?.kind !== 'hand') holding = false; // the press didn't take (mid-handling)
      }
      if (byHand && mode() === 'carried' && !holding) go(s, { type: 'release' }, now);

      // ---- his own ideas: the pointer rests over another printed plate → find a way there ----
      if (free(mode()) && mode() !== 'swatting' && s.idx >= 0 && !reduce && p && p.t > s.ignoreBefore && (fl === 'tolerant' || fl === 'warm') && !overHead) {
        // ledges are small: a generous zone above them counts as resting over them
        const over = (q: (typeof ps)[number], i: number) =>
          cache[i].ledge
            ? p.x >= q.left - 24 && p.x <= q.left + cache[i].width + 24 && p.y >= q.top - 110 && p.y <= q.bottom + 16
            : p.x >= q.left && p.x <= q.left + cache[i].width && p.y >= q.top - 40 && p.y <= q.bottom;
        const j = ps.findIndex((q, i) => i !== s.idx && q.ok && q.visible && over(q, i));
        if (j !== s.want) {
          s.want = j;
          s.wantSince = now;
          if (j < 0) s.wantFail = -1;
          if (j >= 0) wakeIn(DWELL);
        } else if (j >= 0 && j !== s.wantFail && now - s.wantSince > DWELL * 1000) {
          const ok = ps.map((q, i) => (q.ok && q.visible) || i === s.idx); // never via a surface tucked under the header
          const S = surfaces(ok);
          const tx = clampTo(p.x - ps[j].left, cache[j].ext) + cache[j].left;
          const route = planRoute(S, { s: s.idx, x: cache[s.idx].left + s.walk.x }, { s: j, x: tx }, lim);
          if (route && route.some((mv) => mv.kind !== 'walk')) {
            s.route = route;
            s.leg = 0;
            s.legAt = now;
            go(s, { type: 'hop' }, now);
            s.idx = j;
          } else s.wantFail = j;
        }
      } else if (!free(mode())) s.want = -1;

      // ---- left alone: fidget, explore, sit — or the claw has an idea ----
      const near = company(s, p);
      const still = p ? (now - p.t) / 1000 : 0;
      if (mode() === 'idle' && s.idx >= 0 && !reduce && !s.walk.walking && !s.holdUntil && !s.act && !s.patting && s.stepGoal === null && near && fl === 'warm' && !uneasy(tr.current!, now)) {
        // fully at ease and the pointer resting right by him: he sits down beside it
        const by = Math.abs(near.p.x - s.char.x) < 110 && Math.abs(near.p.y - s.char.y) < 240;
        if (by && still >= SIT_REST) sitBeside(s, near.p, now);
        else if (by && s.sitWake !== near.p.t) {
          s.sitWake = near.p.t;
          wakeIn(SIT_REST - still);
        }
      }
      if (mode() === 'idle' && s.idx >= 0 && !reduce && now >= s.idleAt && !s.walk.walking && !s.holdUntil && !s.act && !s.patting && s.stepGoal === null && !s.turnPending) {
        const quiet = (now - attnAt) / 1000;
        // shaken, he won't wander off; with the pointer about he stays with it (and minds it)
        const stay = uneasy(tr.current!, now) || !!near;
        const c = decideIdle({ quiet, explored: s.explored, recent: s.fidgets, rand: Math.random, feel: fl, stay });
        if (c.kind === 'fidget') startFidget(s, c.fidget, now);
        else if (c.kind === 'claw') clawRelocate(s, ps, now);
        else if (!startExplore(s, c.kind === 'rest' ? 'rest' : 'explore', ps, now) && !(c.kind === 'rest' && startExplore(s, 'explore', ps, now))) {
          // nowhere to go on his own: sometimes the claw obliges, otherwise he stays and fidgets later
          if (Math.random() < 0.4) clawRelocate(s, ps, now);
          else startFidget(s, 'look', now);
        }
        if (mode() === 'idle') armIdle(now, 'nothing');
      }

      // ---- busy: the thing he's doing plays out; sitting has its own clock ----
      if (mode() === 'fidget' && (!s.act || now >= s.act.at + s.act.dur * 1000)) {
        const pend = s.pending; // had his look: now he goes
        go(s, { type: 'done' }, now);
        if (pend && mode() === 'idle') beginRoute(s, pend.poi, pend.route, now);
      }
      if (mode() === 'sitting') {
        if (now >= s.sitUntil) {
          go(s, { type: 'attend' }, now); // had enough: gets up
        } else if (now >= s.kickAt) {
          s.kickFrom = now;
          s.kickAt = now + (KICK + kickDelay(Math.random)) * 1000;
          wakeIn((s.kickAt - now) / 1000);
        }
      }

      // ---- a print arm swinging close past him: duck ----
      if (!reduce && (free(mode()) || mode() === 'fidget') && now > s.duckUntil) {
        const { sx, sy } = viewport();
        const head = { x: s.char.x + sx, y: s.char.y + sy - 14 * scale };
        cache.forEach((c, i) => {
          const a = c.el.dataset.arm; // printing, or swinging back up off the finished plate
          const was = s.arms[i];
          s.arms[i] = a ?? '';
          if (!a || !was || a === was || now <= s.duckUntil) return;
          const [bx, by, tx, ty] = a.split(' ').map(Number);
          const B = { x: c.left + bx, y: c.top + by };
          const T = { x: c.left + tx, y: c.top + ty };
          const vx = T.x - B.x;
          const vy = T.y - B.y;
          const u = clamp(((head.x - B.x) * vx + (head.y - B.y) * vy) / Math.max(1, vx * vx + vy * vy));
          if (Math.hypot(head.x - (B.x + vx * u), head.y - (B.y + vy * u)) < 50 * scale) {
            if (mode() === 'fidget') go(s, { type: 'done' }, now);
            play(s, 'duck', now);
            s.duckUntil = now + 2600;
          }
        });
      }
      pressed = null;

      // ---- motion for the current mode ----
      const prevX = s.char.x;
      const m = s.m;
      const k = clamp((now - m.since) / 1000 / (m.mode === 'grabbed' ? (m.plan?.kind === 'hand' ? GRAB_HAND : GRAB) : m.mode === 'landing' ? LAND : s.dur));
      const perchPos = (i: number, x: number): Pt => ({ x: ps[i].left + x, y: ps[i].pt.y });
      let lean: number | null = null; // fixed pose angle (drag) instead of pendulum physics
      let ragdoll = false;
      s.action = undefined;
      if (m.mode === 'swatting') {
        const t = (now - m.since) / 1000;
        const fd = s.flinchSwat ? ACT_DUR.flinch * 0.75 : 0; // the recoil before the first swat
        if (t < fd) {
          s.action = 'flinch';
          s.actionK = (t / fd) * 0.75; // ends three quarters back up, straight into the swat
        } else {
          s.action = 'swat';
          s.actionK = ((((t - fd) / SWAT) % 1) + 1) % 1;
        }
      } else s.flinchSwat = false;
      // shuffling out to the edge as he sits / back as he stands
      if (s.act?.kind === 'sit') s.seat = lerp(s.seatFrom, s.seatTo, easeInOut(clamp((now - s.act.at) / 1000 / s.act.dur)));
      switch (m.mode) {
        case 'swatting':
        case 'idle':
        case 'walking':
        case 'landing':
        case 'fidget':
        case 'sitting':
          if (s.idx >= 0) s.char = perchPos(s.idx, s.walk.x + s.seat);
          s.grip = m.mode === 'landing' ? 1 - easeInOut(k) : 0;
          if (m.mode === 'landing' && k >= 1) go(s, { type: 'landed' }, now);
          break;
        case 'grabbed':
          if (s.idx >= 0 && m.plan?.kind !== 'hand') s.char = perchPos(s.idx, s.walk.x); // by hand: he stays where you caught him
          s.grip = easeInOut(k);
          if (k >= 1) go(s, { type: 'gripped' }, now);
          break;
        case 'dangling':
          s.char = { ...heldPt };
          s.grip = 1;
          break;
        case 'carried': {
          const plan = m.plan!;
          if (plan.kind === 'hand') {
            // the claw follows the pointer; he hangs from the collar
            if (hand) {
              const goal = { x: hand.x - COLLAR.x * s.shown * scale, y: hand.y - COLLAR.y * scale };
              const a = 1 - Math.pow(1e-6, dt);
              const nx = lerp(s.char.x, goal.x, a);
              const ny = lerp(s.char.y, goal.y, a);
              const b = 1 - Math.pow(0.02, dt);
              s.hv = { x: lerp(s.hv.x, (nx - s.char.x) / Math.max(dt, 1e-3), b), y: lerp(s.hv.y, (ny - s.char.y) / Math.max(dt, 1e-3), b) };
              s.char = { x: nx, y: ny };
            }
            s.grip = 1;
            ragdoll = true;
            break;
          }
          const target = plan.to < 0 ? heldPt : perchPos(plan.to, plan.x);
          const e = easeInOut(k);
          const peak = Math.min(s.from.y, target.y) - s.lift;
          const mx = (s.from.x + target.x) / 2;
          let x = (1 - e) * (1 - e) * s.from.x + 2 * (1 - e) * e * mx + e * e * target.x;
          let y = (1 - e) * (1 - e) * s.from.y + 2 * (1 - e) * e * peak + e * e * target.y;
          if (plan.kind === 'tour') {
            // a short loop out and back while up in the air: shown around, then put down
            const dir = s.from.x < vp.w / 2 ? 1 : -1;
            const amp = Math.min(150, vp.w * 0.18);
            x += Math.sin(2 * Math.PI * e) * amp * dir;
            y += -Math.sin(2 * Math.PI * e) * Math.sin(Math.PI * e) * 30;
          }
          s.char = { x, y };
          s.grip = 1;
          if (k >= 1) go(s, { type: 'arrived' }, now);
          break;
        }
        case 'falling': {
          const f = s.fall!;
          const t = (now - m.since) / 1000;
          const u = clamp(t / f.T);
          const x = f.x0 + (f.x1 - f.x0) * u + f.vx * f.T * u * (1 - u) * 0.5;
          const y = f.y0 + f.vy * Math.min(t, f.T) + (GRAVITY * Math.min(t, f.T) ** 2) / 2;
          s.char = { x: x - viewport().sx, y: (u >= 1 ? f.y1 : y) - viewport().sy };
          s.grip = Math.max(0, s.grip - dt * 6);
          ragdoll = true;
          if (u >= 1) {
            s.fall = null;
            s.squash = 0.16;
            if (f.to >= 0) play(s, 'land', now);
            if (f.to >= 0) {
              s.idx = f.to;
              s.walk = { x: clampTo(f.x1 - cache[f.to].left, cache[f.to].ext), v: 0, phase: s.walk.phase, walking: false };
              s.anchored = false;
              s.placedBest = best;
              s.holdUntil = now + 1500; // catches his breath before following again
            } else s.idx = -1;
            go(s, { type: 'arrived' }, now);
          }
          break;
        }
        case 'hopping':
        case 'exploring': {
          // his own route: one Move at a time, in document space
          const route = s.route!;
          let mv = route[s.leg];
          let t = (now - s.legAt) / 1000 / mv.duration;
          while (t >= 1 && s.leg < route.length - 1) {
            if (mv.kind === 'jump' || mv.kind === 'fall' || mv.kind === 'climb') {
              s.squash = mv.kind === 'climb' ? 0.04 : 0.1;
              if (mv.kind !== 'climb') play(s, 'land', now); // knees give, arms out: follow-through
            }
            s.legAt += mv.duration * 1000;
            s.leg++;
            mv = route[s.leg];
            t = (now - s.legAt) / 1000 / mv.duration;
          }
          const smp = sampleMove(mv, t, 40 * (scale / 1.85));
          const prevPhase = s.walk.phase;
          s.char = { x: smp.p.x - viewport().sx, y: smp.p.y - FEET * scale - viewport().sy };
          const dir = mv.to.x >= mv.from.x ? 1 : -1;
          if (Math.abs(mv.to.x - mv.from.x) > 1) s.facing = dir;
          if (smp.action === 'walk') s.walk = { ...s.walk, v: dir * (m.mode === 'exploring' ? limX : lim).speed, phase: (prevPhase + Math.abs(s.char.x - prevX) / cfg.cycle) % 1 };
          else {
            s.walk = { ...s.walk, v: 0 };
            s.action = smp.action;
            s.actionK = smp.k;
          }
          s.grip = 0;
          if (t >= 1) {
            const last = route[route.length - 1];
            if (last.kind !== 'walk') {
              s.squash = 0.1;
              if (last.kind !== 'climb') play(s, 'land', now);
            }
            s.route = null;
            s.idx = last.onto;
            s.walk = { x: clampTo(last.to.x - cache[last.onto].left, cache[last.onto].ext), v: 0, phase: s.walk.phase, walking: false };
            s.anchored = false;
            s.placedBest = best;
            s.want = -1;
            const exploring = m.mode === 'exploring';
            go(s, { type: 'arrived' }, now);
            if (exploring && s.goal) arrive(s, now);
          }
          break;
        }
        case 'dragged': {
          // along the surface by the collar: body leans, legs trail, feet scrape
          const plan = m.plan!;
          const e = easeInOut(k);
          const x = lerp(s.fromX, plan.x, e);
          const dir = plan.x >= s.fromX ? 1 : -1;
          const speed = Math.sin(Math.PI * k); // 0 at the ends
          const scrape = Math.sin(now / 45) * 0.025 + Math.sin(now / 71) * 0.015; // catching on the surface
          lean = dir * (0.08 + 0.2 * speed) + scrape * speed;
          s.walk = { ...s.walk, x, phase: (s.walk.phase + (Math.abs(x - s.walk.x) / (cfg.cycle * 1.6))) % 1 };
          const at = perchPos(s.idx, x);
          // rotating about the collar lifts the feet; drop him so they stay on the surface
          s.char = { x: at.x, y: at.y + reach * (1 - Math.cos(lean)) };
          s.grip = 1;
          if (k >= 1) go(s, { type: 'arrived' }, now);
          break;
        }
      }

      // on-the-spot action (fidget / activity / reaction) under whatever the mode is doing
      let kick = 0;
      s.amp = s.act?.kind === 'tap' ? s.amp : 1;
      if (s.m.mode === 'sitting') {
        s.action = 'sit';
        s.actionK = s.act?.kind === 'sit' ? clamp((now - s.act.at) / 1000 / s.act.dur) : 1;
        if (s.kickFrom) {
          const u = (now - s.kickFrom) / 1000 / KICK;
          if (u >= 1) s.kickFrom = 0;
          else kick = kickAt(u);
        }
        if (s.act && now >= s.act.at + s.act.dur * 1000) s.act = null;
      } else if (s.act) {
        const u = (now - s.act.at) / 1000 / s.act.dur;
        if (u >= 1) {
          const then = s.act.then;
          s.act = null;
          if (then && !ragdoll && (free(s.m.mode) || own(s.m.mode))) then(now); // the next beat of a sequence
          if (s.act && !s.action) {
            // it starts this frame: no blank frame between beats
            s.action = (s.act as Act).kind;
            s.actionK = 0;
          }
        } else if (!s.action && !ragdoll) {
          s.action = s.act.kind;
          s.actionK = s.act.reverse ? 1 - u : u;
          if (s.act.kind === 'crouch' && !s.tapped && u >= NODE_TAP && s.goal?.kind === 'node' && s.goal.target !== undefined) {
            s.tapped = true;
            lightNode(goalNode);
          }
          if (s.act.kind === 'tap' && !s.tapped && u >= TAP_AT && s.goal?.kind === 'stone' && s.goal.target !== undefined) {
            // the hand meets the stone: it swings on its wires
            s.tapped = true;
            const el = cache[s.goal.target]?.el;
            if (el) {
              el.style.setProperty('--swing-dir', String(s.shown));
              setAttr(el, 'data-swing', el.dataset.swing === 'a' ? 'b' : 'a');
            }
          }
        }
      }

      s.kick = kick;
      // pendulum swing while carried, settles otherwise; drags hold a lean
      const inAir = s.m.mode === 'carried' || s.m.mode === 'dangling';
      const vx = (s.char.x - prevX) / Math.max(dt, 0.001);
      if (ragdoll && s.rd) {
        // falling: the collar drops with him, so gravity barely pulls his limbs (they float up loose)
        s.rag = stepRagdoll(s.rd, collarOf(s), dt, scale, m.mode === 'falling' ? 0.5 : 1);
        s.ragW = 1;
        s.swing = s.rag.torso;
        s.swingV = s.rd.torso.v;
      } else if (lean !== null) {
        s.swing = lean;
        s.swingV = 0;
      } else {
        const targetSwing = inAir ? clamp(-vx * 0.0009, -0.55, 0.55) : 0;
        s.swingV += ((targetSwing - s.swing) * 40 - s.swingV * 6) * dt;
        s.swing += s.swingV * dt;
      }
      s.squash = Math.max(0, s.squash - dt * 0.6);
      if (!ragdoll && s.ragW > 0) {
        s.ragW = Math.max(0, s.ragW - dt * 3); // limbs ease back to the pose after he lands
        if (s.ragW === 0) {
          s.rag = null;
          s.rd = null;
        }
      }

      // facing: direction of travel while handled or walking; otherwise toward the pointer (or the page centre)
      const handled = held(s.m.mode);
      const fresh = !!p && p.t > s.ignoreBefore; // a pointer he's still minding
      if (s.m.mode === 'hopping' || s.m.mode === 'exploring' || own(s.m.mode)) {
        // set by the route / the activity
      } else if (s.act?.block && now < s.act.at + s.act.dur * 1000) {
        // standing up: not yet
      } else if (s.m.mode === 'swatting' && p) {
        s.facing = p.x > s.char.x ? 1 : -1; // faces the pest while backing off
      } else if (handled || s.m.mode === 'falling') {
        if (Math.abs(vx) > 30) s.facing = vx > 0 ? 1 : -1;
      } else if (s.stepGoal !== null) {
        // a deliberate step (or a step back out from under a hand): he keeps facing the way he was
      } else if (backing && p) {
        if (Math.abs(p.x - s.char.x) > 12) s.facing = p.x > s.char.x ? 1 : -1; // edges away, keeping an eye on it
      } else if (Math.abs(s.walk.v) > 2) s.facing = s.walk.v > 0 ? 1 : -1;
      else if (fresh) {
        // toward the pointer, but not round and round after one darting back and forth across him
        if (Math.abs(p!.x - s.char.x) > 28 && now - s.faceAt > FACE_GAP * 1000) s.facing = p!.x > s.char.x ? 1 : -1;
      } else if (!p && !s.ignoreBefore) s.facing = s.char.x < vp.w / 2 ? 1 : -1;
      // the about-face: facing flips instantly partway through a short pivot (head first, weight, a step
      // across — or a little hop when he's standing). Held, falling or reduced motion: just flips.
      const pivots = !reduce && !ragdoll && (afoot(s.m.mode) || s.m.mode === 'landing') && s.m.mode !== 'sitting';
      if (s.turnAt && s.facing === s.shown && now - s.turnAt < FLIP * TURN * 1000) s.turnAt = 0; // changed his mind before the flip
      if (s.facing !== s.shown && !s.turnAt) {
        if (!pivots) s.shown = s.facing;
        else {
          s.turnAt = now;
          s.faceAt = now;
          s.turnTo = s.facing;
          s.turnHop = s.amt < 0.25 && !s.action;
        }
      }
      if (s.turnAt) {
        const u = (now - s.turnAt) / 1000 / TURN;
        if (u >= FLIP) s.shown = s.turnTo;
        if (u >= 1) s.turnAt = 0;
      }

      // gait amplitude follows speed; eases out when he stops. Dragged: a weak stumble, feet scraping.
      const amtGoal =
        free(s.m.mode) || ((s.m.mode === 'hopping' || s.m.mode === 'exploring') && s.walk.v !== 0) ? clamp(Math.abs(s.walk.v) / (cfg.vmax * 0.35)) : s.m.mode === 'dragged' ? 0.35 : 0;
      s.amt = amtGoal >= s.amt ? amtGoal : Math.max(amtGoal, s.amt - dt * 4);

      // a glance at the pointer for a moment after it moves, while he stands still
      const looking = free(s.m.mode) && !reduce && fresh && !s.walk.walking && (now - p!.t) / 1000 < LOOK;
      const headY = s.char.y - 28 * scale;
      const aim = own(s.m.mode) && s.m.mode !== 'exploring' && s.look ? { x: s.look.x - viewport().sx, y: s.look.y - viewport().sy } : null;
      // at ease with you, he keeps an eye on the pointer when it rests by him (a steady aim: the loop still settles).
      // Wary or shaken he never takes his eyes off it, even backing away.
      const watchful = (fl === 'wary' || fl === 'shaken') && free(s.m.mode);
      const gaze = !reduce && near && ((s.m.mode === 'idle' && fl === 'warm' && !s.walk.walking) || watchful) ? near.p : null;
      // a beat of a reaction (turning point, greeting) looks at you; with no pointer, up and out
      const v = s.act?.look && !reduce ? (visitor() ?? { x: s.char.x + s.facing * 160, y: s.char.y - 260 }) : null;
      const tiltGoal = s.patW > 0.4
        ? 0 // a pat: the posture lifts his chin into it
        : v
          ? lookAngle(v.x - s.char.x, v.y - headY, 0.4)
          : gaze && watchful
            ? lookAngle(gaze.x - s.char.x, gaze.y - headY, 0.45)
            : looking
              ? lookAngle(p!.x - s.char.x, p!.y - headY)
              : aim
                ? lookAngle(aim.x - s.char.x, aim.y - headY, 0.3)
                : gaze
                  ? lookAngle(gaze.x - s.char.x, gaze.y - headY, 0.6)
                  : 0;
      // ---- how he holds himself: eases toward his mood's posture (reduced motion: just is) ----
      const standing = afoot(s.m.mode) || s.m.mode === 'landing';
      const pg = POSTURE[fl];
      const ease = (cur: number, goal: number, base: number) => (reduce || Math.abs(goal - cur) < 0.004 ? goal : lerp(cur, goal, 1 - Math.pow(base, dt)));
      s.hunch = ease(s.hunch, standing ? pg.hunch : 0, 0.04);
      s.open = ease(s.open, standing ? pg.open : 0, 0.08);
      s.patW = ease(s.patW, s.patting && standing ? 1 : 0, s.patting ? 0.01 : 0.05);
      s.tilt = Math.abs(tiltGoal - s.tilt) < 0.002 ? tiltGoal : lerp(s.tilt, tiltGoal, 1 - Math.pow(0.004, dt));

      // the idle claw trails behind him on a leash around its resting spot (never at rest over his text);
      // while it has him (or is reaching for him) it rides right above.
      const reaching = handled || s.grip > 0;
      const rest = s.idx >= 0 ? ps[s.idx].pt.x + HOVER : s.char.x + HOVER;
      const leash = vp.w < 700 ? 30 : 220;
      const hoverGoal = reaching ? s.char.x + HOVER * 0.5 : rest + clamp(s.char.x - HOVER * s.facing - rest, -leash, leash);
      s.hoverX = Math.abs(hoverGoal - s.hoverX) < 0.01 ? hoverGoal : lerp(s.hoverX, hoverGoal, 1 - Math.pow(reaching ? 0.002 : 0.12, dt));
      const baseGoal = reaching ? s.char.x : s.hoverX - 10;
      s.baseX = lerp(s.baseX, baseGoal, 1 - Math.pow(reaching ? 0.005 : 0.02, dt));
      draw();

      // settled: idle and still, everything at rest, claw arrived → sleep until something changes
      const settled =
        (s.m.mode === 'idle' || (s.m.mode === 'sitting' && !s.kickFrom)) &&
        !s.edgeSince &&
        !s.act &&
        settledWalk(s.walk) &&
        s.amt === 0 &&
        !s.turnAt &&
        s.shown === s.facing &&
        s.tilt === tiltGoal &&
        s.hunch === (standing ? pg.hunch : 0) &&
        s.open === (standing ? pg.open : 0) &&
        s.patW === (s.patting && standing ? 1 : 0) &&
        s.stepGoal === null &&
        !looking &&
        s.hoverX === hoverGoal &&
        Math.abs(s.swing) < 1e-4 &&
        Math.abs(s.swingV) < 1e-4 &&
        s.squash === 0 &&
        s.ragW === 0 &&
        Math.abs(s.baseX - baseGoal) < 1e-4; // tight: a looser snap leaves the carriage visibly off by a sub-pixel
      if (s.m.mode === 'dangling') return Math.abs(s.swing) > 1e-4 || !reduce; // sways in the air; reduced motion: still
      if (settled) {
        // asleep, trust keeps changing on paper: wake when it next crosses a band (or fear fades)
        window.clearTimeout(trustTimer);
        const next = nextChange(tr.current!, now);
        if (next !== null) trustTimer = window.setTimeout(() => loop.wake(), Math.min(next, 600) * 1000 + 20);
      }
      return !settled;
    };

    const draw = () => {
      const s = st.current;
      if (!s) return;
      const collar = collarOf(s);
      const hover = { x: s.hoverX, y: Math.max(vp.h * 0.08, s.char.y - 170) };
      const g = clamp(s.grip);
      const tip = { x: lerp(hover.x, collar.x, g), y: lerp(hover.y, collar.y, g) };
      const t = vp.w < 700 ? 12 : 20;
      const base = { x: s.baseX, y: -t * 2 };
      // elbow side flips only once the tip is well past the carriage (no elbow pop as he walks)
      if (tip.x > base.x + 40) s.bend = -1;
      else if (tip.x < base.x - 40) s.bend = 1;
      const mode = s.m.mode;
      const loose = s.rag && s.ragW > 0;
      const dangle = loose ? 0.3 * s.ragW : mode === 'carried' || mode === 'dangling' ? 1 : mode === 'dragged' ? 0.55 : 0;
      const w = s.ragW;
      const rag = loose ? { torso: 0, head: s.rag!.head * w, armL: s.rag!.armL * w, armR: s.rag!.armR * w, legL: s.rag!.legL * w, legR: s.rag!.legR * w } : undefined;
      const turn = s.turnAt ? { k: clamp((performance.now() - s.turnAt) / 1000 / TURN), hop: s.turnHop } : undefined;
      const pose: Pose = {
        swing: 0,
        dangle,
        facing: s.shown,
        squash: s.squash,
        phase: s.walk.phase,
        walk: s.amt,
        tilt: s.tilt,
        rag,
        action: s.action,
        actionK: s.actionK,
        kick: s.kick,
        amp: s.amp,
        turn,
        tremble: s.tremble,
        mood: { hunch: s.hunch, open: s.open, pat: s.patW },
      };
      // character pivots on the collar while the claw has him
      const pivot = Math.abs(s.swing) > 1e-4;
      setAttr(tiltRef.current, 'transform', pivot ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : null);
      charRef.current?.set(s.char.x, s.char.y, scale, pose);
      armRef.current?.set({ base, tip, bend: s.bend, grip: g });
    };

    const loop = ticker.loop(frame);
    if (import.meta.env.DEV) {
      // dev only: `__puppet.play('scratch')` plays an action on the spot; `__puppet.mode` reads the machine
      Object.assign(window, {
        __puppet: {
          play: (kind: Action) => {
            const s = st.current;
            if (s && go(s, { type: kind === 'sit' ? 'sit' : 'fidget' }, performance.now())) {
              play(s, kind, performance.now());
              if (kind === 'sit') s.sitUntil = performance.now() + 8000;
              loop.wake();
            }
          },
          /** go and visit a point of interest whose id starts with `prefix` (e.g. 'node', 'printer') */
          visit: (prefix: string) => {
            const s = st.current;
            if (!s || s.idx < 0 || s.m.mode !== 'idle') return false;
            const ok = startExplore(s, 'explore', lastSeen, performance.now(), (q) => q.id.startsWith(prefix));
            loop.wake();
            return ok;
          },
          get mode() {
            return st.current?.m.mode;
          },
          get state() {
            return st.current;
          },
          get frames() {
            return frames;
          },
          /** trust 0..1 (set: also clears fear); `fear` 0..1; `feel` = the band he's in */
          get trust() {
            return advance(tr.current!, performance.now()).v;
          },
          set trust(v: number) {
            trustNow(performance.now(), (t) => ({ ...advance(t, performance.now()), v: clamp(v), fear: 0, full: t.full || v >= FULL }));
            loop.wake();
          },
          get fear() {
            return advance(tr.current!, performance.now()).fear;
          },
          set fear(f: number) {
            trustNow(performance.now(), (t) => ({ ...advance(t, performance.now()), fear: clamp(f) }));
            loop.wake();
          },
          get feel() {
            return feel(performance.now());
          },
          /** what the pointer was last classified as doing (trust.ts Cond) */
          get cond() {
            return st.current?.cond;
          },
          get patting() {
            return st.current?.patting;
          },
          get posture() {
            const s = st.current;
            return s && { hunch: s.hunch, open: s.open, pat: s.patW };
          },
          /** what he did and when: turning points, flinches, greetings, pats, fidgets */
          events,
          /** back to a wary stranger (also forgets the session copy) */
          reset() {
            try {
              window.sessionStorage.removeItem(SAVE_KEY);
            } catch {
              // nothing stored
            }
            tr.current = initTrust(performance.now());
            const s = st.current;
            if (s) {
              s.patDodged = false;
              s.band = feel(performance.now());
            }
            loop.wake();
          },
        },
      });
    }
    const wake = () => loop.wake();
    const offLayout = onLayout(() => {
      dirty = true;
      wake();
    });
    const mo = new MutationObserver(wake);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-printed'] });

    // attention: any real pointer move, tap or scroll means the user is around (his whims stop);
    // a big move or a scroll also pushes back his next idle decision
    let anchor: Pt | null = null;
    let near: Pt | null = null;
    const attention = (x: number, y: number) => {
      if (!near || Math.hypot(x - near.x, y - near.y) > ATTEND) {
        near = { x, y };
        attnAt = performance.now();
      }
      if (!anchor || Math.hypot(x - anchor.x, y - anchor.y) > BIG_MOVE) {
        anchor = { x, y };
        armIdle(performance.now(), 'attention');
      }
    };
    const onHim = (x: number, y: number) => {
      const s = st.current;
      const md = s?.m.mode;
      if (!s || reduce || !(afoot(md!) || md === 'landing' || md === 'falling')) return false;
      return Math.abs(x - s.char.x) < 18 * scale && y > s.char.y - 45 * scale && y < s.char.y + FEET * scale;
    };

    // pointer: mouse/pen follow live; touch follows the last tap (a short press that didn't scroll)
    let down: { x: number; y: number; t: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (holding) {
        hand = { x: e.clientX, y: e.clientY };
        wake();
      }
      if (e.pointerType === 'touch') return;
      const t = performance.now();
      const s = st.current;
      const d = s ? Math.hypot(e.clientX - s.char.x, e.clientY - (s.char.y - 8 * scale)) : Infinity;
      const last = sense.last;
      if (last && !sense.touch && !sense.gone) {
        // smoothed speed and approach (toward him), ~0.15 s
        const dt = Math.max(0.008, (t - last.t) / 1000);
        const a = 1 - Math.exp(-dt / 0.15);
        sense.speed = lerp(sense.speed, Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt, a);
        sense.approach = Number.isFinite(d) && Number.isFinite(last.d) ? lerp(sense.approach, (last.d - d) / dt, a) : 0;
      } else {
        sense.speed = 0;
        sense.approach = 0;
      }
      sense.last = { x: e.clientX, y: e.clientY, t, d };
      sense.touch = false;
      sense.gone = false;
      ptr.current = { x: e.clientX, y: e.clientY, t };
      attention(e.clientX, e.clientY);
      wake();
    };
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      sense.gone = true; // the mouse left the window: he's left alone
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && onHim(e.clientX, e.clientY)) {
        e.preventDefault(); // no text selection / focus change under him
        pressed = { x: e.clientX, y: e.clientY };
        holding = true;
        hand = { x: e.clientX, y: e.clientY };
        document.documentElement.style.cursor = 'grabbing';
        wake();
        return;
      }
      if (e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const letGo = () => {
      if (!holding) return;
      holding = false;
      document.documentElement.style.cursor = '';
      wake();
    };
    const onUp = (e: PointerEvent) => {
      letGo();
      if (e.pointerType !== 'touch' || !down) return;
      const isTap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 600;
      down = null;
      if (!isTap) return;
      const s = st.current;
      sense.touch = true;
      sense.last = null;
      if (s) trustNow(performance.now(), (t) => tap(t, performance.now(), Math.hypot(e.clientX - s.char.x, e.clientY - (s.char.y - 8 * scale))));
      ptr.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      attention(e.clientX, e.clientY);
      wake();
    };
    const onCancel = () => {
      down = null;
      letGo();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (holding && e.cancelable) e.preventDefault(); // dragging him doesn't scroll the page
    };
    const onScroll = () => {
      attnAt = performance.now();
      lastScroll = attnAt;
      armIdle(attnAt, 'attention');
      if (sense.touch) {
        // staying on a section starts to count once the scrolling stops (one timer, re-armed)
        window.clearTimeout(lingerTimer);
        lingerTimer = window.setTimeout(wake, LINGER_AFTER * 1000 + 20);
      }
      wake();
    };
    // a hidden page earns nothing (he isn't being looked at); a reload in this session keeps trust
    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        trustNow(now, (t) => observe(t, now, 'neutral'));
        save(now, true);
      } else wake();
    };
    const onPageHide = () => save(performance.now(), true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('blur', letGo);
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    draw();
    wake();
    return () => {
      loop.stop();
      offLayout();
      mo.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('blur', letGo);
      document.documentElement.style.cursor = '';
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.clearTimeout(trustTimer);
      window.clearTimeout(lingerTimer);
      save(performance.now(), true);
      unlightNode();
    };
  }, [vp, reduce]);

  if (!vp.w) return null;
  const t = vp.w < 700 ? 12 : 20;
  const l = vp.h * 0.42;
  return (
    <>
      <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full overflow-visible" viewBox={`0 0 ${vp.w} ${vp.h}`} aria-hidden="true">
        <g ref={tiltRef}>
          <Character ref={charRef} />
        </g>
        <MechArm ref={armRef} l1={l} l2={l} t={t} tool="claw" toolLen={t * 2.6} />
      </svg>
      <TrustLine ref={lineRef} />
    </>
  );
}
