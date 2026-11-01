import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character, STRIDE, type Action, type CharacterHandle, type Pose } from './Character';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { LIMITS, planRoute, sampleMove, type Move, type Surface } from './navigate';
import { free, held, initial, transition, type Ev, type Machine, type Plan } from './puppet-machine';
import { createRagdoll, primeRagdoll, stepRagdoll, type RagPose, type Ragdoll } from './ragdoll';
import { onLayout, setAttr, ticker } from './ticker';
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
 *
 * Perch rects are cached in document space; a frame does no layout reads. The loop sleeps once
 * he's idle and settled; scroll, layout, print-state, pointer input and timers wake it.
 */
const TRANSIT = 1.25; // s, scroll carry
const GRAB = 0.32; // s for the claw to close on his collar
const LAND = 0.3; // s for it to let go
const EDGE_BEAT = 0.7; // s stuck at an edge before the claw says no
const FOLLOW_HOLD = 5; // s max he ignores the pointer after an edge reset
const IDLE_MIN = 8;
const IDLE_MAX = 15;
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
  turn: number; // eased facing, -1..1
  tilt: number; // head tilt, rad
  squash: number;
  edgeSince: number; // when he got stuck at an edge with the pointer beyond it (0 = not)
  holdUntil: number; // after an edge reset he ignores the pointer until this time (or it returns)
  idleAt: number; // when the claw gets bored
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
};
/** A fall in document px: start, initial velocity, landing (char origin), duration. */
type Fall = { x0: number; y0: number; vx: number; vy: number; x1: number; y1: number; T: number; to: number };
type Perch = { el: HTMLElement; left: number; top: number; width: number; height: number; f: number; ext: Extent; ledge: boolean };
type Pointer = { x: number; y: number; t: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function Puppeteer() {
  const reduce = useReducedMotion();
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const st = useRef<State | null>(null);
  const ptr = useRef<Pointer | null>(null);
  const charRef = useRef<CharacterHandle>(null);
  const armRef = useRef<ArmHandle>(null);
  const tiltRef = useRef<SVGGElement>(null);

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
    let cache: Perch[] = [];
    const home = (i: number) => clampTo(cache[i].width * cache[i].f, cache[i].ext);
    const measure = () => {
      const sx = window.scrollX;
      const sy = window.scrollY;
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
    const armIdle = (now: number) => {
      const s = st.current;
      if (!s || reduce) return;
      const wait = rand(IDLE_MIN, IDLE_MAX);
      s.idleAt = now + wait * 1000;
      wakeIn(wait);
    };

    const go = (s: State, ev: Ev, now: number) => {
      const next = transition(s.m, ev, now);
      if (next === s.m) return false;
      if (import.meta.env.DEV && next.mode !== s.m.mode) console.debug(`[puppet] ${s.m.mode} → ${next.mode}`, ev.type === 'take' ? ev.plan : ev.type);
      const prev = s.m.mode;
      s.m = next;
      // entry actions
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
        if (next.plan?.why === 'edge') s.holdUntil = now + FOLLOW_HOLD * 1000;
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
      if (next.mode === 'grabbed') {
        s.route = null;
        s.fall = null;
      }
      if (next.mode === 'idle' && (prev === 'landing' || prev === 'falling' || prev === 'hopping')) {
        if (s.holdUntil > now) wakeIn((s.holdUntil - now) / 1000);
        armIdle(now);
      }
      return true;
    };

    const collarOf = (s: State): Pt => ({ x: s.char.x + COLLAR.x * s.facing * scale, y: s.char.y + COLLAR.y * scale });

    // let go: pick the printed perch under him (or the nearest one) and throw him at it in document space
    const startFall = (s: State) => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      const feet = s.char.y + FEET * scale;
      const vis = cache.map((c, i) => ({ c, i, top: c.top - sy, l: c.left - sx + c.ext.lo, r: c.left - sx + c.ext.hi })).filter((q) => q.c.el.dataset.printed !== '0' && q.top > 0 && q.top < vp.h);
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

    const frame = (now: number, dt: number) => {
      if (dirty) {
        measure(); // coalesced: at most one layout read per wake
        dirty = false;
      }
      const sy = window.scrollY;
      const sx = window.scrollX;
      const ps = cache.map((p) => {
        const top = p.top - sy;
        return {
          ok: p.el.dataset.printed !== '0',
          left: p.left - sx,
          pt: { x: p.left - sx + p.width * p.f, y: top - FEET * scale },
          top,
          visible: top > 70 && top < vp.h - 8,
          bottom: top + p.height,
        };
      });
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
          turn: 1,
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
        };
        armIdle(now);
      }
      const s = st.current;
      const mode = () => s.m.mode;
      const p = ptr.current;
      const heldPt = { x: vp.w * (vp.w < 700 ? 0.78 : 0.86), y: vp.h * 0.34 };
      heldPt.x += Math.sin(now / 1400) * 18;
      heldPt.y += Math.cos(now / 1100) * 10;

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
          else if (s.idx !== -1 || free(mode())) take = { kind: 'carry', why: 'lost', to: -1, x: 0 };
        } else if (mode() !== 'hopping' && best >= 0 && best !== s.idx && best !== s.placedBest && bestD + 80 < Math.abs(cur!.top - line)) {
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

      // ---- on a perch under his own power: walk, maybe get reset at an edge ----
      if (free(mode()) && s.idx >= 0) {
        const perch = cache[s.idx];
        const ext = perch.ext;
        const raw = p ? p.x - ps[s.idx].left : s.walk.x;
        if (s.holdUntil && (now >= s.holdUntil || (raw >= ext.lo && raw <= ext.hi))) s.holdUntil = 0;
        // a pointer buzzing round him: back off and swat at it
        if (p && !reduce) {
          const d = Math.hypot(p.x - s.char.x, p.y - (s.char.y - 8 * scale));
          if (mode() !== 'swatting' && d < PESTER && now - p.t < 500) go(s, { type: 'pester' }, now);
          else if (mode() === 'swatting' && (d > PESTER * 1.8 || now - p.t > 900)) go(s, { type: 'clear' }, now);
        }
        const swatting = mode() === 'swatting';
        const follow = !!p && !reduce && !s.holdUntil;
        if (follow || swatting) {
          const prevX = s.walk.x;
          const prevPhase = s.walk.phase;
          const goal = swatting ? s.walk.x + (p!.x > s.char.x ? -70 : 70) : raw;
          s.walk = stepWalk(s.walk, goal, dt, ext, swatting ? { ...cfg, vmax: cfg.vmax * 0.8 } : cfg);
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
      if (free(mode()) && mode() !== 'swatting' && s.idx >= 0 && !reduce && p) {
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
          const ok = ps.map((q) => q.ok && q.top > -vp.h * 0.5 && q.top < vp.h * 1.5);
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

      if (free(mode()) && mode() !== 'swatting' && s.idx >= 0 && !reduce) {
        const ext = cache[s.idx].ext;
        if (mode() === 'idle' && now >= s.idleAt) {
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
          if (free(mode())) armIdle(now);
        }
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
        s.action = 'swat';
        s.actionK = (((now - m.since) / 1000 / SWAT) % 1 + 1) % 1;
      }
      switch (m.mode) {
        case 'swatting':
        case 'idle':
        case 'walking':
        case 'landing':
          if (s.idx >= 0) s.char = perchPos(s.idx, s.walk.x);
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
              const goal = { x: hand.x - COLLAR.x * s.facing * scale, y: hand.y - COLLAR.y * scale };
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
          s.char = { x: x - window.scrollX, y: (u >= 1 ? f.y1 : y) - window.scrollY };
          s.grip = Math.max(0, s.grip - dt * 6);
          ragdoll = true;
          if (u >= 1) {
            s.fall = null;
            s.squash = 0.16;
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
        case 'hopping': {
          // his own route: one Move at a time, in document space
          const route = s.route!;
          let mv = route[s.leg];
          let t = (now - s.legAt) / 1000 / mv.duration;
          while (t >= 1 && s.leg < route.length - 1) {
            if (mv.kind === 'jump' || mv.kind === 'fall') s.squash = 0.1;
            s.legAt += mv.duration * 1000;
            s.leg++;
            mv = route[s.leg];
            t = (now - s.legAt) / 1000 / mv.duration;
          }
          const smp = sampleMove(mv, t, 40 * (scale / 1.85));
          const prevPhase = s.walk.phase;
          s.char = { x: smp.p.x - window.scrollX, y: smp.p.y - FEET * scale - window.scrollY };
          const dir = mv.to.x >= mv.from.x ? 1 : -1;
          if (Math.abs(mv.to.x - mv.from.x) > 1) s.facing = dir;
          if (smp.action === 'walk') s.walk = { ...s.walk, v: dir * lim.speed, phase: (prevPhase + Math.abs(s.char.x - prevX) / cfg.cycle) % 1 };
          else {
            s.walk = { ...s.walk, v: 0 };
            s.action = smp.action;
            s.actionK = smp.k;
          }
          s.grip = 0;
          if (t >= 1) {
            const last = route[route.length - 1];
            if (last.kind !== 'walk') s.squash = 0.1;
            s.route = null;
            s.idx = last.onto;
            s.walk = { x: clampTo(last.to.x - cache[last.onto].left, cache[last.onto].ext), v: 0, phase: s.walk.phase, walking: false };
            s.anchored = false;
            s.placedBest = best;
            s.want = -1;
            go(s, { type: 'arrived' }, now);
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
      if (s.m.mode === 'hopping') {
        // set by the route
      } else if (s.m.mode === 'swatting' && p) {
        s.facing = p.x > s.char.x ? 1 : -1; // faces the pest while backing off
      } else if (handled || s.m.mode === 'falling') {
        if (Math.abs(vx) > 30) s.facing = vx > 0 ? 1 : -1;
      } else if (Math.abs(s.walk.v) > 2) s.facing = s.walk.v > 0 ? 1 : -1;
      else if (p) {
        if (Math.abs(p.x - s.char.x) > 28) s.facing = p.x > s.char.x ? 1 : -1;
      } else s.facing = s.char.x < vp.w / 2 ? 1 : -1;
      const turnStep = dt * 4.5; // ~0.45 s for a full about-face, edge-on halfway like a paper cut-out
      // rate-capped and eased into the end so the about-face settles rather than snaps
      const dTurn = s.facing - s.turn;
      s.turn = reduce || Math.abs(dTurn) < 0.004 ? s.facing : s.turn + clamp(dTurn * dt * 8, -turnStep, turnStep);

      // gait amplitude follows speed; eases out when he stops. Dragged: a weak stumble, feet scraping.
      const amtGoal =
        free(s.m.mode) || (s.m.mode === 'hopping' && !s.action) ? clamp(Math.abs(s.walk.v) / (cfg.vmax * 0.35)) : s.m.mode === 'dragged' ? 0.35 : 0;
      s.amt = amtGoal >= s.amt ? amtGoal : Math.max(amtGoal, s.amt - dt * 4);

      // a glance at the pointer for a moment after it moves, while he stands still
      const looking = free(s.m.mode) && !reduce && !!p && !s.walk.walking && (now - p.t) / 1000 < LOOK;
      const headY = s.char.y - 28 * scale;
      const tiltGoal = looking ? lookAngle(p!.x - s.char.x, p!.y - headY) : 0;
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
        s.m.mode === 'idle' &&
        !s.edgeSince &&
        settledWalk(s.walk) &&
        s.amt === 0 &&
        s.turn === s.facing &&
        s.tilt === 0 &&
        !looking &&
        s.hoverX === hoverGoal &&
        Math.abs(s.swing) < 1e-4 &&
        Math.abs(s.swingV) < 1e-4 &&
        s.squash === 0 &&
        s.ragW === 0 &&
        Math.abs(s.baseX - baseGoal) < 1e-4; // tight: a looser snap leaves the carriage visibly off by a sub-pixel
      if (s.m.mode === 'dangling') return Math.abs(s.swing) > 1e-4 || !reduce; // sways in the air; reduced motion: still
      return !settled;
    };

    const draw = () => {
      const s = st.current;
      if (!s) return;
      const collar = { x: s.char.x + COLLAR.x * s.facing * scale, y: s.char.y + COLLAR.y * scale };
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
      const pose: Pose = { swing: 0, dangle, facing: s.turn, squash: s.squash, phase: s.walk.phase, walk: s.amt, tilt: s.tilt, rag, action: s.action, actionK: s.actionK };
      // character pivots on the collar while the claw has him
      const pivot = Math.abs(s.swing) > 1e-4;
      setAttr(tiltRef.current, 'transform', pivot ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : null);
      charRef.current?.set(s.char.x, s.char.y, scale, pose);
      armRef.current?.set({ base, tip, bend: s.bend, grip: g });
    };

    const loop = ticker.loop(frame);
    const wake = () => loop.wake();
    const offLayout = onLayout(() => {
      dirty = true;
      wake();
    });
    const mo = new MutationObserver(wake);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-printed'] });

    // attention: a big pointer move or a scroll pushes the claw's boredom back
    let anchor: Pt | null = null;
    const attention = (x: number, y: number) => {
      if (!anchor || Math.hypot(x - anchor.x, y - anchor.y) > BIG_MOVE) {
        anchor = { x, y };
        armIdle(performance.now());
      }
    };
    const onHim = (x: number, y: number) => {
      const s = st.current;
      const md = s?.m.mode;
      if (!s || reduce || !(free(md!) || md === 'landing' || md === 'falling' || md === 'hopping')) return false;
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
      ptr.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      attention(e.clientX, e.clientY);
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
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 600;
      down = null;
      if (!tap) return;
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
      armIdle(performance.now());
      wake();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('blur', letGo);
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
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
    };
  }, [vp, reduce]);

  if (!vp.w) return null;
  const t = vp.w < 700 ? 12 : 20;
  const l = vp.h * 0.42;
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full overflow-visible" viewBox={`0 0 ${vp.w} ${vp.h}`} aria-hidden="true">
      <g ref={tiltRef}>
        <Character ref={charRef} />
      </g>
      <MechArm ref={armRef} l1={l} l2={l} t={t} tool="claw" toolLen={t * 2.6} />
    </svg>
  );
}
