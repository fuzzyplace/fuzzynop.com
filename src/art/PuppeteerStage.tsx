import { useReducedMotion } from './reducedMotion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character, STRIDE, type Action, type CharacterHandle, type Pose } from './Character';
import { choosePoi, collectPois, remember, type Poi, type Scene, type SceneSurface } from './explore';
import { KICK, SIT_FOR, kickAt, kickDelay, pickFidget, type Fidget } from './idle';
import { noteRecent, pickVaried } from './moodVariety';
import { ACT_DUR, FLIP, TAP_AT, TAP_HOP, TURN, type AnyAction } from './poses';
import { createProbeDriver, type Cursor, type SeenLike } from './probeDriver'; // ---- probe hook ----
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { LIMITS, planRoute, sampleMove, type Move, type Surface } from './navigate';
import { PRESS, afoot, free, held, initial, own, transition, type Ev, type Machine } from './puppet-machine';
import { START as NEEDS0, WHIM_GAP, choose, grow, nextIn, satisfy, type Activity, type Cursor as BrainCursor, type Needs } from './desires';
import { INSIDE, freeSpaces, type Rect as Box } from './interior';
import { canTrick, endLetters as endLettersOf, lettersAt, meAt, planTrick, TRICKS, type LBox, type LetterProgram, type Trick } from './letterPlay';
import { chooseDest, hopPhase, IN, OUT, STAY_FULL, startHop, type Hop, type Spot } from './teleport';
import { measureTitle, resetGlyphs, setGlyph, titleEl, titleMap } from './targets';
import { createRagdoll, primeRagdoll, stepRagdoll, type RagPose, type Ragdoll } from './ragdoll';
import { onLayout, setAttr, ticker, view as viewport } from './ticker';
import { TrustLine, type TrustLineHandle } from './TrustLine';
import { createStunt, type StuntView } from './stuntDriver'; // ---- stunt hook ----
import { sfx } from '../audio/bus'; // ---- sfx hook ----
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
 * The ink character of Z, an agent of his own on the page (v2.7). He's an overlay: the scroll moves
 * and assembles the page; he lives on it. Surfaces = elements with [data-perch] (a plate only once
 * it's assembled, [data-printed="1"]; optional [data-perch-span] = px half-width he may walk) plus the
 * free space inside each assembled paper plate (interior.ts nooks: margins, the room beside a short
 * line, beside the circuit tree, after a title), where he's drawn smaller, further into the paper.
 *
 * Behaviour is an explicit state machine (`puppet-machine.ts`). The claw on the ceiling rail exists
 * for one thing only: the visitor pressing on him. It drops in, grabs his collar, follows the pointer
 * (he hangs as a ragdoll, ragdoll.ts); let go and he falls onto the surface below (or the nearest),
 * lands, and the claw goes back up out of sight. Nothing else ever puts him in the claw.
 *
 * He gets about on his own: walks, runs, jumps, climbs and drops between surfaces (navigate.ts), and
 * teleports (teleport.ts): he runs off into ink drops and gathers himself somewhere else, then shakes
 * himself off. He teleports when there's no way on foot, when he's been off screen a few seconds and
 * wants company, when the surface under him is going (a plate taken apart as you scroll back up), to
 * slip in and out of a plate, and now and then on a whim (≥ 20 s apart).
 * - Scroll: he doesn't follow it. He stays where he is (and so may leave the screen), then decides to
 *   come along: runs / jumps if it's close, teleports if it isn't (desires.ts company decides how soon).
 * - What he does is chosen by his needs (desires.ts): curiosity (explore, slip inside a plate and poke
 *   about), mischief (probes, letter play), company (go to the visitor, greet, sit near), show-off (the
 *   title stunt, a vanishing act), rest (sit, nap, watch). Never the same thing twice in a row.
 * - Letter play (letterPlay.ts): beside a title word he picks a letter up and carries it a step, swaps
 *   two, nudges the word crooked, stacks one on another or spins one; always puts it right in 3-6 s.
 * - On a surface he walks toward the pointer's x when it's near him (mouse: live; touch: last tap).
 * - Pointer buzzing close round him (mouse): he backs off and swats at it like a fly.
 * - Pointer resting over another printed plate: he makes his own way there — walk, jump, climb,
 *   drop (navigate.ts) — if he can.
 * - Fidgets (idle.ts): looks round, scratches his head, shifts his weight, pushes his glasses up,
 *   crouches. Explore finds (explore.ts): peeks over a plate's edge, hops up and taps a hung stone so it
 *   swings, crouches over ink, watches an arm assemble a plate, stands beside a heading, sits on edges
 *   with his legs dangling. The pointer coming close and he drops it and attends to you.
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
 *   away the first time and accepts the second. Arriving somewhere new under his own steam (a run to
 *   catch up, a teleport) while he trusts you, he greets you. Touch: gentle taps near him and staying
 *   on a section build trust. Thinking tells: a glance
 *   at where he's going before he sets off, blink-like dips, nothing twice in a row (moodVariety.ts).
 *
 * Perch rects (and plate nooks) are cached in document space, re-measured on layout and assembly
 * changes; a frame does no layout reads (choosing what to do measures once, every few seconds at
 * most). The loop sleeps once he's idle and settled — sitting still counts — and timers wake it for
 * the next decision, kick or come-along; scroll, layout, print-state and pointer input wake it too.
 *
 * Loaded on demand: `Puppeteer` (Puppeteer.tsx) mounts this after the first paint, when the main
 * thread goes idle, so the hero's text paints first.
 */
const BIG_MOVE = 48; // px of pointer travel that counts as attention
const FEET = 26; // character units from origin to feet
const COLLAR = { x: -4, y: -12 };
const MARGIN = 36; // px kept clear at each end of a perch
const LOOK = 1.8; // s he keeps glancing at the pointer after it last moved
const PESTER = 60; // px: pointer this close round him and he swats at it
const SWAT = 0.42; // s per swat
const DWELL = 0.7; // s the pointer rests over another plate before he sets off for it
const GRAB_HAND = 0.22; // s: the claw drops in and closes on him when you press
const CLAW_UP = 0.55; // s: after it lets go, the claw goes back up out of sight
const COME: [number, number] = [0.6, 1.8]; // (v2.9, was 0.9-2.6) s off screen before he comes along (strong company need → the short end)
const RUN = 2.6; // running vs. his walking pace (catching up)
const RUN_MAX = 2.8; // s: a catch-up run longer than this and he teleports instead
const NEAR_HIM = 220; // px: the pointer this close and his own whims stop (he attends to you)
const NAP: [number, number] = [9, 18]; // s lying down
const INSIDE_PAD = 6; // px he keeps from words inside a plate
const GRAVITY = 2200; // px/s², falls
const QUICK_SCROLL = 120; // px/s of scrolling past which he inks in quicker (less of a read-through spent gathering)
const QUICK_GAP = 0.1; // s between ink-out and ink-in then
const QUICK_IN = 0.7; // ink-in then, vs. its usual length
const HEADER = 64; // px of fixed header at the top of the viewport
const TALL = 70; // character units from the top of his head (hair) to his feet
const CLEAR = 12; // px kept between the header and the top of his head
const ATTEND = 6; // px of pointer travel that means the user is around (his own whims stop)
const EXPLORE_PACE = 0.72; // exploring walk speed vs. his usual
const SIT_REST = 2.5; // s the pointer rests beside him (fully trusted) before he sits down by it
const SIT_BESIDE: [number, number] = [20, 40]; // s he stays sat by it if it doesn't move
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
/** Greetings when he's arrived somewhere new and trusts you (picked without repeats). */
const GREET: Record<string, Action[]> = { wave: ['wave'], hop: ['hop', 'wave'], tilt: ['tilt', 'wave'], up: ['hop', 'lookUp'] };
const GREET_W = { wave: 1.4, hop: 1, tilt: 0.8, up: 0.7 };
/** What he does after the step at a turning point into warm. */
const WARM_W = { wave: 1.4, lookUp: 1, hop: 0.6, blink: 0.5 };

/** Something he does on the spot: a fidget, an activity at a point of interest, a reaction. */
type Act = {
  kind: AnyAction; // an Action, or a probe move (probeDriver.ts plays those)
  at: number;
  dur: number;
  reverse?: boolean;
  block?: boolean; // holds him where he is (no following) while it plays
  look?: boolean; // his head aims at the pointer while it plays
  then?: (now: number) => void; // what happens when it ends
};

/** He's on his way somewhere by ink: where to, and what then. */
type Tele = {
  hop: Hop;
  fromDoc: Pt; // where he was (document px, his origin)
  fromPin: { pin: Pin; top: number } | null; // he went from a sticky plate: his ink rides it (its document top then)
  kFrom: number;
  to: { id: string; x: number } | null; // perch id + x along it (null: resolved when he re-forms)
  poi: Poi | null; // a probe / activity goal on arrival
  then: ((now: number) => void) | null;
  greet: boolean;
  swapped: boolean; // passed the gap: he's at the destination now
  shook: boolean;
  why: string;
};
/** Letter play under way. */
type Letters = { prog: LetterProgram; word: LBox[]; els: Map<string, HTMLElement>; me: { x: number; feet: number; facing: 1 | -1; scale: number }; t0: number; x0: number };

type State = {
  m: Machine;
  char: Pt;
  idx: number; // perch / nook he stands on (or is headed to), -1 = nowhere (off the page, in your hand)
  pid: string; // that perch's id (survives re-measuring)
  k: number; // his size factor (1 outside, INSIDE in a plate)
  grip: number;
  swing: number;
  swingV: number;
  baseX: number;
  hoverX: number;
  bend: 1 | -1;
  claw: number; // 0..1 how far the claw has come down (only for a press)
  clawUpAt: number; // ms it let go (it goes back up)
  tele: Tele | null;
  awaySince: number; // ms he went off screen (0 = he's on it)
  awayFor: number; // s he'll stay away before coming along
  needs: Needs;
  needsAt: number;
  did: Activity[]; // what he chose lately, most recent first
  doing: Activity | null;
  whimAt: number; // ms of his last teleport on a whim
  stuntAt: number; // ms he last played the title stunt
  stuntAsk: number; // ms he asked for it (0 = not waiting)
  letters: Letters | null;
  lying: boolean;
  dx: number; // px he's stepped off his spot during letter play
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
  holdUntil: number; // after a landing he catches his breath, ignoring the pointer until this time
  idleAt: number; // when he next decides what to do with himself
  rd: Ragdoll | null; // limbs hang loose while held by hand / falling
  rag: RagPose | null;
  ragW: number; // 0..1 blend of the ragdoll pose (eases out after he lands)
  hv: Pt; // smoothed screen velocity while held by hand, px/s
  fall: Fall | null;
  route: Move[] | null; // his own way to another perch
  routeAt: { sy: number; from: number }; // the scroll his route was planned at, and the surface it starts on (pinned plates move with the scroll)
  leg: number;
  legAt: number;
  action: AnyAction | undefined;
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
  greetAt: number; // arrived somewhere new: greet the visitor then (0 = no)
  hidden: boolean; // nowhere on screen to be: out of sight until there is
  run: boolean; // his current route is a run (catching up)
  lwalk: boolean; // stepping during letter play
  pending: { poi: Poi; route: Move[]; sy: number } | null; // where he's going once he's had a look (a glance first); `sy`: the scroll it was planned at
  reacts: string[]; // recent reactions (greetings, flourishes), for no repeats
};
/** A fall in document px: start, initial velocity, landing (char origin), duration. */
type Fall = { x0: number; y0: number; vx: number; vy: number; x1: number; y1: number; T: number; to: number };
/**
 * A surface (document px). `nook`: free space inside a plate (he's `k` = INSIDE there, reached by
 * teleport only, never part of a walking route); `spot`: a one-off standing place (beside a probe
 * target inside a plate, on the title for letter play). `host`: index of the plate a nook belongs to.
 */
type Perch = {
  el: HTMLElement;
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  f: number;
  ext: Extent;
  ledge: boolean;
  k: number;
  nook: boolean;
  spot: boolean;
  host: number;
  wall: -1 | 0 | 1;
  lie: boolean;
  title: boolean;
  pin: Pin | null; // on a sticky plate: its document top follows the scroll while it's pinned
  top0: number; // `top` as measured (pin.t0 is the plate's document top then)
  dark: boolean; // he'd stand against black here (inside an ink plate, on the footer): a fog patch behind him
};
/** Standing here he's black on black: inside an ink plate, or on the footer. */
const darkAt = (el: HTMLElement, inside: boolean) => !!el.closest('footer') || (inside && !!el.querySelector('.plate-face.plate-ink'));
/**
 * A sticky plate (`.plate-pin`) as measured: native sticky puts its document top at
 * clamp(scrollY + stick, lo, hi), so a frame can place it (and everything on it) with no layout read.
 */
type Pin = { stick: number; lo: number; hi: number; t0: number };
/** Somewhere he may be: anything that isn't a plate, or a plate that's whole (pinned or not; data-assembled). */
const standable = (el: HTMLElement) => el.dataset.printed === undefined || el.dataset.assembled === '1';
/**
 * v2.9: a plate's top edge is somewhere to stand as soon as its sheet is down (data-sheet, words may
 * still be arriving: he stands above the plate, never over its text). Its insides (nooks, spots)
 * stay whole-and-still only (`standable` and not printing).
 */
const edgeOk = (el: HTMLElement) => el.dataset.printed === undefined || el.dataset.sheet === '1' || el.dataset.assembled === '1';
const insideOk = (el: HTMLElement) => standable(el) && el.dataset.printing !== '1';
type Pointer = { x: number; y: number; t: number };
/** A perch as seen this frame (viewport px). */
type Seen = { ok: boolean; left: number; pt: Pt; top: number; visible: boolean; onX: boolean; bottom: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function PuppeteerStage() {
  const reduce = useReducedMotion();
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const st = useRef<State | null>(null);
  const ptr = useRef<Pointer | null>(null);
  const charRef = useRef<CharacterHandle>(null);
  const armRef = useRef<ArmHandle>(null);
  const tiltRef = useRef<SVGGElement>(null);
  const hideRef = useRef<SVGGElement>(null);
  const fogRef = useRef<SVGEllipseElement>(null);
  const armWrap = useRef<SVGGElement>(null);
  const lineRef = useRef<TrustLineHandle>(null);
  const tr = useRef<Trust | null>(null); // survives resizes / the effect re-running
  const lineShown = useRef(false);

  // The live viewport height, read per frame. Phones show and hide their address bar on nearly every
  // change of scroll direction (a resize with a new innerHeight); that must not tear down and rebuild
  // the stage (cutting off a stunt, letter play or a drag), so `vp` (the effect's dependency) only
  // changes with the width or a large height change, and everything per frame reads `vh()`.
  const liveH = useRef(0);
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      liveH.current = h;
      setVp((p) => (p.w === w && Math.abs(p.h - h) < 160 ? p : { w, h }));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // layout effect: a resize re-poses the arm in the same commit that gives it new lengths
  useLayoutEffect(() => {
    if (!vp.w) return;
    const vh = () => liveH.current || vp.h;
    const scale = vp.w < 700 ? 1.3 : 1.85;
    const cfg = { ...WALK, cycle: 2 * STRIDE * scale }; // distance per gait cycle that keeps the planted foot still
    // a perch is only somewhere to put him if all of him fits below the fixed header: its top (his
    // feet) at least his full height plus a margin under it. Every placement goes through `visible`.
    const headroomK = (k: number) => HEADER + CLEAR + TALL * scale * k;
    const kIn = INSIDE;
    const szIn = scale * kIn;
    let cache: Perch[] = [];
    let spots: Perch[] = []; // one-off standing places (beside a probe target, on the title)
    const home = (i: number) => clampTo(cache[i].width * cache[i].f, cache[i].ext);
    /** What a reader needs inside a plate (document px): its lines of text, its controls and badges. */
    const plateText = (el: HTMLElement, sx: number, sy: number): { text: Box[]; titles: Box[] } => {
      const text: Box[] = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) text.push({ left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy });
      }
      el.querySelectorAll('a, button, svg, img, [data-poke="spin"], [data-poke="rattle"], [data-poke="tug"]').forEach((c) => {
        if (c.closest('.plate-arm') || c.closest('[aria-hidden="true"].pointer-events-none')) return; // the plate's own arm overlay
        const r = c.getBoundingClientRect();
        if (r.width > 1 && r.height > 1 && r.width < el.clientWidth * 0.95) text.push({ left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy });
      });
      const titles: Box[] = [];
      el.querySelectorAll('h2').forEach((h) => {
        range.selectNodeContents(h);
        for (const r of range.getClientRects()) if (r.width > 1) titles.push({ left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy });
      });
      return { text, titles };
    };
    /** A sticky plate's document top at scroll `sy` (what native sticky does). */
    const pinTop = (pin: Pin, sy: number) => clamp(sy + pin.stick, pin.lo, pin.hi);
    /** Surfaces on sticky plates follow the scroll (a pinned plate stays put on screen, so he does). No layout reads. */
    const ridePins = (sy: number) => {
      for (const c of cache) if (c.pin) c.top = c.top0 + (pinTop(c.pin, sy) - c.pin.t0);
    };
    let docEnd = Infinity; // the furthest the page scrolls (document px), as of the last measure
    const measure = () => {
      const { sx, sy } = viewport();
      docEnd = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const s = st.current;
      const prev = s && s.idx >= 0 ? cache[s.idx] : undefined;
      const pins = new Map<HTMLElement, Pin>();
      const pinOf = (el: HTMLElement): Pin | null => {
        const pe = el.closest<HTMLElement>('.plate-pin');
        if (!pe) return null;
        let pin = pins.get(pe);
        if (pin === undefined) {
          const cs = getComputedStyle(pe);
          const track = pe.parentElement;
          if (cs.position !== 'sticky' || !track) return null;
          const r = pe.getBoundingClientRect();
          const tr = track.getBoundingClientRect();
          const tcs = getComputedStyle(track);
          const lo = tr.top + sy + parseFloat(tcs.paddingTop || '0');
          const hi = tr.bottom + sy - parseFloat(tcs.paddingBottom || '0') - r.height;
          pin = { stick: parseFloat(cs.top) || 0, lo, hi: Math.max(lo, hi), t0: r.top + sy };
          pins.set(pe, pin);
        }
        return pin;
      };
      const base: Perch[] = Array.from(document.querySelectorAll<HTMLElement>('[data-perch]')).map((el, i) => {
        const r = el.getBoundingClientRect();
        const f = parseFloat(el.dataset.perch ?? '0.5');
        const half = parseFloat(el.dataset.perchSpan ?? '');
        const ext = perchExtent(r.width, MARGIN, half > 0 ? { center: r.width * f, half } : undefined);
        return { el, id: el.id || `p${i}`, left: r.left + sx, top: r.top + sy, width: r.width, height: r.height, f, ext, ledge: el.dataset.ledge !== undefined, k: 1, nook: false, spot: false, host: -1, wall: 0, lie: false, title: false, pin: pinOf(el), top0: r.top + sy, dark: darkAt(el, false) };
      });
      // the free space inside each assembled plate (v2.9: ink plates too; a fog patch behind him there keeps his silhouette readable)
      const nooks: Perch[] = [];
      base.forEach((c, i) => {
        if (c.el.dataset.assembled !== '1' || c.el.dataset.printing === '1' || !c.el.querySelector('.plate-face')) return;
        const dark = darkAt(c.el, true);
        const face = c.el.querySelector<HTMLElement>('.plate-face') ?? c.el;
        const fr = face.getBoundingClientRect();
        const plate = { left: fr.left + sx, right: fr.right + sx, top: fr.top + sy, bottom: fr.bottom + sy };
        // v2.9: found in plate-relative px, so a plate gives the same nooks (and ids) wherever it is
        // (pinned or not: native sticky only offsets it), and he doesn't snap when it un-pins
        const { text, titles } = plateText(face, -fr.left, -fr.top);
        const rel = { left: 0, right: fr.width, top: 0, bottom: fr.height };
        const found = freeSpaces(rel, text, { inset: 14, pad: INSIDE_PAD, w: 30 * szIn, h: (TALL + 3) * szIn, lieW: 76 * szIn, titles });
        found.forEach((m, j) => {
          const n = { ...m, left: m.left + plate.left, right: m.right + plate.left, y: m.y + plate.top };
          const width = n.right - n.left;
          nooks.push({ el: c.el, id: `${c.id}:n${Math.round(m.left)}:${Math.round(m.y)}`, left: n.left, top: n.y, width, height: 0, f: 0.5, ext: { lo: 0, hi: width }, ledge: false, k: kIn, nook: true, spot: false, host: i, wall: n.wall, lie: n.lie, title: n.title, pin: c.pin, top0: n.y, dark });
          void j;
        });
      });
      // spots were placed at some scroll: re-base the ones on a sticky plate to now
      for (const q of spots) {
        if (q.pin) q.top = q.top0 + (pinTop(q.pin, sy) - q.pin.t0);
        q.pin = pinOf(q.el);
        q.top0 = q.top; // a fresh pin's t0 is where it is now
      }
      cache = [...base, ...nooks, ...spots];
      if (!s) return;
      // keep him on the same surface (by id), or the nearest nook in the same plate
      let i = cache.findIndex((c) => c.id === s.pid);
      if (i < 0 && prev?.nook) {
        const me = { x: prev.left + s.walk.x, y: prev.top };
        let best = Infinity;
        cache.forEach((c, j) => {
          if (!c.nook || c.el !== prev.el) return;
          const d = Math.hypot(c.left + clamp(me.x - c.left, 0, c.width) - me.x, c.top - me.y);
          if (d < best && d < 60) {
            best = d;
            i = j;
          }
        });
      }
      if (s.idx >= 0 || s.tele) s.idx = i;
      // the surface he stands on resized (window resize, late layout): keep his place on it proportionally
      const now = s.idx >= 0 ? cache[s.idx] : undefined;
      if (now) {
        s.pid = now.id;
        const x = s.anchored ? now.width * now.f : prev && prev.el === now.el && prev.width > 0 && !prev.nook ? (s.walk.x * now.width) / prev.width : prev ? prev.left + s.walk.x - now.left : s.walk.x;
        s.walk = { ...s.walk, x: clampTo(x, now.ext) };
      }
    };
    /** A one-off standing place (document px, feet), at size factor k. Returns its perch id. */
    const addSpot = (x: number, y: number, k: number, el: HTMLElement): string => {
      const id = `spot:${Math.round(x)}:${Math.round(y)}`;
      const pin = cache.find((c) => c.el === el && c.pin)?.pin ?? null;
      const top0 = pin ? y - (pinTop(pin, viewport().sy) - pin.t0) : y;
      spots = [...spots.filter((q) => q.id !== id && (st.current?.pid === q.id || st.current?.tele?.to?.id === q.id)), { el, id, left: x, top: y, width: 0, height: 0, f: 0, ext: { lo: 0, hi: 0 }, ledge: false, k, nook: true, spot: true, host: -1, wall: 0, lie: false, title: false, pin, top0, dark: darkAt(el, true) }];
      measure();
      return id;
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
    let freshAt = 0; // ms a plate last came together (somewhere new to be: if he's away, he comes sooner)
    let nearAt = 0; // the user last came close to him (his own whims stop)
    // walking routes are between real surfaces only: nooks and spots are reached by teleport
    const surfaces = (ok: boolean[]): Surface[] =>
      cache.map((c, i) =>
        ok[i] && !c.nook ? { left: c.left + c.ext.lo, right: c.left + c.ext.hi, y: c.top, bottom: c.top + c.height, x0: c.left, x1: c.left + c.width } : { left: Infinity, right: -Infinity, y: Infinity },
      );

    // ---- stunt hook: the title stunt (stuntDriver.ts), when he feels like showing off ----
    const stunt = createStunt({ scale, feet: FEET, tall: TALL, collar: COLLAR, cycle: cfg.cycle, headroom: HEADER + CLEAR }, () => loop.wake());
    const heroGround = () => cache.findIndex((c) => !c.ledge && !!c.el.closest('#top'));
    const stuntView = (s: State, gi: number): StuntView => {
      const { sx, sy, w, h } = viewport();
      const g = gi >= 0 ? cache[gi] : null;
      const p = ptr.current;
      return { sx, sy, vw: w, vh: h, char: s.char, facing: s.shown, pointer: p && !(sense.gone && !sense.touch) ? { x: p.x, y: p.y } : null, ground: g ? { top: g.top, left: g.left, lo: g.ext.lo, hi: g.ext.hi } : null };
    };

    // timers wake the sleeping loop (idle relocation, end of the follow hold) instead of keeping it awake
    const timers = new Set<number>();
    const wakeIn = (s: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        loop.wake();
      }, Math.max(0, s * 1000) + 20);
      timers.add(id);
    };
    const armIdle = (now: number, what: Parameters<typeof nextIn>[0] | 'attention' = 'settled') => {
      const s = st.current;
      if (!s || reduce) return;
      // the pointer resting by him: he's minding it, so he decides at a slower pace
      // (shaken, though, he keeps cowering and glancing round: the quicker pace, so it reads)
      const minding = !!company(s, ptr.current) && feel(now) !== 'shaken';
      let wait = nextIn(what === 'attention' ? 'fidget' : what, Math.random);
      if (minding || what === 'attention') wait *= 1.5;
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
    let scrollDir: 1 | -1 = 1; // which way the visitor last scrolled
    let scrollY0 = window.scrollY;
    /** The visitor is scrolling (or just was): reappear where the scroll won't carry him straight out of view. */
    const scrollTrail: { t: number; y: number }[] = []; // recent scroll positions (for its speed)
    /** How fast the page is scrolling now (px/s, 0 once it has stopped for a moment). */
    const scrollSpeed = () => {
      const now = performance.now();
      if (now - lastScroll > 350 || scrollTrail.length < 2) return 0;
      const a = scrollTrail[0];
      const b = scrollTrail[scrollTrail.length - 1];
      return b.t - a.t > 30 ? Math.abs(b.y - a.y) / ((b.t - a.t) / 1000) : 0;
    };
    /** The visitor is scrolling (or just was): reappear where the scroll won't carry him straight out of view. */
    const drift = () => (performance.now() - lastScroll < 6000 ? { dir: scrollDir, px: vh() * 0.55 } : undefined);
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

    let sz = scale; // px per character unit as he's drawn now (smaller inside a plate)
    let clawUses = 0; // dev: times the claw came down (only ever for a press)
    const go = (s: State, ev: Ev, now: number) => {
      const next = transition(s.m, ev, now);
      if (next === s.m) return false;
      if (import.meta.env.DEV && next.mode !== s.m.mode) console.debug(`[puppet] ${s.m.mode} → ${next.mode}`, ev.type === 'take' ? ev.plan : ev.type);
      const was = s.m; // ---- probe hook ---- (the driver hears every transition)
      const prev = s.m.mode;
      s.m = next;
      // entry actions
      if (next.mode !== 'fidget') s.pending = null; // the glance before setting off was interrupted
      if (next.mode !== 'idle' && next.mode !== 'walking') {
        s.stepGoal = null;
        s.afterStep = null;
      }
      if (prev === 'fidget' && s.letters) endLetters(s); // letter play cut short: they spring home
      if (prev === 'sitting') s.lying = false;
      if (next.mode === 'swatting' && now - s.flinchAt > FLINCH_GAP * 1000 && !reduce) {
        // the swatting episode opens with a flinch: he recoils first, then bats at it
        s.flinchSwat = true;
        s.flinchAt = now;
        note('flinch:swat', now);
      }
      if (next.mode === 'grabbed') {
        // the visitor pressed on him: the claw drops in (it's the only time it ever does)
        clawUses++;
        note('claw:press', now);
        trustNow(now, (t) => scare(t, now));
        s.route = null;
        s.fall = null;
        s.goal = null;
        s.tele = null;
        s.lying = false;
        s.act = prev === 'sitting' ? { kind: 'sit', at: now, dur: ACT_DUR.sit * 0.6, reverse: true } : null; // up off the edge as the claw takes him
        s.seat = 0;
      }
      if (next.mode === 'carried') {
        s.rd = createRagdoll(s.swing);
        primeRagdoll(s.rd, collarOf(s), { x: 0, y: 0 });
        s.hv = { x: 0, y: 0 };
        s.idx = -1;
        s.pid = '';
      }
      if (next.mode === 'falling') {
        s.clawUpAt = now;
        startFall(s);
      }
      if (prev === 'sitting' && next.mode !== 'grabbed' && next.mode !== 'teleport') {
        // stands up (and shuffles back from the edge) before anything else
        s.act = { kind: 'sit', at: now, dur: ACT_DUR.sit * 0.75, reverse: true, block: true };
        s.seatFrom = s.seat;
        s.seatTo = 0;
        s.kickFrom = 0;
      }
      if (next.mode === 'teleport') {
        s.route = null;
        s.stepGoal = null;
        s.walk = { ...s.walk, v: 0, walking: false };
        if (prev !== 'fidget' || !s.tele?.poi) s.act = null;
        s.seat = 0;
        s.kickFrom = 0;
      }
      if (next.mode === 'idle' && (prev === 'falling' || prev === 'hopping' || prev === 'walking' || prev === 'teleport')) {
        if (s.holdUntil > now) wakeIn((s.holdUntil - now) / 1000);
        armIdle(now, prev === 'walking' ? 'settled' : 'arrived');
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
        if (prev === 'exploring' && !s.goal) armIdle(now, 'settled');
      }
      if (next.mode === 'swatting' && own(prev)) {
        s.goal = null;
        s.look = null;
        if (prev === 'fidget') s.act = null;
      }
      probe.entered(s, was, ev, now); // ---- probe hook ----
      return true;
    };

    const collarOf = (s: State): Pt => ({ x: s.char.x + COLLAR.x * s.shown * sz, y: s.char.y + COLLAR.y * sz });

    // let go: pick the printed perch under him (or the nearest one) and throw him at it in document space
    const startFall = (s: State) => {
      const { sx, sy } = viewport();
      const feet = s.char.y + FEET * sz;
      const vis = cache
        .map((c, i) => ({ c, i, top: c.top - sy, l: c.left - sx + c.ext.lo, r: c.left - sx + c.ext.hi }))
        .filter((q) => !q.c.nook && edgeOk(q.c.el) && q.top >= headroomK(1) && q.top < vh());
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
        y1 = sy + vh() + 200; // nothing to land on: out the bottom; he gathers himself back on screen
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
      s.pid = pick ? pick.c.id : '';
      if (s.rd) primeRagdoll(s.rd, collarOf(s), s.hv);
    };

    // ---- getting about by ink (teleport.ts) ----
    /**
     * s he'd have in view on `c` once gathered there `lead` s from now, if the page keeps scrolling at
     * `v` px/s (a pinned plate stays put until its track runs out; the page stops at its ends).
     */
    const stayOn = (c: Perch, v: number, lead: number) => {
      const { sy } = viewport();
      const tall = TALL * scale * c.k;
      let t = lead;
      for (; t < lead + STAY_FULL; t += 0.1) {
        const sy2 = clamp(sy + scrollDir * v * t, 0, docEnd);
        const feet = (c.pin ? c.top0 + pinTop(c.pin, sy2) - c.pin.t0 : c.top) - sy2;
        if (feet - tall < HEADER + CLEAR || feet > vh() - 8) break;
      }
      return t - lead;
    };
    /** Everywhere on screen he could gather himself (document px, feet); `lead`: s until he'd be there. */
    const destSpots = (ps: Seen[], only?: (c: Perch) => boolean, lead = 0.3 + IN): Spot[] => {
      const out: Spot[] = [];
      const v = scrollSpeed();
      cache.forEach((c, i) => {
        if (c.spot || !ps[i]?.ok || !ps[i].visible || !ps[i].onX) return;
        if (only && !only(c)) return;
        const lo = c.left + c.ext.lo;
        const hi = c.left + c.ext.hi;
        const { sx } = viewport();
        const a = Math.max(lo, sx + 40);
        const b = Math.min(hi, sx + vp.w - 40);
        if (a > b) return;
        // a couple of places along it
        const xs = b - a > 160 ? [a + (b - a) * 0.25, a + (b - a) * 0.75] : [(a + b) / 2];
        const stay = v > 20 ? stayOn(c, v, lead) : undefined;
        xs.forEach((x, n) => out.push({ id: `${c.id}#${n}`, i, x, y: c.top, inside: c.nook, stay }));
      });
      return out;
    };
    const focusDoc = (): Pt | null => {
      const v = visitor();
      const { sx, sy } = viewport();
      return v ? { x: v.x + sx, y: v.y + sy } : null;
    };
    let recentDest: string[] = [];
    /**
     * Run off into ink and gather himself at `to` (perch index + document x), or wherever is best near
     * your attention when `to` is null. `then` runs once he's re-formed (and shaken himself off).
     */
    const teleport = (s: State, now: number, o: { to?: { i: number; x: number } | null; ps?: Seen[]; prefer?: 'inside' | 'outside'; only?: (c: Perch) => boolean; poi?: Poi | null; then?: ((now: number) => void) | null; greet?: boolean; nowhere?: boolean; why: string }): boolean => {
      let to = o.to ?? null;
      const seen = !s.hidden && s.char.y > HEADER && s.char.y < vh() + 40 && s.char.x > -40 && s.char.x < vp.w + 40 && s.m.mode !== 'falling';
      const quick = scrollSpeed() > QUICK_SCROLL; // the page is on the move: he gathers sooner (or the scroll takes the spot first)
      if (!to && o.ps) {
        const { sx, sy } = viewport();
        const me = s.idx >= 0 && !s.hidden ? { x: s.char.x + sx, y: s.char.y + sy + FEET * sz } : null;
        const lead = (seen && o.why !== 'header' ? OUT : 0) + (quick ? QUICK_GAP + IN * QUICK_IN : 0.3 + IN);
        const d = chooseDest(destSpots(o.ps, o.only, lead), { focus: focusDoc(), view: { left: sx, right: sx + vp.w, top: sy + HEADER + CLEAR, bottom: sy + vh() - 8 }, me, recent: recentDest, prefer: o.prefer, rand: Math.random, drift: drift() });
        if (d) {
          to = { i: d.i, x: d.x };
          recentDest = [d.id, ...recentDest].slice(0, 4);
        }
      }
      const { sx, sy } = viewport();
      const c = to ? cache[to.i] : undefined;
      // nowhere on screen to go: if he's in sight he still runs off into ink (and waits out of sight)
      if (!to || !c) {
        if (!o.nowhere || !seen || reduce) return false;
      }
      const fromDoc = { x: s.char.x + sx, y: s.char.y + sy };
      const here = s.idx >= 0 ? cache[s.idx] : undefined;
      const fromPin = here?.pin && !s.hidden ? { pin: here.pin, top: pinTop(here.pin, sy) } : null;
      const toPt = to && c ? { x: to.x, y: c.top } : fromDoc;
      if (!go(s, { type: 'vanish' }, now)) return false;
      const hop = startHop(now, Math.hypot(toPt.x - fromDoc.x, toPt.y - fromDoc.y), reduce);
      if (!seen && !reduce) hop.out = 0; // nobody sees him go: he just turns up
      if (quick && !hop.instant) {
        hop.gap = Math.min(hop.gap, QUICK_GAP);
        hop.in *= QUICK_IN;
      }
      s.tele = { hop, fromDoc, fromPin, kFrom: s.k, to: to && c ? { id: c.id, x: clampTo(to.x - c.left, c.ext) } : null, poi: o.poi ?? null, then: o.then ?? null, greet: !!o.greet, swapped: false, shook: false, why: o.why };
      if (o.poi) s.goal = o.poi;
      note(`teleport:${o.why}:${c?.id ?? 'nowhere'}`, now);
      return true;
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
      const len = Math.min(13 * sz, room);
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
      const away = s.walk.x + (p.x > s.char.x ? -1 : 1) * 16 * sz;
      chain(s, now, [{ kind: 'duck', block: true }], () => void startStep(s, away));
    };
    const startFidget = (s: State, f: Fidget, now: number) => {
      s.fidgets = noteRecent(s.fidgets, f, 3);
      probe.noteWhim(f); // ---- probe hook ---- (variety across everything he does)
      if (f === 'step') {
        // a pace toward whatever he's facing (the pointer, usually), then a curious look
        const v = visitor();
        const at = v && Math.abs(v.x - s.char.x) > 12 ? stepToward(s, v.x, keepGap(tr.current!, now) - 20) : s.walk.x + s.facing * 11 * sz;
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
      }
      play(s, f, now);
      if (near && f !== 'look') s.look = { x: near.p.x + viewport().sx, y: near.p.y + viewport().sy };
    };
    /** Fully trusted, the pointer resting beside him: he sits down by it. */
    const sitBeside = (s: State, p: Pointer, now: number) => {
      if (!go(s, { type: 'sit' }, now)) return;
      probe.noteWhim('sit'); // ---- probe hook ----
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
      const view = { left: sx, right: sx + vp.w, top: sy, bottom: sy + vh() };
      // he only wanders onto surfaces with room for all of him below the header (`visible`)
      const surfaces = cache.map((c, i): SceneSurface | null =>
        ps[i].ok && ps[i].visible && !c.nook
          ? { left: c.left + c.ext.lo, right: c.left + c.ext.hi, y: c.top, bottom: c.top + c.height, x0: c.left, x1: c.left + c.width, ledge: c.ledge, plate: c.el.dataset.printed !== undefined }
          : null,
      );
      const splats = Array.from(document.querySelectorAll<SVGElement>('[data-poi="splat"]'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.bottom > 0 && r.top < vh() && r.right > 0 && r.left < vp.w)
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
          if (r.width > 0 && r.top < vh()) headings.push({ s: i, left: r.left + sx, right: r.right + sx, top: r.top + sy });
        });
        // circuit-tree link nodes on this plate (the hex, not the label), on screen
        c.el.querySelectorAll<HTMLElement>('[data-poi="node"]').forEach((el) => {
          const r = (el.querySelector('svg') ?? el).getBoundingClientRect();
          if (r.width === 0 || r.top > vh() - 20 || r.bottom < 0) return;
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
      setOff(s, poi, route, now);
      return true;
    };
    /** Set off along `route` to `poi`. A thinking tell: most times he stops and looks where he's going first, a beat. */
    const setOff = (s: State, poi: Poi, route: Move[], now: number) => {
      if (!reduce && Math.random() < 0.75 && go(s, { type: 'fidget' }, now)) {
        const to = poi.look ?? { x: route[route.length - 1].to.x, y: route[route.length - 1].to.y - 30 * scale };
        const sx = viewport().sx;
        faceTo(s, route[0].to.x - sx);
        s.look = to;
        s.goal = poi;
        s.pending = { poi, route, sy: viewport().sy };
        play(s, 'glance', now, { dur: rand(0.45, 0.95) });
        note(`glance:${poi.id}`, now);
        return;
      }
      beginRoute(s, poi, route, now);
    };
    const beginRoute = (s: State, poi: Poi, route: Move[], now: number) => {
      s.goal = poi;
      goalNode = poi.kind === 'node' && poi.target !== undefined ? nodeEls[poi.target] : undefined;
      s.route = route;
      s.leg = 0;
      s.legAt = now;
      s.routeAt = { sy: viewport().sy, from: s.idx };
      s.ignoreBefore = now;
      go(s, { type: 'explore' }, now);
      s.idx = poi.s;
      s.pid = cache[poi.s]?.id ?? s.pid;
    };
    /** At the point of interest: face it and do the thing. */
    const arrive = (s: State, now: number) => {
      const poi = s.goal;
      if (!poi || s.idx < 0) return;
      // ---- probe hook ---- a probe's spot: the driver takes it from here; anything else is a find
      if (poi.kind === 'probe') return probe.arrive(s, now);
      if (poi.id === 'visit') {
        // came over to you: say hello (if he trusts you) rather than look round
        s.goal = null;
        s.greetAt = now + rand(150, 400);
        wakeIn(0.45);
        return;
      }
      probe.noteWhim(poi.activity);
      if (poi.activity !== 'sit') probe.noteFind();
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
    // ---- probe hook ---- prod and probe (probeDriver.ts): the driver, and what it may use of the stage
    const probe = createProbeDriver({
      scale,
      vw: vp.w,
      vh: vh(),
      minTop: HEADER + CLEAR,
      feet: FEET * scale,
      perches: () => cache,
      view: () => viewport(),
      go: (ev, now) => go(st.current!, ev, now),
      wakeIn,
      routeTo: (ps: readonly SeenLike[], i: number, x: number) => {
        const s = st.current!;
        const sx = viewport().sx;
        const ok = cache.map((_, j) => (!!ps[j]?.ok && !!ps[j]?.visible) || j === s.idx);
        if (!ok[i] || s.idx < 0 || cache[s.idx].nook || cache[i].nook) return null;
        const S = surfaces(ok);
        const r = planRoute(S, { s: s.idx, x: cache[s.idx].left + s.walk.x }, { s: i, x: clamp(x, S[i].left, S[i].right) }, limX);
        return r && r.every((m) => m.to.x >= sx + 40 && m.to.x <= sx + vp.w - 40) ? r : null;
      },
      setOff: (poi, route, now) => setOff(st.current!, poi, route, now),
      arrive: (now) => arrive(st.current!, now),
      feel,
      full: (now) => advance(tr.current!, now).full,
      visitor,
      cursor: (): Cursor => (sense.touch ? 'touch' : !ptr.current || sense.gone ? 'gone' : st.current && company(st.current, ptr.current) ? 'near' : 'watching'),
      attnAt: () => nearAt,
      note,
      insideScale: szIn,
      teleportTo: (dest, poi, now) => {
        const s = st.current!;
        if ('spot' in dest) {
          const host = cache.find((c) => !c.nook && c.left <= dest.spot.x && c.left + c.width >= dest.spot.x && c.top <= dest.spot.y && c.top + c.height >= dest.spot.y);
          const id = addSpot(dest.spot.x, dest.spot.y, kIn, host?.el ?? document.body);
          const i = cache.findIndex((c) => c.id === id);
          return i >= 0 && teleport(s, now, { to: { i, x: dest.spot.x }, poi: { ...poi, s: i }, why: 'probe' });
        }
        return teleport(s, now, { to: dest, poi, why: 'probe' });
      },
      pinTop: (el) => {
        const c = cache.find((q) => q.pin && !q.nook && q.el.contains(el));
        return c?.pin ? pinTop(c.pin, viewport().sy) : null;
      },
    });
    // ---- end probe hook ----

    // ---- inside a plate ----
    let insideRecent: string[] = [];
    /** Lie down for a nap (the sitting mode, on his back). */
    const nap = (s: State, now: number) => {
      if (!go(s, { type: 'sit' }, now)) return false;
      s.lying = true;
      s.goal = null;
      play(s, 'lie', now);
      s.seatFrom = s.seatTo = s.seat = 0;
      s.sitUntil = now + rand(NAP[0], NAP[1]) * 1000;
      s.kickAt = Infinity;
      s.kickFrom = 0;
      wakeIn((s.sitUntil - now) / 1000);
      note('nap', now);
      return true;
    };
    /** Inside a plate: he has a look at the words beside him, reads them, peeks round them, walks his nook, lies down. */
    const insideAct = (s: State, now: number) => {
      if (s.idx < 0 || !cache[s.idx]?.nook || !freeNow(s) || s.act) return;
      const c = cache[s.idx];
      const w: Record<string, number> = { read: c.wall ? 1.3 : 0, peek: c.wall ? 0.9 : 0, look: 0.8, crouch: 0.5, lie: c.lie ? 1.1 : 0, scratch: 0.4, walk: c.width > 30 * sz ? 1 : 0 };
      const k = pickVaried(w, insideRecent, Math.random) ?? 'look';
      insideRecent = noteRecent(insideRecent, k, 3);
      note(`inside:${k}`, now);
      if (k === 'lie') return void nap(s, now);
      if (k === 'walk') {
        const to = s.walk.x < c.width / 2 ? c.width - rand(0, c.width * 0.2) : rand(0, c.width * 0.2);
        startStep(s, to, (t) => freeNow(s) && !s.act && chain(s, t, [{ kind: c.wall ? 'read' : 'look' }]));
        return;
      }
      if (!go(s, { type: 'fidget' }, now)) return;
      const { sx, sy } = viewport();
      if (c.wall) s.facing = c.wall;
      s.look = c.wall ? { x: s.char.x + sx + c.wall * 60 * sz, y: s.char.y + sy - 6 * sz } : null;
      play(s, k as Action, now);
    };

    // ---- letter play (letterPlay.ts) ----
    /** `ceil`: the highest a moved letter may go (document px; under the header), if it matters there. */
    type LetterSite = { at: { i: number; x: number } | null; spot: Pt | null; facing: 1 | -1; word: LBox[]; els: Map<string, HTMLElement>; k: number; ceil?: number };
    /** A title's letters as words (by the gaps between them), from their elements. */
    const wordsOf = (els: HTMLElement[], key: (el: HTMLElement) => string, sx: number, sy: number): { word: LBox[]; els: Map<string, HTMLElement> }[] => {
      const out: { word: LBox[]; els: Map<string, HTMLElement> }[] = [];
      let cur: { word: LBox[]; els: Map<string, HTMLElement> } | null = null;
      let last: LBox | null = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0) continue;
        const g: LBox = { key: key(el), ch: el.textContent ?? '', left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy };
        const h = g.bottom - g.top;
        const split = !last || Math.abs(g.top - last.top) > h * 0.5 || g.left - last.right > h * 0.18 || g.left < last.left;
        if (split || !cur) out.push((cur = { word: [], els: new Map() }));
        cur.word.push(g);
        cur.els.set(g.key, el);
        last = g;
      }
      return out.filter((w) => w.word.length > 0);
    };
    /** Where on screen he could play with a title word: beside a plate title (inside), or on the hero tagline. */
    const letterSites = (ps: Seen[]): LetterSite[] => {
      const out: LetterSite[] = [];
      const { sx, sy } = viewport();
      cache.forEach((c, i) => {
        if (!c.nook || c.spot || !c.title || !ps[i]?.ok || !ps[i].visible || !ps[i].onX) return;
        const host = cache[c.host];
        const els = host ? Array.from(host.el.querySelectorAll<HTMLElement>('[data-plate-glyph]')) : [];
        if (!els.length) return;
        for (const w of wordsOf(els, (el) => el.dataset.plateGlyph ?? '', sx, sy)) {
          const top = Math.min(...w.word.map((g) => g.top));
          const bottom = Math.max(...w.word.map((g) => g.bottom));
          if (bottom < c.top - TALL * szIn || top > c.top) continue; // not on his line
          for (const [x, facing] of [[c.left, -1], [c.left + c.width, 1]] as const) {
            const me = { x, feet: c.top, facing, scale: szIn };
            if (canTrick('spin', w.word, me)) out.push({ at: { i, x }, spot: null, facing, word: w.word, els: w.els, k: kIn });
          }
        }
      });
      // the hero tagline: from a shelf on a line's letters, beside the end of the shorter line above it
      const h1 = titleEl();
      const g = heroGround();
      if (h1 && h1.getAttribute('data-written') === '1' && g >= 0 && ps[g]?.visible) {
        const map = titleMap({ w: 22 * scale, h: TALL * scale }, [{ left: -1e5, right: 1e5, top: -1e5, bottom: sy + HEADER + CLEAR }]);
        if (map) {
          for (const stand of map.stands) {
            const above = map.rows[stand.row - 1];
            if (!above) continue;
            const els = above.glyphs.map((q) => h1.querySelector<HTMLElement>(`[data-glyph="${q.key}"]`)).filter((e): e is HTMLElement => !!e);
            const words = wordsOf(els, (el) => el.dataset.glyph ?? '', sx, sy);
            const w = words[words.length - 1];
            if (!w) continue;
            const me = { x: stand.x, feet: stand.y, facing: -1 as const, scale };
            if (stand.y - TALL * scale < sy + HEADER + CLEAR || stand.x > sx + vp.w - 30) continue;
            if (canTrick('spin', w.word, me)) out.push({ at: null, spot: { x: stand.x, y: stand.y }, facing: -1, word: w.word, els: w.els, k: 1 });
          }
          // on a line's letters (a short one), beside a taller letter of the same word: the part of the
          // word on that side of him is in reach (the letters under his feet stay put)
          const half = 11 * scale;
          const seen = new Set<string>();
          // his whole silhouette while he reaches (an arm out toward the word, hair) stays off the eyebrow and lede
          const others = measureTitle(h1)?.obstacles ?? [];
          const covers = (x: number, y: number, facing: 1 | -1) => {
            const box = { left: x - (facing < 0 ? 26 : 16) * scale - 6, right: x + (facing < 0 ? 16 : 26) * scale + 6, top: y - (TALL + 4) * scale - 6, bottom: y - 2 };
            return others.some((o) => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top);
          };
          for (const stand of map.stands) {
            if (stand.y - TALL * scale < sy + HEADER + CLEAR || stand.x < sx + 30 || stand.x > sx + vp.w - 30) continue;
            const row = map.rows[stand.row];
            const words: LBox[][] = [];
            let prev: LBox | null = null;
            for (const q of row.glyphs) {
              const box: LBox = { key: q.key, ch: q.ch, left: q.left, right: q.right, top: q.top, bottom: q.bottom };
              if (!prev || box.left - prev.right > (row.baseline - Math.min(...row.glyphs.map((r) => r.top))) * 0.15) words.push([]);
              words[words.length - 1].push(box);
              prev = box;
            }
            const word = words.find((w) => w.some((q) => q.key === stand.key));
            if (!word) continue;
            for (const facing of [-1, 1] as const) {
              const part = facing < 0 ? word.filter((q) => q.right <= stand.x - half + 1) : word.filter((q) => q.left >= stand.x + half - 1);
              const end = part.length ? (facing < 0 ? part[part.length - 1] : part[0]) : null;
              if (!end || end.top > stand.y - 6 * scale) continue; // it has to stand up beside him, not lie under his feet
              const id = `${end.key}:${facing}`;
              if (seen.has(id)) continue; // one spot per letter and side (the stand nearest it comes first or last; either is fine)
              const me = { x: stand.x, feet: stand.y, facing, scale };
              if (!canTrick('spin', part, me) || covers(stand.x, stand.y, facing)) continue;
              seen.add(id);
              const els = new Map<string, HTMLElement>();
              for (const q of part) {
                const el = h1.querySelector<HTMLElement>(`[data-glyph="${q.key}"]`);
                if (el) els.set(q.key, el);
              }
              out.push({ at: null, spot: { x: stand.x, y: stand.y }, facing, word: part, els, k: 1, ceil: sy + HEADER + CLEAR });
            }
          }
        }
      }
      return out;
    };
    let trickRecent: Trick[] = [];
    const endLetters = (s: State) => {
      if (!s.letters) return;
      s.letters = null;
      s.dx = 0;
      resetGlyphs(); // anything still out of place springs home
    };
    /** Go to a title word and play with it. */
    const startLetters = (s: State, ps: Seen[], now: number): boolean => {
      const sites = letterSites(ps);
      if (!sites.length) return false;
      const site = sites[Math.floor(Math.random() * sites.length)];
      const me0 = { x: site.at ? site.at.x : site.spot!.x, feet: site.at ? cache[site.at.i].top : site.spot!.y, facing: site.facing, scale: scale * site.k };
      // a letter held over his head or stacked must stay clear of the header
      const clear = (t: Trick) => {
        if (site.ceil === undefined || (t !== 'carry' && t !== 'stack')) return true;
        const e = endLettersOf(site.word, site.facing);
        if (!e) return false;
        const h = e[0].bottom - e[0].top;
        const top = t === 'carry' ? me0.feet - 62 * me0.scale - h - 6 : (e[1]?.top ?? e[0].top) - h - 6;
        return top >= site.ceil;
      };
      const pool = TRICKS.filter((t) => (!forcedTrick || t === forcedTrick) && canTrick(t, site.word, me0) && clear(t));
      const w: Partial<Record<Trick, number>> = {};
      for (const t of pool) w[t] = 1;
      const trick = pickVaried(w, trickRecent, Math.random) ?? pool[0];
      if (!trick) return false;
      trickRecent = noteRecent(trickRecent, trick, 3);
      const begin = (t: number) => {
        if (!freeNow(s) || s.act || s.idx < 0) return;
        const c = cache[s.idx];
        const me = { x: c.left + s.walk.x, feet: c.top, facing: site.facing, scale: scale * c.k };
        const prog = planTrick(trick, site.word, me, Math.random);
        if (!prog || !go(s, { type: 'fidget' }, t)) return;
        s.facing = site.facing;
        s.letters = { prog, word: site.word, els: site.els, me, t0: t, x0: s.walk.x };
        s.act = { kind: 'still', at: t, dur: prog.dur, block: true };
        wakeIn(prog.dur);
        note(`letters:${trick}`, t);
      };
      if (site.at) return teleport(s, now, { to: site.at, then: begin, why: 'letters' });
      const id = addSpot(site.spot!.x, site.spot!.y, 1, titleEl() ?? document.body);
      const i = cache.findIndex((c) => c.id === id);
      return i >= 0 && teleport(s, now, { to: { i, x: site.spot!.x }, then: begin, why: 'letters' });
    };
    /** Each frame of letter play: his pose and step, and the letters. */
    const tickLetters = (s: State, now: number) => {
      const L = s.letters;
      if (!L) return;
      const t = (now - L.t0) / 1000;
      if (t >= L.prog.dur || s.m.mode !== 'fidget') return endLetters(s);
      const m = meAt(L.prog, t);
      const was = s.dx;
      s.dx = m.dx;
      if (m.walking) s.walk.phase = (((s.walk.phase + (Math.abs(s.dx - was) / (cfg.cycle * s.k))) % 1) + 1) % 1;
      if (s.act) s.act.look = m.look === 'visitor';
      const { sx, sy } = viewport();
      const end = L.word[L.me.facing < 0 ? L.word.length - 1 : 0];
      s.look = m.look === 'word' ? { x: (L.word[0].left + L.word[L.word.length - 1].right) / 2, y: (end.top + end.bottom) / 2 } : { x: (end.left + end.right) / 2, y: (end.top + end.bottom) / 2 };
      void sx;
      void sy;
      const poses = lettersAt(L.prog, L.word, L.me, t);
      for (const k of L.prog.keys) {
        const el = L.els.get(k);
        if (el) setGlyph(el, poses.get(k) ?? null);
      }
      if (m.act) {
        s.action = m.act;
        s.actionK = m.k;
      } else s.action = undefined;
      s.lwalk = m.walking;
    };

    // ---- getting about on his own ----
    const limRun = { ...lim, speed: lim.speed * RUN };
    /** The surface under him is going away (or he's nowhere): off it at once, never floating. */
    const leaveNow = (s: State, ps: Seen[], now: number) => {
      if (s.idx >= 0 && cache[s.idx] && !cache[s.idx].nook && ps[s.idx]?.visible && afoot(s.m.mode) && s.m.mode !== 'hopping' && runTo(s, ps, now, 1.6)) return note('hop-off', now);
      if (teleport(s, now, { ps, nowhere: s.idx >= 0, why: s.idx < 0 ? 'nowhere' : 'plate-gone' })) return;
      // nowhere on screen to be: he keeps out of sight until there is
      s.hidden = true;
      s.idx = -1;
      s.pid = '';
    };
    /** A quick run (walk / jump / climb / drop) onto a surface on screen near your attention. */
    const runTo = (s: State, ps: Seen[], now: number, max = RUN_MAX): boolean => {
      if (s.idx < 0 || cache[s.idx].nook) return false;
      const { sx, sy } = viewport();
      const f = focusDoc() ?? { x: sx + vp.w / 2, y: sy + vh() / 2 };
      const ok = cache.map((_, j) => (!!ps[j]?.ok && !!ps[j]?.visible && !!ps[j]?.onX) || j === s.idx);
      const S = surfaces(ok);
      const from = { s: s.idx, x: cache[s.idx].left + s.walk.x };
      const cand = cache
        .map((c, j) => ({ c, j, x: clamp(f.x, S[j].left, S[j].right) }))
        .filter((q) => q.j !== s.idx && ok[q.j] && !q.c.nook && Number.isFinite(S[q.j].left) && ps[q.j]?.visible)
        .sort((a, b) => Math.hypot(a.x - f.x, a.c.top - f.y) - Math.hypot(b.x - f.x, b.c.top - f.y))
        .slice(0, 3);
      for (const q of cand) {
        const x = clamp(q.x + (f.x > q.x ? -60 : 60), S[q.j].left, S[q.j].right);
        const route = planRoute(S, from, { s: q.j, x }, limRun);
        if (!route || !route.length || route.reduce((t, m) => t + m.duration, 0) > max) continue;
        s.route = route;
        s.leg = 0;
        s.legAt = now;
        s.routeAt = { sy: viewport().sy, from: s.idx };
        s.run = true;
        if (!go(s, { type: 'hop' }, now)) return false;
        s.idx = q.j;
        s.pid = q.c.id;
        return true;
      }
      return false;
    };
    /** He's been off screen long enough: he comes along (a run if it's close, ink if it isn't). */
    const comeAlong = (s: State, ps: Seen[], now: number) => {
      if (own(s.m.mode)) go(s, { type: 'attend' }, now);
      if (!free(s.m.mode)) return;
      if (runTo(s, ps, now)) return note('come:run', now);
      teleport(s, now, { ps, greet: true, why: 'come' });
    };
    /** Go to the visitor: on foot if it's an easy walk, else by ink; then say hello. */
    const visit = (s: State, ps: Seen[], now: number): boolean => {
      const f = focusDoc();
      if (!f || s.idx < 0) return false;
      if (!cache[s.idx].nook) {
        const ok = cache.map((_, j) => (!!ps[j]?.ok && !!ps[j]?.visible && !!ps[j]?.onX) || j === s.idx);
        const S = surfaces(ok);
        let best: { j: number; x: number; d: number } | null = null;
        cache.forEach((c, j) => {
          if (!ok[j] || c.nook || !Number.isFinite(S[j].left)) return;
          const x = clamp(f.x + (f.x > c.left + s.walk.x ? -1 : 1) * keepGap(tr.current!, now), S[j].left, S[j].right);
          const d = Math.hypot(x - f.x, (c.top - f.y) * 0.7);
          if (!best || d < best.d) best = { j, x, d };
        });
        const b = best as { j: number; x: number; d: number } | null;
        if (b && b.d < 320) {
          const route = planRoute(S, { s: s.idx, x: cache[s.idx].left + s.walk.x }, { s: b.j, x: b.x }, limX);
          if (route && route.length && route.reduce((t, m) => t + m.duration, 0) < 7) {
            const poi: Poi = { id: 'visit', kind: 'perch', s: b.j, x: b.x, face: 0, look: f, activity: 'look', weight: 0 };
            setOff(s, poi, route, now);
            return true;
          }
        }
      }
      return teleport(s, now, { ps, greet: true, why: 'visit' });
    };
    /** He watches something for a while: you, or an arm assembling a plate. */
    const watch = (s: State, now: number) => {
      if (!go(s, { type: 'fidget' }, now)) return false;
      const v = visitor();
      const { sx, sy } = viewport();
      const arm = cache.find((c) => c.el.dataset.printing === '1' && c.el.dataset.arm);
      const at = v ? { x: v.x + sx, y: v.y + sy } : arm ? { x: arm.left + Number(arm.el.dataset.arm!.split(' ')[2]), y: arm.top + Number(arm.el.dataset.arm!.split(' ')[3]) } : null;
      if (at && Math.abs(at.x - (s.char.x + sx)) > 12) s.facing = at.x > s.char.x + sx ? 1 : -1;
      s.look = at;
      play(s, 'watch', now, { dur: rand(3, 5.5) });
      return true;
    };
    /** What the pointer is doing, as his needs see it. */
    const cursorNow = (s: State, now: number): BrainCursor => {
      const p = ptr.current;
      if (sense.touch) return 'touch';
      if (!p || sense.gone) return 'gone';
      if (company(s, p)) return 'near';
      return now - p.t > 1500 ? 'resting' : 'watching';
    };
    /** His needs choose what he does next (desires.ts); he goes and does it. */
    const decide = (s: State, ps: Seen[], now: number) => {
      const fl = feel(now);
      const cur = cursorNow(s, now);
      s.needs = grow(s.needs, Math.min(120, (now - s.needsAt) / 1000), { band: fl, cursor: cur, offscreen: false, busy: false });
      s.needsAt = now;
      const vis = (_c: Perch, i: number) => !!ps[i]?.ok && ps[i].visible && ps[i].onX;
      const here = cache[s.idx];
      const gi = heroGround();
      const can: Partial<Record<Activity, boolean>> = {
        explore: !here.nook,
        inside: cache.some((c, i) => c.nook && !c.spot && i !== s.idx && vis(c, i)),
        probe: fl !== 'shaken' && !probe.busy,
        letters: fl !== 'shaken' && (cache.some((c, i) => c.nook && c.title && vis(c, i)) || (gi >= 0 && !!ps[gi]?.visible)),
        stunt: s.idx === gi && gi >= 0 && RANK[fl] >= RANK.tolerant && now - s.stuntAt > 60000 && titleEl()?.getAttribute('data-written') === '1',
        visit: cur !== 'near' && cur !== 'gone',
        sit: true,
        nap: (!!here.nook && here.lie) || cache.some((c, i) => c.nook && c.lie && vis(c, i)),
        watch: true,
        vanish: now - s.whimAt > WHIM_GAP * 1000,
      };
      let a = forced ?? choose(s.needs, { band: fl, cursor: cur, quiet: (now - attnAt) / 1000, can }, s.did, Math.random);
      let ok = false;
      switch (a) {
        case 'explore':
          ok = startExplore(s, 'explore', ps, now, probe.fresh) || startExplore(s, 'explore', ps, now);
          break;
        case 'inside':
          ok = teleport(s, now, { ps, prefer: 'inside', only: (c) => c.nook && !c.spot, then: (t) => insideAct(s, t), why: 'inside' });
          break;
        case 'probe':
          ok = probe.decide(s, 'explore', ps, now, true);
          break;
        case 'letters':
          ok = startLetters(s, ps, now);
          break;
        case 'stunt':
          stunt.invite();
          s.stuntAsk = now;
          wakeIn(0.1);
          ok = true;
          break;
        case 'visit':
          ok = visit(s, ps, now);
          break;
        case 'sit':
          ok = here.nook ? (here.lie ? nap(s, now) : false) : startExplore(s, 'rest', ps, now);
          break;
        case 'nap':
          ok = here.nook && here.lie ? nap(s, now) : teleport(s, now, { ps, prefer: 'inside', only: (c) => c.nook && c.lie && !c.spot, then: (t) => void nap(s, t), why: 'nap' });
          break;
        case 'watch':
          ok = watch(s, now);
          break;
        case 'vanish':
          ok = teleport(s, now, { ps, greet: true, why: 'whim' });
          if (ok) s.whimAt = now;
          break;
        case 'fidget':
          break;
      }
      if (!ok && a !== 'fidget') {
        note(`want:${a}:no`, now);
        a = 'fidget';
      }
      if (a === 'fidget') {
        // a pause where he is: shuffle along a nook inside, otherwise a fidget
        if (here.nook && Math.random() < 0.4) insideAct(s, now);
        else startFidget(s, pickFidget(Math.random, probe.fidgetRecent(s.fidgets), fl), now);
      }
      s.did = noteRecent(s.did, a, 3);
      s.needs = satisfy(s.needs, a);
      s.doing = a;
      decisions.push({ t: Math.round(now), a, at: here.nook ? 'inside' : here.ledge ? 'ledge' : 'surface' });
      if (decisions.length > 400) decisions.shift();
      note(`want:${a}`, now);
    };
    const decisions: { t: number; a: Activity; at: string }[] = []; // dev: what he chose and when
    let forced: Activity | null = null; // dev: `__puppet.force`
    let forcedTrick: Trick | null = null;

    /** The scroll took him (or his surface) up under the fixed header: never stands there, not even for a beat. */
    const offHeader = (s: State, now: number, ps: Seen[], md: Machine['mode']) => {
      s.awaySince = 0;
      if (md === 'hopping' || md === 'exploring') {
        s.route = null;
        s.goal = null;
        go(s, { type: md === 'hopping' ? 'arrived' : 'attend' }, now);
      } else if (own(md)) go(s, { type: 'attend' }, now);
      if (teleport(s, now, { ps, why: 'header' })) {
        if (s.tele) s.tele.hop.out = 0; // half under the header: no slow ink-out there, he's just gone
      } else {
        s.hidden = true;
        s.idx = -1;
        s.pid = '';
      }
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
      ridePins(sy); // surfaces on pinned plates: where the scroll has them now
      const ps: Seen[] = cache.map((p) => {
        const top = p.top - sy;
        const lx = p.left - sx;
        return {
          ok: p.nook ? insideOk(p.el) : edgeOk(p.el), // inside: only a whole, still plate; its top edge: once the sheet is down (pinned or not)
          left: lx,
          pt: { x: lx + p.width * p.f, y: top - FEET * scale * p.k },
          top,
          visible: top >= headroomK(p.k) && top < vh() - 8,
          onX: lx + p.ext.hi >= 24 && lx + p.ext.lo <= vp.w - 24,
          bottom: top + p.height,
        };
      });
      lastSeen = ps;
      if (!ps.length) return false; // layout / print-state changes wake us when perches appear

      if (!st.current) {
        // he arrives on his own: gathers himself out of ink on the hero ground (or wherever's on screen)
        const gi = heroGround();
        const start = gi >= 0 && ps[gi].visible ? gi : ps.findIndex((q, i) => q.ok && q.visible && !cache[i].nook);
        const i0 = Math.max(0, start);
        const x0 = home(i0);
        st.current = {
          m: initial(now),
          char: { ...perchPosOf(ps, i0, x0) },
          idx: i0,
          pid: cache[i0].id,
          k: cache[i0].k,
          grip: 0,
          swing: 0,
          swingV: 0,
          baseX: ps[i0].pt.x,
          hoverX: ps[i0].pt.x,
          bend: -1,
          claw: 0,
          clawUpAt: -Infinity,
          tele: null,
          awaySince: 0,
          awayFor: 3,
          needs: { ...NEEDS0 },
          needsAt: now,
          did: [],
          doing: null,
          whimAt: now,
          stuntAt: -Infinity,
          stuntAsk: 0,
          letters: null,
          lying: false,
          dx: 0,
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
          holdUntil: 0,
          idleAt: Infinity,
          rd: null,
          rag: null,
          ragW: 0,
          hv: { x: 0, y: 0 },
          fall: null,
          route: null,
          routeAt: { sy: 0, from: -1 },
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
          hidden: true,
          run: false,
          lwalk: false,
          pending: null,
          reacts: [],
        };
        const s0 = st.current;
        s0.char = { x: s0.char.x, y: -400 }; // not on screen yet: he turns up
        if (!teleport(s0, now, { to: { i: i0, x: cache[i0].left + x0 }, why: 'enter' })) armIdle(now);
        s0.hidden = false;
      }
      const s = st.current;
      sz = scale * s.k;
      const mode = () => s.m.mode;
      const p = ptr.current;
      // ---- trust: what the pointer has been doing since the last frame / wake ----
      const mouse = !!p && !sense.touch && !sense.gone;
      // the pointer just over his head, roughly over him (a hand reaching out: a pat)
      const headTop = s.char.y - (TALL - FEET) * sz;
      const overHead = mouse && (free(mode()) || own(mode())) && s.idx >= 0 && Math.abs(p!.x - (s.char.x + 2 * sz * s.shown)) <= PAT_HALF * sz && headTop - p!.y >= 0 && headTop - p!.y <= PAT_HI + 60;
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
        else if (!afoot(md)) cond = 'neutral'; // ink, the stunt: nothing earned or lost
        else {
          const d = mouse ? Math.hypot(p!.x - s.char.x, p!.y - (s.char.y - 8 * sz)) : null;
          const linger = sense.touch && now - lastScroll >= LINGER_AFTER * 1000 && s.idx >= 0 && !!lastSeen[s.idx]?.visible;
          cond = classify({ d, speed: sense.speed, approach: sense.approach, still: p ? (now - p.t) / 1000 : Infinity, touch: sense.touch, pat, linger });
        }
        if ((cond === 'rough' || cond === 'chase') && s.cond !== cond && RANK[before] >= RANK.wary) flinch(s, now); // that costs him
        s.cond = cond;
        const t = trustNow(now, (t) => observe(t, now, cond));
        save(now);
        if (t.full && !lineShown.current && afoot(md) && s.idx >= 0 && !s.hidden && s.char.y > HEADER) {
          // the first time he fully trusts you: the hidden line, above him (once a session; TrustLine guards it)
          lineShown.current = true;
          lineRef.current?.show({ x: s.char.x, head: s.char.y - (TALL - FEET) * sz, feet: s.char.y + FEET * sz, gap: 10, half: 14 * sz, top: HEADER + CLEAR });
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

      // ---- stunt hook: he asked for it (showing off, on the hero ground) / a scroll ends it ----
      if (mode() === 'stunt' && stunt.scrolled(sy)) {
        stunt.stop(); // letters spring home; he gathers himself somewhere on screen (below)
        s.idx = -1;
        go(s, { type: 'vanish' }, now);
        s.tele = null;
        leaveNow(s, ps, now);
      } else if (!reduce && s.stuntAsk) {
        const gi = heroGround();
        const onGround = gi >= 0 && mode() === 'idle' && s.idx === gi;
        const eligible = onGround && !s.act && !s.walk.walking && s.stepGoal === null && !s.turnPending && !pressed && !holding;
        const sv = stuntView(s, gi);
        if (now - s.stuntAsk > 5000 || !onGround) s.stuntAsk = 0; // it didn't come together: something else then
        else if (stunt.want(now, sv, eligible) && go(s, { type: 'stunt' }, now)) {
          s.act = null;
          s.goal = null;
          s.stuntAsk = 0;
          s.stuntAt = now;
          stunt.begin(now, sv);
        } else s.idleAt = Math.max(s.idleAt, now + 400);
      }

      // ---- his surface: going away under him (leave now), or off screen (come along in a bit) ----
      {
        const md = mode();
        if (md !== 'teleport' && md !== 'falling' && !held(md) && md !== 'stunt') {
          const mine = s.idx >= 0 ? ps[s.idx] : undefined;
          const routed = md === 'hopping' || md === 'exploring';
          const feet = s.char.y + FEET * scale * s.k; // screen px
          const underHeader = routed
            ? // walking along a surface the scroll took up there; mid-jump or climbing, any of him under the header
              feet > -4 && (s.route?.[s.leg]?.kind === 'walk' ? feet < headroomK(s.k) : feet - TALL * scale * s.k < HEADER)
            : !!mine && mine.ok && mine.top < headroomK(Math.max(s.k, cache[s.idx].k)) && mine.top > -4; // (his size as drawn, if he's still growing into it)
          if (underHeader) offHeader(s, now, ps, md);
          else if (!mine || !mine.ok) {
            if (md !== 'hopping' || !mine) leaveNow(s, ps, now);
            else go(s, { type: 'vanish' }, now) && (s.tele = null, leaveNow(s, ps, now)); // the plate he was headed for went away
          } else if ((!mine.visible || !mine.onX) && md !== 'hopping' && md !== 'exploring') {
            if (!s.awaySince) {
              s.awaySince = now;
              s.awayFor = lerp(COME[1], COME[0], s.needs.company) * rand(0.85, 1.15);
              if (scrollSpeed() > QUICK_SCROLL) s.awayFor = Math.min(s.awayFor, rand(0.3, 0.5)); // you're on the move: he keeps up
              wakeIn(s.awayFor);
              note('away', now);
            } else if (freshAt > s.awaySince && (freshAt - s.awaySince) / 1000 + 1.2 < s.awayFor) {
              s.awayFor = (freshAt - s.awaySince) / 1000 + rand(0.4, 0.9); // a plate just came together on screen: he's along in a moment
              wakeIn(Math.max(0, s.awayFor - (now - s.awaySince) / 1000));
            } else if (now - s.awaySince >= s.awayFor * 1000) {
              s.awaySince = 0;
              comeAlong(s, ps, now);
            }
          } else s.awaySince = 0;
        }
        if (s.hidden && mode() !== 'teleport' && s.idx < 0) {
          // nowhere to be yet: try again (layout / scroll wake us)
          if (teleport(s, now, { ps, why: 'return' })) s.hidden = false;
        }
      }

      // ---- the user came close: his own whims stop (mid-jump he lands first) ----
      if (own(mode()) && nearAt > s.m.since && !s.letters) {
        const mv = s.route?.[s.leg];
        if (mode() === 'exploring' && mv && mv.kind !== 'walk') {
          s.route = s.route!.slice(0, s.leg + 1);
          s.goal = null;
        } else {
          if (mode() === 'exploring' && mv) {
            s.idx = mv.onto;
            s.pid = cache[mv.onto].id;
            s.walk = { ...s.walk, x: clampTo(s.char.x + viewport().sx - cache[mv.onto].left, cache[mv.onto].ext), v: 0, walking: false };
            s.route = null;
          }
          go(s, { type: 'attend' }, now);
        }
      }

      // ---- on a surface under his own power: walk toward the pointer when it's near him ----
      let backing = false; // edging away from the pointer (he keeps facing it)
      if (free(mode()) && s.idx >= 0) {
        const perch = cache[s.idx];
        const ext = perch.ext;
        const wc = s.k === 1 ? cfg : { ...cfg, cycle: cfg.cycle * s.k, vmax: cfg.vmax * (0.5 + 0.5 * s.k) };
        const raw = p ? p.x - ps[s.idx].left : s.walk.x;
        if (s.holdUntil && now >= s.holdUntil) s.holdUntil = 0;
        // a pointer buzzing round him: back off and swat at it (wary or shaken only: trust ends it)
        if (p && !reduce) {
          const d = Math.hypot(p.x - s.char.x, p.y - (s.char.y - 8 * sz));
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
        const near = !!p && !!company(s, p); // he only minds a pointer that's close to him
        const follow = near && !reduce && !s.holdUntil && p!.t > s.ignoreBefore && !blocked && !handOver && !stepping;
        if (stepping) {
          // a deliberate step: slow, all the way (no arrival slack)
          const x0 = s.walk.x;
          const ph0 = s.walk.phase;
          s.walk = stepWalk(s.walk, s.stepGoal!, dt, ext, { ...wc, vmax: wc.vmax * 0.5, arrive: 3, restart: 0 });
          s.walk.phase = (((ph0 + ((s.walk.x - x0) * (s.facing || 1)) / wc.cycle) % 1) + 1) % 1; // a step back is a step back
          s.anchored = false;
          if (!s.walk.walking) {
            s.walk = { ...s.walk, v: 0 };
            const then = s.afterStep;
            s.stepGoal = null;
            s.afterStep = null;
            then?.(now);
          }
        } else if (!follow && !swatting && !settledWalk(s.walk)) {
          s.walk = stepWalk(s.walk, s.walk.x, dt, ext, wc); // held up mid-stride: ease to a stop where he is
        }
        if (follow || swatting) {
          const prevX = s.walk.x;
          const prevPhase = s.walk.phase;
          // he keeps to his side of the pointer, as far off as he's comfortable with (wary: well back; warm: right by it)
          if (Math.abs(s.walk.x - raw) > 8) s.side = s.walk.x > raw ? 1 : -1;
          const goal = swatting ? s.walk.x + (p!.x > s.char.x ? -70 : 70) : raw + s.side * keepGap(tr.current!, now) * s.k;
          backing = !swatting && Math.sign(goal - s.walk.x) === s.side && Math.abs(goal - s.walk.x) > 4;
          s.walk = stepWalk(s.walk, goal, dt, ext, swatting ? { ...wc, vmax: wc.vmax * 0.8 } : now < s.slowUntil ? { ...wc, vmax: wc.vmax * 0.6 } : wc);
          const moved = s.walk.x - prevX;
          if (moved) {
            s.anchored = false;
            // gait runs backward when he backs away facing the pointer
            s.walk.phase = (((prevPhase + (moved * (s.facing || 1)) / wc.cycle) % 1) + 1) % 1;
          }
        }
        if (!swatting) {
          if (s.walk.walking && mode() === 'idle') go(s, { type: 'move' }, now);
          else if (!s.walk.walking && mode() === 'walking') go(s, { type: 'stop' }, now);
        }
      }

      // ---- a press on him: the claw (and only then) ----
      if (pressed && !reduce && !held(mode())) {
        go(s, { type: 'take', plan: PRESS }, now);
        if (!held(mode())) holding = false; // the press didn't take (he's ink just now)
      }
      if (held(mode()) && !holding) go(s, { type: 'release' }, now);

      // ---- his own ideas: the pointer rests over another printed plate → find a way there ----
      if (free(mode()) && mode() !== 'swatting' && s.idx >= 0 && !cache[s.idx].nook && !reduce && p && p.t > s.ignoreBefore && (fl === 'tolerant' || fl === 'warm') && !overHead) {
        // ledges are small: a generous zone above them counts as resting over them
        const over = (q: (typeof ps)[number], i: number) =>
          cache[i].ledge
            ? p.x >= q.left - 24 && p.x <= q.left + cache[i].width + 24 && p.y >= q.top - 110 && p.y <= q.bottom + 16
            : p.x >= q.left && p.x <= q.left + cache[i].width && p.y >= q.top - 40 && p.y <= q.bottom;
        const j = ps.findIndex((q, i) => i !== s.idx && !cache[i].nook && q.ok && q.visible && over(q, i));
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
            s.routeAt = { sy: viewport().sy, from: s.idx };
            s.run = false;
            go(s, { type: 'hop' }, now);
            s.idx = j;
            s.pid = cache[j].id;
          } else s.wantFail = j;
        }
      } else if (!free(mode())) s.want = -1;

      // ---- left to himself: sit by a resting pointer, or his needs choose what he does ----
      const near = company(s, p);
      const still = p ? (now - p.t) / 1000 : 0;
      if (mode() === 'idle' && s.idx >= 0 && !reduce && !s.walk.walking && !s.holdUntil && !s.act && !s.patting && s.stepGoal === null && near && fl === 'warm' && !uneasy(tr.current!, now) && !cache[s.idx].spot) {
        // fully at ease and the pointer resting right by him: he sits down beside it
        const by = Math.abs(near.p.x - s.char.x) < 110 && Math.abs(near.p.y - s.char.y) < 240;
        if (by && still >= SIT_REST) sitBeside(s, near.p, now);
        else if (by && s.sitWake !== near.p.t) {
          s.sitWake = near.p.t;
          wakeIn(SIT_REST - still);
        }
      }
      if (mode() === 'idle' && s.idx >= 0 && !reduce && now >= s.idleAt && !s.walk.walking && !s.holdUntil && !s.act && !s.patting && s.stepGoal === null && !s.turnPending && !s.stuntAsk && !s.awaySince) {
        if (cache[s.idx].spot) {
          // a one-off spot (done with the probe / the letters): on to somewhere proper
          teleport(s, now, { ps, why: 'done' });
        } else decide(s, ps, now);
        if (mode() === 'idle') armIdle(now, 'nothing');
      }

      // ---- busy: the thing he's doing plays out; sitting has its own clock ----
      probe.tick(s, now); // ---- probe hook ---- (a probe's beats, and the touch)
      if (mode() === 'fidget' && (!s.act || now >= s.act.at + s.act.dur * 1000)) {
        const pend = s.pending; // had his look: now he goes
        go(s, { type: 'done' }, now);
        // the route is in document space: if the page scrolled meanwhile (a pinned plate moves with it), it's stale; he thinks again later
        if (pend && mode() === 'idle') {
          if (Math.abs(viewport().sy - pend.sy) <= 6) beginRoute(s, pend.poi, pend.route, now);
          else s.goal = null;
        }
      }
      if (mode() === 'sitting') {
        if (now >= s.sitUntil) {
          go(s, { type: 'attend' }, now); // had enough: gets up
        } else if (now >= s.kickAt && !s.lying) {
          s.kickFrom = now;
          s.kickAt = now + (KICK + kickDelay(Math.random)) * 1000;
          wakeIn((s.kickAt - now) / 1000);
        }
      }

      // ---- a print arm swinging close past him: duck ----
      if (!reduce && (free(mode()) || mode() === 'fidget') && now > s.duckUntil && !s.letters) {
        const head = { x: s.char.x + sx, y: s.char.y + sy - 14 * sz };
        cache.forEach((c, i) => {
          if (c.nook) return;
          const a = c.el.dataset.arm; // assembling, or swinging back up off the finished plate
          const was = s.arms[i];
          s.arms[i] = a ?? '';
          if (!a || !was || a === was || now <= s.duckUntil) return;
          const [bx, by, tx, ty] = a.split(' ').map(Number);
          const B = { x: c.left + bx, y: c.top + by };
          const T = { x: c.left + tx, y: c.top + ty };
          const vx = T.x - B.x;
          const vy = T.y - B.y;
          const u = clamp(((head.x - B.x) * vx + (head.y - B.y) * vy) / Math.max(1, vx * vx + vy * vy));
          if (Math.hypot(head.x - (B.x + vx * u), head.y - (B.y + vy * u)) < 50 * sz) {
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
      const perchPos = (i: number, x: number): Pt => ({ x: ps[i].left + x, y: ps[i].pt.y });
      let ragdoll = false;
      let ink: { k: number; out: boolean } | undefined;
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
      // his size: smaller inside a plate; held or falling he comes out of the paper
      const kGoal = s.idx >= 0 && cache[s.idx] && (afoot(m.mode) || m.mode === 'stunt') ? cache[s.idx].k : held(m.mode) || m.mode === 'falling' ? 1 : s.k;
      if (m.mode !== 'teleport') s.k = Math.abs(kGoal - s.k) < 0.002 || reduce ? kGoal : lerp(s.k, kGoal, 1 - Math.pow(0.004, dt));
      sz = scale * s.k;
      switch (m.mode) {
        case 'swatting':
        case 'idle':
        case 'walking':
        case 'fidget':
        case 'sitting':
          if (s.idx >= 0) s.char = perchPos(s.idx, s.walk.x + s.seat + s.dx);
          s.grip = 0;
          break;
        case 'grabbed': {
          // the claw drops in from the rail and closes on his collar; he stays where you caught him
          const k = clamp((now - m.since) / 1000 / GRAB_HAND);
          s.grip = easeInOut(k);
          if (k >= 1) go(s, { type: 'gripped' }, now);
          break;
        }
        case 'carried': {
          // the claw follows the pointer; he hangs from the collar
          if (hand) {
            const goal = { x: hand.x - COLLAR.x * s.shown * sz, y: hand.y - COLLAR.y * sz };
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
        case 'falling': {
          const f = s.fall!;
          const t = (now - m.since) / 1000;
          const u = clamp(t / f.T);
          const x = f.x0 + (f.x1 - f.x0) * u + f.vx * f.T * u * (1 - u) * 0.5;
          const y = f.y0 + f.vy * Math.min(t, f.T) + (GRAVITY * Math.min(t, f.T) ** 2) / 2;
          s.char = { x: x - sx, y: (u >= 1 ? f.y1 : y) - sy };
          s.grip = 0;
          ragdoll = true;
          if (u >= 1) {
            s.fall = null;
            s.squash = 0.16;
            if (f.to >= 0 && cache[f.to]) {
              play(s, 'land', now);
              s.idx = f.to;
              s.pid = cache[f.to].id;
              s.walk = { x: clampTo(f.x1 - cache[f.to].left, cache[f.to].ext), v: 0, phase: s.walk.phase, walking: false };
              s.anchored = false;
              s.holdUntil = now + 1500; // catches his breath before following again
              go(s, { type: 'arrived' }, now);
            } else {
              // fell out of sight: he'll gather himself back on screen
              s.idx = -1;
              s.pid = '';
              s.hidden = true;
              go(s, { type: 'arrived' }, now);
              if (teleport(s, now, { ps, why: 'fell' })) s.hidden = false;
            }
          }
          break;
        }
        case 'teleport': {
          const T = s.tele;
          if (!T) {
            go(s, { type: 'arrived' }, now);
            break;
          }
          let ph = hopPhase(T.hop, now);
          if (T.swapped && (s.idx < 0 || !ps[s.idx]?.ok || ps[s.idx].top < headroomK(cache[s.idx].k))) {
            // the spot he was gathering at went away under him (a pinned plate came apart, its nook with it),
            // or the scroll has taken it up under the header: back through the gap, and gather again somewhere
            // that's still there
            T.swapped = false;
            T.to = null;
            if (!T.hop.instant && ph.phase !== 'gone') T.hop = { ...T.hop, at: now - T.hop.out * 1000 };
            ph = hopPhase(T.hop, now);
            if (ph.phase === 'out') ph = { phase: 'gone', k: 0 };
          }
          if (!T.swapped && ph.phase !== 'out') {
            // through the gap: he's at the destination now (or, if it went away meanwhile, somewhere else)
            let j = T.to ? cache.findIndex((c) => c.id === T.to!.id) : -1;
            if (j < 0 || !ps[j]?.ok || ps[j].top < headroomK(cache[j].k)) {
              const d = chooseDest(destSpots(ps, undefined, scrollSpeed() > QUICK_SCROLL ? QUICK_GAP + IN * QUICK_IN : 0.3 + IN), { focus: focusDoc(), view: { left: sx, right: sx + vp.w, top: sy + HEADER + CLEAR, bottom: sy + vh() - 8 }, me: null, rand: Math.random, drift: drift() });
              j = d ? d.i : -1;
              T.to = d ? { id: cache[d.i].id, x: clampTo(d.x - cache[d.i].left, cache[d.i].ext) } : null;
              T.poi = null;
              T.then = null;
            }
            if (j < 0) {
              // nowhere on screen: out of sight until there is
              s.tele = null;
              s.idx = -1;
              s.pid = '';
              s.hidden = true;
              go(s, { type: 'arrived' }, now);
              break;
            }
            s.idx = j;
            s.pid = cache[j].id;
            s.k = cache[j].k;
            sz = scale * s.k;
            s.walk = { x: T.to!.x, v: 0, phase: s.walk.phase, walking: false };
            s.anchored = false;
            s.hidden = false;
            T.swapped = true;
            const v = visitor();
            const at = perchPos(j, T.to!.x);
            if (T.poi?.face) s.facing = s.shown = T.poi.face;
            else if (v && Math.abs(v.x - at.x) > 10) s.facing = s.shown = v.x > at.x ? 1 : -1;
          }
          if (!T.swapped) {
            s.k = T.kFrom;
            sz = scale * s.k;
            const ride = T.fromPin ? pinTop(T.fromPin.pin, sy) - T.fromPin.top : 0; // a pinned plate holds still on screen: so does his ink
            s.char = { x: T.fromDoc.x - sx, y: T.fromDoc.y + ride - sy };
            ink = { k: ph.k, out: true };
          } else {
            s.char = perchPos(s.idx, s.walk.x);
            ink = ph.phase === 'gone' ? { k: 1, out: true } : ph.phase === 'in' ? { k: ph.k, out: false } : undefined;
          }
          s.grip = 0;
          if (ph.phase === 'done') {
            s.tele = null;
            go(s, { type: 'arrived' }, now);
            note(`arrived:${T.why}`, now);
            const after = (t: number) => {
              if (T.poi) arrive(s, t);
              else if (T.then) T.then(t);
              if (T.greet && freeNow(s) && !s.act) greet(s, t);
            };
            if (!reduce && !T.hop.instant) chain(s, now, [{ kind: 'shake', block: true }], after);
            else after(now);
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
          // the route is in document space; a pinned plate has moved down the document with the scroll since it was planned
          const ride = (i: number) => (i >= 0 && cache[i]?.pin ? pinTop(cache[i].pin!, sy) - pinTop(cache[i].pin!, s.routeAt.sy) : 0);
          const rFrom = ride(s.leg > 0 ? route[s.leg - 1].onto : s.routeAt.from);
          const rOnto = mv.kind === 'walk' ? rFrom : ride(mv.onto);
          s.char = { x: smp.p.x - sx, y: smp.p.y - FEET * scale - sy + lerp(rFrom, rOnto, clamp(t)) };
          if (!reduce && s.char.y + FEET * scale * s.k > -4 && s.char.y + (FEET - TALL) * scale * s.k < HEADER) {
            // this step (a jump's arc, or a route on a plate the scroll moved) would put him under the header: gone instead
            offHeader(s, now, ps, m.mode);
            ink = { k: 1, out: true };
            break;
          }
          const dir = mv.to.x >= mv.from.x ? 1 : -1;
          if (Math.abs(mv.to.x - mv.from.x) > 1) s.facing = dir;
          if (smp.action === 'walk') s.walk = { ...s.walk, v: dir * (m.mode === 'exploring' ? limX : s.run ? limRun : lim).speed, phase: (prevPhase + Math.abs(s.char.x - prevX) / cfg.cycle) % 1 };
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
            s.pid = cache[last.onto]?.id ?? '';
            s.walk = { x: clampTo(last.to.x - cache[last.onto].left, cache[last.onto].ext), v: 0, phase: s.walk.phase, walking: false };
            s.anchored = false;
            s.want = -1;
            const exploring = m.mode === 'exploring';
            const ran = s.run;
            s.run = false;
            go(s, { type: 'arrived' }, now);
            if (exploring && s.goal) arrive(s, now);
            else if (ran) {
              // caught up with you: hello
              s.greetAt = now + rand(200, 450);
              wakeIn(0.5);
            }
          }
          break;
        }
      }

      // on-the-spot action (fidget / activity / reaction) under whatever the mode is doing
      let kick = 0;
      s.amp = s.act?.kind === 'tap' ? s.amp : 1;
      if (s.m.mode === 'sitting') {
        s.action = s.lying ? 'lie' : 'sit';
        s.actionK = s.act?.kind === 'sit' || s.act?.kind === 'lie' ? clamp((now - s.act.at) / 1000 / s.act.dur) : 1;
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
      s.lwalk = false;
      if (s.letters) tickLetters(s, now); // ---- letter play: his pose and the letters ----

      s.kick = kick;
      // pendulum swing while carried, settles otherwise
      const inAir = s.m.mode === 'carried';
      const vx = (s.char.x - prevX) / Math.max(dt, 0.001);
      if (ragdoll && s.rd) {
        // falling: the collar drops with him, so gravity barely pulls his limbs (they float up loose)
        s.rag = stepRagdoll(s.rd, collarOf(s), dt, sz, m.mode === 'falling' ? 0.5 : 1);
        s.ragW = 1;
        s.swing = s.rag.torso;
        s.swingV = s.rd.torso.v;
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

      // facing: direction of travel while handled or walking; otherwise toward the pointer when it's near
      const handled = held(s.m.mode);
      const fresh = !!p && p.t > s.ignoreBefore && !!near; // a pointer he's still minding (close to him)
      if (s.m.mode === 'hopping' || s.m.mode === 'exploring' || own(s.m.mode) || s.m.mode === 'teleport') {
        // set by the route / the activity / where he gathered himself
      } else if (s.act?.block && now < s.act.at + s.act.dur * 1000) {
        // standing up / shaking himself off: not yet
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
      }
      // the about-face: facing flips instantly partway through a short pivot (head first, weight, a step
      // across — or a little hop when he's standing). Held, falling or reduced motion: just flips.
      const pivots = !reduce && !ragdoll && afoot(s.m.mode) && s.m.mode !== 'sitting';
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

      // gait amplitude follows speed; eases out when he stops
      const amtGoal =
        free(s.m.mode) || ((s.m.mode === 'hopping' || s.m.mode === 'exploring') && s.walk.v !== 0)
          ? clamp(Math.abs(s.walk.v) / (cfg.vmax * 0.35))
          : s.lwalk
            ? 0.7
            : 0;
      s.amt = amtGoal >= s.amt ? amtGoal : Math.max(amtGoal, s.amt - dt * 4);

      // a glance at the pointer for a moment after it moves, while he stands still (when it's near him)
      const looking = free(s.m.mode) && !reduce && fresh && !s.walk.walking && (now - p!.t) / 1000 < LOOK;
      const headY = s.char.y - 28 * sz;
      const aim = own(s.m.mode) && s.m.mode !== 'exploring' && s.look ? { x: s.look.x - sx, y: s.look.y - sy } : null;
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
      const standing = afoot(s.m.mode);
      const pg = POSTURE[fl];
      const ease = (cur: number, goal: number, base: number) => (reduce || Math.abs(goal - cur) < 0.004 ? goal : lerp(cur, goal, 1 - Math.pow(base, dt)));
      s.hunch = ease(s.hunch, standing ? pg.hunch : 0, 0.04);
      s.open = ease(s.open, standing ? pg.open : 0, 0.08);
      s.patW = ease(s.patW, s.patting && standing ? 1 : 0, s.patting ? 0.01 : 0.05);
      s.tilt = Math.abs(tiltGoal - s.tilt) < 0.002 ? tiltGoal : lerp(s.tilt, tiltGoal, 1 - Math.pow(0.004, dt));

      // the claw's carriage rides the rail above him while it has him (it's out of sight otherwise)
      const clawOut = handled || now - s.clawUpAt < CLAW_UP * 1000;
      if (clawOut) s.baseX = handled ? lerp(s.baseX, s.char.x, 1 - Math.pow(0.005, dt)) : s.baseX;
      else s.baseX = s.char.x;
      // ---- stunt hook: he's on the title (the driver says where and how); hand him back when it ends ----
      if (s.m.mode === 'stunt') {
        const gi = heroGround();
        const f = stunt.step(now, dt, stuntView(s, gi));
        if ('done' in f) {
          stunt.stop();
          if (f.done === 'ground' && gi >= 0) {
            s.idx = gi;
            s.pid = cache[gi].id;
            s.walk = { x: clampTo(f.x - cache[gi].left, cache[gi].ext), v: 0, phase: s.walk.phase, walking: false };
            s.anchored = false;
            s.char = perchPos(gi, s.walk.x);
            go(s, { type: 'done' }, now);
            armIdle(now);
          } else {
            // up on the title: he runs off into ink and gathers himself back down in the light
            s.idx = -1;
            teleport(s, now, { to: gi >= 0 ? { i: gi, x: cache[gi].left + home(gi) } : null, ps, why: 'stunt-down' });
          }
        } else {
          s.char = f.char;
          s.facing = s.shown = f.facing;
          s.turnAt = 0;
          s.action = f.action;
          s.actionK = f.actionK;
          s.kick = f.kick;
          s.amt = f.amt;
          s.walk = { ...s.walk, phase: f.phase, v: 0 };
          s.grip = 0;
          s.swing = f.swing;
          s.swingV = 0;
          s.tilt = f.tilt;
          s.squash = f.squash;
          s.rag = null;
          s.ragW = 0;
          ink = f.ink;
        }
      } else if (stunt.active) {
        // something took him mid-stunt (a press): letters home, and no jump back to the ground
        stunt.stop();
        if (stunt.last) s.char = { ...stunt.last };
      }
      draw(ink);

      // settled: idle and still, everything at rest, claw gone → sleep until something changes
      const settled =
        (s.m.mode === 'idle' || (s.m.mode === 'sitting' && !s.kickFrom)) &&
        !s.act &&
        !s.letters &&
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
        !clawOut &&
        s.k === kGoal &&
        Math.abs(s.swing) < 1e-4 &&
        Math.abs(s.swingV) < 1e-4 &&
        s.squash === 0 &&
        s.ragW === 0;
      if (settled) {
        // asleep, trust keeps changing on paper: wake when it next crosses a band (or fear fades)
        window.clearTimeout(trustTimer);
        const next = nextChange(tr.current!, now);
        if (next !== null) trustTimer = window.setTimeout(() => loop.wake(), Math.min(next, 600) * 1000 + 20);
      }
      return !settled;
    };

    const perchPosOf = (ps: Seen[], i: number, x: number): Pt => ({ x: ps[i].left + x, y: ps[i].pt.y });
    const clawTop = (x: number): Pt => ({ x, y: -vh() * 0.15 });
    let clawLast: Pt = { x: 0, y: 0 };
    const draw = (ink?: { k: number; out: boolean }) => {
      const s = st.current;
      if (!s) return;
      const now = performance.now();
      const collar = collarOf(s);
      const mode = s.m.mode;
      // the claw: only for a press. It drops in from the rail, holds him while you do, goes back up after.
      let tip: Pt | null = null;
      let grip = 0;
      if (held(mode)) {
        const k = mode === 'grabbed' ? clamp((now - s.m.since) / 1000 / GRAB_HAND) : 1;
        const e = easeInOut(k);
        const top = clawTop(collar.x);
        tip = { x: lerp(top.x, collar.x, e), y: lerp(top.y, collar.y, e) };
        grip = mode === 'grabbed' ? clamp((k - 0.6) / 0.4) : 1;
        clawLast = collar;
      } else if (now - s.clawUpAt < CLAW_UP * 1000) {
        const e = easeInOut(clamp((now - s.clawUpAt) / 1000 / CLAW_UP));
        const top = clawTop(clawLast.x);
        tip = { x: lerp(clawLast.x, top.x, e), y: lerp(clawLast.y, top.y, e) };
        grip = 1 - clamp(e * 3);
      }
      setAttr(armWrap.current, 'display', tip ? null : 'none');
      if (tip) {
        const t = vp.w < 700 ? 12 : 20;
        const base = { x: s.baseX, y: -t * 2 };
        // elbow side flips only once the tip is well past the carriage (no elbow pop as he moves)
        if (tip.x > base.x + 40) s.bend = -1;
        else if (tip.x < base.x - 40) s.bend = 1;
        armRef.current?.set({ base, tip, bend: s.bend, grip });
      }
      setAttr(hideRef.current, 'display', s.hidden && mode !== 'teleport' ? 'none' : null);
      const loose = s.rag && s.ragW > 0;
      const dangle = loose ? 0.3 * s.ragW : mode === 'carried' ? 1 : 0;
      const w = s.ragW;
      const rag = loose ? { torso: 0, head: s.rag!.head * w, armL: s.rag!.armL * w, armR: s.rag!.armR * w, legL: s.rag!.legL * w, legR: s.rag!.legR * w } : undefined;
      const turn = s.turnAt ? { k: clamp((now - s.turnAt) / 1000 / TURN), hop: s.turnHop } : undefined;
      const pose: Pose = {
        swing: 0,
        dangle: s.m.mode === 'stunt' && stunt.frame ? stunt.frame.dangle : dangle, // ---- stunt hook ----
        stunt: s.m.mode === 'stunt' ? stunt.frame?.stunt : undefined, // ---- stunt hook ----
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
        aim: probe.aim(), // ---- probe hook ----
        turn,
        tremble: s.tremble,
        mood: { hunch: s.hunch, open: s.open, pat: s.patW },
        ink: reduce ? undefined : ink,
        lie: s.action === 'lie' ? s.actionK : 0,
      };
      // character pivots on the collar while the claw has him
      const pivot = Math.abs(s.swing) > 1e-4;
      setAttr(tiltRef.current, 'transform', pivot ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : null);
      charRef.current?.set(s.char.x, s.char.y, sz, pose);
      if (sfx.on) sfx.puppet(mode, s.char.x, ink?.out); // ---- sfx hook ---- (ink: true running off, false gathering)
      // black on black (an ink plate's insides, the footer): a soft fog patch behind him (fades in CSS)
      const here = s.idx >= 0 ? cache[s.idx] : undefined;
      const fog = fogRef.current;
      if (fog) {
        const on = !!here?.dark && !s.hidden && !s.tele && !s.fall && mode !== 'carried';
        const op = on ? '1' : '0';
        if (fog.style.opacity !== op) fog.style.opacity = op;
        setAttr(fog, 'cx', s.char.x.toFixed(1));
        setAttr(fog, 'cy', (s.char.y - 9 * sz).toFixed(1));
        setAttr(fog, 'rx', (36 * sz).toFixed(1));
        setAttr(fog, 'ry', (50 * sz).toFixed(1));
      }
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
          // ---- v2.7: his own life ----
          /** his needs now (desires.ts), 0..1 */
          get desires() {
            const s = st.current;
            return s ? { ...s.needs } : null;
          },
          /** what he chose and when (ms), and where he was */
          decisions,
          /** times the claw has come down (only ever for a press) */
          get clawUses() {
            return clawUses;
          },
          /** the nooks inside assembled plates (document px) */
          get nooks() {
            return cache.filter((c) => c.nook && !c.spot).map((c) => ({ id: c.id, left: c.left, right: c.left + c.width, y: c.top, title: c.title, lie: c.lie, wall: c.wall }));
          },
          get letters() {
            const L = st.current?.letters;
            return L ? { trick: L.prog.trick, keys: L.prog.keys, dur: L.prog.dur } : null;
          },
          /** do this now (desires.ts Activity), as if he'd chosen it; false if he can't from here */
          force: (a: Activity, o: { trick?: Trick } = {}) => {
            const s = st.current;
            if (!s || reduce) return false;
            const now = performance.now();
            if (s.m.mode === 'sitting' || s.m.mode === 'fidget') go(s, { type: 'attend' }, now);
            if (s.m.mode !== 'idle' || s.idx < 0) return false;
            forcedTrick = o.trick ?? null;
            forced = a;
            decide(s, lastSeen, now);
            forced = null;
            forcedTrick = null;
            loop.wake();
            return s.did[0] === a;
          },
          /** teleport now: anywhere good near the pointer, or into a plate ('inside') */
          teleport: (where?: 'inside' | 'outside') => {
            const s = st.current;
            if (!s || reduce) return false;
            const now = performance.now();
            if (own(s.m.mode)) go(s, { type: 'attend' }, now);
            const ok = teleport(s, now, { ps: lastSeen, prefer: where, only: where === 'inside' ? (c) => c.nook && !c.spot : where === 'outside' ? (c) => !c.nook : undefined, greet: true, why: 'dev' });
            loop.wake();
            return ok;
          },
          /** the surface he's on (dev check: never an un-assembled or pinned plate while he stands on it) */
          get surface() {
            const s = st.current;
            const c = s && s.idx >= 0 ? cache[s.idx] : null;
            return c ? { id: c.id, nook: c.nook, printed: c.el.dataset.printed ?? null, assembled: c.el.dataset.assembled ?? null, sheet: c.el.dataset.sheet ?? null, pinned: c.el.dataset.pinned ?? null, top: c.top - viewport().sy } : null;
          },
          /** how many places on screen he could be right now (0: nowhere, e.g. only a plate being assembled is in view) */
          get places() {
            return destSpots(lastSeen).length;
          },
          get away() {
            const s = st.current;
            return s ? { since: s.awaySince, for: s.awayFor } : null;
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
          /** what he did and when: turning points, flinches, greetings, pats, fidgets, probes */
          events,
          // ---- stunt hook (dev) ----
          /** play the title stunt again (optionally with this seed) next time he's free on the hero ground */
          stunt: (seed?: number) => {
            stunt.force(seed);
            loop.wake();
          },
          get stuntFrame() {
            return stunt.frame;
          },
          get stuntInfo() {
            return stunt.info;
          },
          // ---- probe hook ---- `__puppet.probe('spin')` probes the nearest target of that kind now (caps
          // ignored; `{ action: 'look' | 'poke' | 'handsOn', win, glanceBack, id }` forces the rest)
          probe: (kind: Parameters<typeof probe.force>[1], o?: Parameters<typeof probe.force>[4]) => {
            const s = st.current;
            if (!s || reduce) return false;
            if (s.m.mode === 'sitting' || s.m.mode === 'fidget') go(s, { type: 'attend' }, performance.now()); // up off the edge first
            if (s.m.mode !== 'idle') return false;
            const ok = probe.force(s, kind, lastSeen, performance.now(), o);
            loop.wake();
            return ok;
          },
          get probes() {
            return probe.log;
          },
          get probing() {
            return probe.active;
          },
          get whims() {
            return probe.whims;
          },
          get probeCaps() {
            return probe.caps;
          },
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
    // a plate assembled or taken apart: its nooks change (and a perch may come or go)
    const mo = new MutationObserver((recs) => {
      dirty = true;
      if (recs.some((r) => (r.attributeName === 'data-assembled' && (r.target as HTMLElement).dataset.assembled === '1') || (r.attributeName === 'data-sheet' && (r.target as HTMLElement).dataset.sheet === '1'))) freshAt = performance.now();
      wake();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-printed', 'data-assembled', 'data-sheet', 'data-printing', 'data-pinned'] });

    // attention: any real pointer move or tap means the visitor is about (desires.ts `quiet`); only one
    // close to him stops what he's doing on his own and pushes back his next decision
    let anchor: Pt | null = null;
    let near: Pt | null = null;
    const attention = (x: number, y: number) => {
      const now = performance.now();
      if (!near || Math.hypot(x - near.x, y - near.y) > ATTEND) {
        near = { x, y };
        attnAt = now;
      }
      const s = st.current;
      const close = !!s && !s.hidden && Math.hypot(x - s.char.x, y - (s.char.y - 20 * sz)) < NEAR_HIM;
      if (close && (!anchor || Math.hypot(x - anchor.x, y - anchor.y) > BIG_MOVE)) {
        anchor = { x, y };
        nearAt = now;
        armIdle(now, 'attention');
      }
    };
    const onHim = (x: number, y: number) => {
      const s = st.current;
      const md = s?.m.mode;
      if (!s || reduce || s.hidden || !(afoot(md!) || md === 'falling' || md === 'stunt')) return false; // ---- stunt hook: you can catch him mid-stunt ----
      return Math.abs(x - s.char.x) < Math.max(18 * sz, 16) && y > s.char.y - 45 * sz && y < s.char.y + FEET * sz;
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
      const d = s ? Math.hypot(e.clientX - s.char.x, e.clientY - (s.char.y - 8 * sz)) : Infinity;
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
    // while he's held, a press-and-hold on a phone must not bring up the text-selection loupe,
    // callout or context menu over the drag (pointerdown's preventDefault doesn't stop those)
    const holdGuard = (on: boolean) => {
      const r = document.documentElement.style as CSSStyleDeclaration & { webkitUserSelect: string; webkitTouchCallout?: string };
      r.userSelect = r.webkitUserSelect = on ? 'none' : '';
      r.setProperty('-webkit-touch-callout', on ? 'none' : '');
    };
    const onContextMenu = (e: Event) => {
      if (holding) e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && onHim(e.clientX, e.clientY)) {
        e.preventDefault(); // no text selection / focus change under him
        pressed = { x: e.clientX, y: e.clientY };
        holding = true;
        hand = { x: e.clientX, y: e.clientY };
        document.documentElement.style.cursor = 'grabbing';
        holdGuard(true);
        wake();
        return;
      }
      if (e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const letGo = () => {
      if (!holding) return;
      holding = false;
      document.documentElement.style.cursor = '';
      holdGuard(false);
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
      if (s) trustNow(performance.now(), (t) => tap(t, performance.now(), Math.hypot(e.clientX - s.char.x, e.clientY - (s.char.y - 8 * sz))));
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
      const y = window.scrollY;
      scrollTrail.push({ t: attnAt, y });
      while (scrollTrail.length > 2 && attnAt - scrollTrail[0].t > 600) scrollTrail.shift();
      if (Math.abs(y - scrollY0) > 2) {
        scrollDir = y > scrollY0 ? 1 : -1;
        scrollY0 = y;
      }
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
    window.addEventListener('contextmenu', onContextMenu);
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
      window.removeEventListener('contextmenu', onContextMenu);
      holdGuard(false);
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
      if (st.current?.letters) endLetters(st.current);
      stunt.destroy(); // ---- stunt hook ----
      probe.stop(); // ---- probe hook ----
    };
  }, [vp, reduce]);

  if (!vp.w) return null;
  const t = vp.w < 700 ? 12 : 20;
  const l = vp.h * 0.42;
  return (
    <>
      <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="char-fog">
            <stop offset="0%" className="char-fog-stop" stopOpacity="0.42" />
            <stop offset="45%" className="char-fog-stop" stopOpacity="0.2" />
            <stop offset="75%" className="char-fog-stop" stopOpacity="0.07" />
            <stop offset="100%" className="char-fog-stop" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* behind him where he'd be black on black (ink plate insides, the footer) */}
        <ellipse ref={fogRef} className="char-fog" fill="url(#char-fog)" style={{ opacity: 0 }} />
        <g ref={hideRef}>
          <g ref={tiltRef}>
            <Character ref={charRef} />
          </g>
        </g>
        {/* the claw: only ever for a press on him (out of sight otherwise) */}
        <g ref={armWrap} display="none">
          <MechArm ref={armRef} l1={l} l2={l} t={t} tool="claw" toolLen={t * 2.6} />
        </g>
      </svg>
      <TrustLine ref={lineRef} />
    </>
  );
}
