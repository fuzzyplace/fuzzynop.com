/**
 * Prod and probe, on the stage: he goes to one of the page's probe targets (targets.ts), considers
 * it, and does what his trust allows (probe.ts `chooseProbe` / `actionFor`): wary he only looks;
 * tolerant he gives it a small poke; warm he gets hands-on and glances back at the visitor after
 * ("did you see that?"); fully trusted, now and then a probe wins (the CTA cracks open, a badge spins
 * a full turn). Every touch lands on the target at the moment his hand meets it (`poke` / `pokeWin`).
 *
 * How he gets there (always a spot where his body box covers no text; v2.7: on his own, never the claw):
 * - stand: walk (navigate.ts) onto the plate's top edge, or the footer's ledge, and work from there
 *   (pick at a torn corner, lift the edge and look under it, poke up at a parked print arm, knock on
 *   the footer's edge so the 0x90 under it hops). If he can't walk there he teleports onto it.
 * - inside ("heist"): he slips into the plate (teleports; drawn smaller there, interior.ts INSIDE)
 *   and stands beside the target while he works (hex badges, the CTA, circuit nodes): `heistSpot`
 *   finds the side where his body clears all text. He stays inside after; the stage decides what next.
 *
 * Variety: everything he does on his own (fidgets, explore finds, sitting, probes) is noted here as a
 * whim; fidgets and explore finds avoid what he just did anywhere (moodVariety.ts), and the explore /
 * probe choice is weighted by what the pointer is doing, his trust and where he is on the page.
 *
 * The pure parts (`heistSpot`, `standFor`, `planBeats`, `whimWeights`, `chooseWhim`, `aimAt`) are
 * tested; `createProbeDriver` is the stage glue. Nothing here runs per frame unless a probe is under
 * way; targets are measured only when he decides. Reduced motion: nothing (the stage never calls in).
 */
import { clamp, lerp, type Pt } from './geometry';
import type { Rect } from './glyphs';
import type { Poi } from './explore';
import type { Fidget } from './idle';
import { noteRecent, pickVaried, type Weights } from './moodVariety';
import type { Move } from './navigate';
import { AIM_AHEAD, PROBE_HIT, PROBE_REACH, durOf, type AnyAction, type ProbeMove } from './poses';
import type { Ev, Machine } from './puppet-machine';
import { chooseProbe, COOLDOWN, type Band, type ProbeAction, type ProbeChoice, type ProbeKind, type ProbeTarget } from './probe';
import { isEngaged, poke, pokeWin, queryTargets, type PokeTarget } from './targets';

// ---------- tuning ----------
export const PROBE_GAP = 16; // s between probes at least (on top of probe.ts caps)
export const RETRY_AFTER = 25; // s a target he couldn't get at is left alone
export const NEAR_CURSOR = 150;
// NEAR_CURSOR: px; a target this close to the visitor's pointer is less tempting
/** His body box, character units from the collar (origin), facing +x. */
export const BODY = { back: 12, front: 14, up: 44, down: 27 };
const FIDGETS = new Set<string>(['look', 'scratch', 'shift', 'glasses', 'lookUp', 'crouch', 'cower', 'blink', 'tilt', 'wave', 'step']);

/** What his hand does to each kind of target. */
export const MOVE: Record<ProbeKind, ProbeMove> = { spin: 'prod', tug: 'tug', lift: 'pick', peek: 'lift', rattle: 'rattle', twitch: 'prod', tap: 'knock' };
/** The everyday activity (explore.ts / idle.ts) each probe most resembles: not straight after it. */
const LIKE: Record<ProbeKind, string> = { spin: 'tap', tug: 'crouch', lift: 'crouch', peek: 'peek', rattle: 'watch', twitch: 'watch', tap: 'crouch' };
/** How he gets at each kind: from a surface, or from inside the plate beside it. */
export const APPROACH: Record<ProbeKind, 'stand' | 'heist'> = { spin: 'heist', tug: 'heist', rattle: 'heist', lift: 'stand', peek: 'stand', twitch: 'stand', tap: 'stand' };

// ---------- pure helpers ----------

export const overlaps = (a: Rect, b: Rect, pad = 0) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
const cx = (r: Rect) => (r.left + r.right) / 2;
const cy = (r: Rect) => (r.top + r.bottom) / 2;

/** His body box (document px) with the collar at `c`. */
export function bodyBox(c: Pt, facing: 1 | -1, scale: number): Rect {
  const a = c.x - facing * BODY.back * scale;
  const b = c.x + facing * BODY.front * scale;
  return { left: Math.min(a, b), right: Math.max(a, b), top: c.y - BODY.up * scale, bottom: c.y + BODY.down * scale };
}

export type HeistOpts = {
  contact: Rect; // where his hand goes (document px)
  avoid: readonly Rect[]; // text (and other things) his body must not cover
  view: Rect; // the viewport, document px
  minTop: number; // document y nothing of him may go above (the header strip)
  scale: number;
  reach: readonly [number, number]; // hand at contact, body units from the collar (facing +x)
  prefer: 1 | -1; // side of the target to try first (+1 = right of it)
  pad?: number;
  maxColumn?: number; // px of text the claw's line down to him may cross (default: any; the stage keeps it small)
};
export type HeistSpot = { at: Pt; facing: 1 | -1; side: 1 | -1; column: number };

/**
 * Where the claw holds him beside a target so his hand meets it and his body covers no text (and
 * stays on screen, under the header). Tries both sides and a few heights; prefers the spot whose
 * column above him (the claw's line) crosses the least text. Null = nowhere clean.
 */
export function heistSpot(o: HeistOpts): HeistSpot | null {
  const pad = o.pad ?? 3;
  const h = o.contact.bottom - o.contact.top;
  let best: HeistSpot | null = null;
  for (const side of [o.prefer, -o.prefer as 1 | -1]) {
    const facing = -side as 1 | -1;
    const hx = side < 0 ? o.contact.left + 2 : o.contact.right - 2;
    for (const dy of [0, -0.28 * h, 0.28 * h]) {
      const at = { x: hx - facing * o.reach[0] * o.scale, y: cy(o.contact) + dy - o.reach[1] * o.scale };
      const box = bodyBox(at, facing, o.scale);
      if (box.left < o.view.left + 8 || box.right > o.view.right - 8 || box.top < o.minTop || box.bottom > o.view.bottom - 2) continue;
      if (o.avoid.some((r) => overlaps(box, r, pad))) continue;
      const lane = { left: at.x - 8 * o.scale, right: at.x + 8 * o.scale, top: o.minTop, bottom: box.top };
      const column = o.avoid.reduce((t, r) => t + (overlaps(lane, r) ? Math.min(lane.bottom, r.bottom) - Math.max(lane.top, r.top) : 0), 0);
      if (column > (o.maxColumn ?? Infinity)) continue;
      if (!best || column < best.column - 0.5) best = { at, facing, side, column };
    }
  }
  return best;
}

/** A surface he can stand on, document px: left/right = where his feet may go, x0/x1 = its ends. */
export type StandSurface = { left: number; right: number; y: number; x0: number; x1: number };
export type Stand = { x: number; facing: 1 | -1; look: Pt; aim: number };

/** Reach angle (poses.ts hang convention) from his shoulder to `p`, collar at `c`. */
export function aimAt(c: Pt, facing: 1 | -1, p: Pt, scale: number): number {
  const sh = { x: c.x + facing * 7 * scale, y: c.y - 7 * scale };
  return clamp(Math.atan2(-facing * (p.x - sh.x), p.y - sh.y), -2.6, -0.4);
}

/**
 * Where he stands on surface `s` to work on (or just look at) a target, his facing, where he looks
 * and his reach angle. `feet` = px from the collar down to his feet; `dir` = a plate corner's own side.
 */
export function standFor(kind: ProbeKind, action: ProbeAction, t: Rect, s: StandSurface, o: { scale: number; feet: number; from: number; dir?: number; rand: () => number }): Stand {
  const k = o.scale;
  const tc = { x: cx(t), y: cy(t) };
  const put = (x: number) => clamp(x, s.left, s.right);
  const toward = (x: number): 1 | -1 => (tc.x >= x ? 1 : -1);
  const collarY = s.y - o.feet;
  if (action === 'look') {
    // a careful distance, on his side of it, looking at it
    const side = o.from >= tc.x ? 1 : -1;
    const x = put(tc.x + side * 34 * k);
    const facing = Math.abs(tc.x - x) > 6 ? toward(x) : (-side as 1 | -1);
    return { x, facing, look: tc, aim: AIM_AHEAD };
  }
  switch (kind) {
    case 'lift': {
      // the torn corner: face it, crouched near the end of the edge
      const d: 1 | -1 = (o.dir ?? (tc.x > (s.x0 + s.x1) / 2 ? 1 : -1)) < 0 ? -1 : 1;
      const corner = d < 0 ? s.x0 : s.x1;
      const x = put(corner - d * (PROBE_REACH.pick![0] - 4) * k);
      return { x, facing: d, look: { x: corner, y: s.y + 4 }, aim: AIM_AHEAD };
    }
    case 'peek': {
      // anywhere along the edge's middle (near where he is), facing along it
      const lo = lerp(s.left, s.right, 0.2);
      const hi = lerp(s.left, s.right, 0.8);
      const x = clamp(o.from + (o.rand() - 0.5) * 120 * k, lo, hi);
      const facing: 1 | -1 = o.rand() < 0.5 ? 1 : -1;
      return { x, facing, look: { x: x + facing * 16 * k, y: s.y + 30 }, aim: AIM_AHEAD };
    }
    case 'twitch': {
      // the parked arm's tip, above the edge: on the plate's side of it, poking up at it
      const facing: 1 | -1 = tc.x > (s.x0 + s.x1) / 2 ? 1 : -1;
      const shY = collarY - 7 * k;
      const L = 16.5 * k;
      const vy = tc.y - shY;
      const hx = Math.sqrt(Math.max((0.3 * L) ** 2, L * L - vy * vy));
      const x = put(tc.x - facing * (7 * k + hx));
      return { x, facing, look: tc, aim: aimAt({ x, y: collarY }, facing, tc, k) };
    }
    case 'tap':
    default: {
      // over it, knocking on the edge above it
      const x = put(tc.x + (o.rand() - 0.5) * 40 * k);
      const facing: 1 | -1 = o.rand() < 0.5 ? 1 : -1;
      return { x, facing, look: { x: x + facing * 20 * k, y: s.y + 20 }, aim: AIM_AHEAD };
    }
  }
}

/** One beat of a probe: a move (or an ordinary action) for `dur` s, what he looks at, when it touches. */
export type Beat = { kind: AnyAction; dur: number; look: 'target' | 'visitor' | null; hits?: readonly number[]; win?: boolean; face?: 'visitor' };

/**
 * The beats of a probe: he considers it (and sometimes checks whether he's watched), then looks
 * closer (wary), or touches it (sometimes a feint first: second thoughts), watches what it does, and
 * when warm turns to the visitor with a shrug. A win: he startles, looks closer, then the shrug.
 */
export function planBeats(c: Pick<ProbeChoice, 'action' | 'win' | 'glanceBack'> & { kind: ProbeKind }, rand: () => number, recent: readonly string[] = []): Beat[] {
  const r = (a: number, b: number) => lerp(a, b, rand());
  const out: Beat[] = [];
  const think = pickVaried({ consider: 1.4, tilt: 0.8, inspect: c.action === 'look' ? 1 : 0.4 } as Weights<'consider' | 'tilt' | 'inspect'>, recent as ('consider' | 'tilt' | 'inspect')[], rand, 1) ?? 'consider';
  out.push({ kind: think, dur: think === 'consider' ? r(1.3, 2.2) * (c.action === 'handsOn' ? 0.75 : 1) : durOf(think) * r(1, 1.3), look: 'target' });
  if (c.action === 'look') {
    if (think !== 'consider') out.push({ kind: 'consider', dur: r(1.1, 1.8), look: 'target' });
    out.push({ kind: rand() < 0.5 ? 'inspect' : 'tilt', dur: r(1.2, 1.7), look: 'target' });
    if (rand() < 0.4) out.push({ kind: 'still', dur: r(0.4, 0.7), look: 'visitor' }); // is anyone watching?
    return out;
  }
  if (rand() < 0.3) out.push({ kind: 'still', dur: r(0.35, 0.6), look: 'visitor' }); // checks he's not watched
  const move = MOVE[c.kind];
  if (c.action === 'poke' && (move === 'prod' || move === 'tug') && rand() < 0.35) out.push({ kind: 'feint', dur: durOf('feint') * r(0.9, 1.2), look: 'target' });
  out.push({ kind: move, dur: durOf(move) * r(0.95, 1.15), look: 'target', hits: PROBE_HIT[move], win: c.win });
  if (c.action === 'handsOn' && move === 'rattle' && !c.win && rand() < 0.5) out.push({ kind: 'rattle', dur: durOf('rattle') * r(0.8, 1), look: 'target', hits: PROBE_HIT.rattle });
  if (c.win) {
    out.push({ kind: 'flinch', dur: durOf('flinch'), look: 'target' });
    out.push({ kind: 'inspect', dur: r(1.3, 1.8), look: 'target' });
  } else out.push({ kind: 'consider', dur: r(0.8, 1.2), look: 'target' }); // watches it settle
  if (c.glanceBack) out.push({ kind: 'shrug', dur: durOf('shrug') * r(0.95, 1.15), look: 'visitor', face: 'visitor' });
  return out;
}

/** What the visitor's pointer is doing, as far as his whims go. */
export type Cursor = 'gone' | 'watching' | 'near' | 'touch';
export type Region = 'hero' | 'page' | 'footer';
export type Whim = 'explore' | 'probe';
/**
 * Explore vs probe, weighted. Unwatched (pointer gone) he gets nosy; a pointer resting at a distance
 * (watching) makes a warm Z show off and a wary one keep to looking about; the hero is the title's
 * stage (fewer probes), the footer end of the page has the most to poke at.
 */
export function whimWeights(o: { band: Band; cursor: Cursor; region: Region; ready: boolean }): Weights<Whim> {
  if (!o.ready || o.band === 'shaken') return { explore: 1, probe: 0 };
  const byBand: Record<Band, number> = { shaken: 0, wary: 0.45, tolerant: 0.8, warm: 1.15 };
  const byCursor = o.cursor === 'gone' ? 1.25 : o.cursor === 'watching' ? (o.band === 'warm' ? 1.35 : o.band === 'wary' ? 0.7 : 1) : o.cursor === 'touch' ? 1 : 0.5;
  const byRegion = o.region === 'hero' ? 0.6 : o.region === 'footer' ? 1.25 : 1;
  return { explore: 1, probe: byBand[o.band] * byCursor * byRegion };
}
/** The next whim, never a probe straight after a probe (moodVariety: avoids the last pick). */
export function chooseWhim(o: Parameters<typeof whimWeights>[0] & { recent: readonly Whim[]; rand: () => number }): Whim {
  const recent: Whim[] = o.recent[0] === 'probe' ? ['probe'] : [];
  return pickVaried(whimWeights(o), recent, o.rand, 1) ?? 'explore';
}

/** Fidgets to avoid next: the last few things he did anywhere that are also fidgets, then his own. */
export function fidgetRecent(whims: readonly string[], fidgets: readonly Fidget[]): Fidget[] {
  const out: Fidget[] = [];
  for (const w of [...whims.slice(0, 2), ...fidgets]) if (FIDGETS.has(w) && !out.includes(w as Fidget)) out.push(w as Fidget);
  return out.slice(0, 3);
}

// ---------- the stage glue ----------

/** What the driver reads and writes on the stage's state (a structural slice of it). */
export type ProbedAct = { kind: AnyAction; at: number; dur: number; block?: boolean; look?: boolean; reverse?: boolean; then?: (now: number) => void };
export type Probed = { m: Machine; char: Pt; idx: number; walk: { x: number }; facing: 1 | -1; act: ProbedAct | null; look: Pt | null; goal: Poi | null; explored: number };
export type PerchLike = { el: HTMLElement; left: number; top: number; width: number; height: number; ext: { lo: number; hi: number }; ledge: boolean };
export type SeenLike = { ok: boolean; visible: boolean };

export type StageCtx = {
  scale: number;
  vw: number;
  vh: number;
  minTop: number; // screen px nothing of him may go above (header + clearance)
  feet: number; // px from his origin (collar) to his feet
  perches: () => readonly PerchLike[];
  view: () => { sx: number; sy: number };
  go: (ev: Ev, now: number) => boolean;
  wakeIn: (s: number) => void;
  /** his own route to surface `i` at document x, or null (can't get there on his own / off screen) */
  routeTo: (ps: readonly SeenLike[], i: number, x: number) => Move[] | null;
  /** set off along a route to a point of interest (with the stage's glance-first tell) */
  setOff: (poi: Poi, route: Move[], now: number) => void;
  /** at a point of interest already: do the thing */
  arrive: (now: number) => void;
  feel: (now: number) => Band;
  full: (now: number) => boolean;
  visitor: () => Pt | null; // screen px
  cursor: () => Cursor;
  attnAt: () => number;
  note: (k: string, now: number) => void;
  /** px per character unit inside a plate (he's drawn smaller there) */
  insideScale: number;
  /**
   * Teleport (ink) to a surface (`i`, document x) or to a standing spot inside a plate (feet, document
   * px); `poi` becomes his goal, and the stage calls `arrive` once he's gathered himself there.
   */
  teleportTo: (dest: { i: number; x: number } | { spot: Pt; facing: 1 | -1 }, poi: Poi, now: number) => boolean;
  /**
   * v2.9: the document top now of the sticky plate holding `el` (the stage's live pin model, no
   * layout read), or null if it isn't on one. A probe on a pinned plate follows it with this.
   */
  pinTop?: (el: Element) => number | null;
};

type Run = {
  t: PokeTarget;
  kind: ProbeKind;
  action: ProbeAction;
  win: boolean;
  glanceBack: boolean;
  approach: 'walk' | 'drop' | 'heist'; // drop / heist: he teleports there (onto the surface / inside the plate)
  phase: 'approach' | 'ready' | 'beats' | 'return';
  at: number; // ms it started
  beats: Beat[];
  i: number;
  beatAt: number;
  fired: number; // hits played in the current beat
  look: Pt; // document px
  hold: Pt | null; // heist: collar, document px
  facing: 1 | -1;
  aim: number;
  dir: number; // side he's on, for the target's response
  surf: number; // stand: the surface index
  forced: boolean;
  pin0: number | null; // the target's sticky plate top (document px) when the look point was last set
};
export type ProbeLog = { t: number; id: string; kind: ProbeKind; action: ProbeAction; approach: Run['approach']; win: boolean; glanceBack: boolean; result: 'started' | 'touched' | 'won' | 'looked' | 'caught' | 'aborted' | 'done' };

const SAVE = 'fz:probe';

export function createProbeDriver(ctx: StageCtx) {
  let run: Run | null = null;
  let whims: string[] = []; // what he did on his own lately, most recent first (actions / activities / probe:kind)
  let whimCats: Whim[] = [];
  let recentKinds: ProbeKind[] = []; // most recent last (probe.ts convention)
  let thinks: string[] = [];
  let finds = 0;
  let lastProbeAt = -Infinity;
  const poked = new Map<string, number>(); // id → s it was last probed (or given up on)
  const log: ProbeLog[] = [];
  let cta = 0;
  try {
    cta = Number(JSON.parse(window.sessionStorage.getItem(SAVE) ?? '{}').cta) || 0;
  } catch {
    cta = 0;
  }
  const saveCta = () => {
    try {
      window.sessionStorage.setItem(SAVE, JSON.stringify({ cta }));
    } catch {
      // no storage: the cap holds for this page load
    }
  };
  const k = ctx.scale;
  const record = (r: Run, result: ProbeLog['result'], now: number) => {
    log.push({ t: Math.round(now), id: r.t.id, kind: r.kind, action: r.action, approach: r.approach, win: r.win, glanceBack: r.glanceBack, result });
    if (log.length > 120) log.shift();
    ctx.note(`probe:${r.kind}:${r.action}:${result}`, now);
  };
  const noteWhim = (w: string) => {
    whims = noteRecent(whims, w, 5);
    ctx.note(`whim:${w}`, performance.now());
  };

  /** Probe targets on screen now, as probe.ts sees them (document px). */
  const gather = (now: number) => {
    const { sx, sy } = ctx.view();
    const v = ctx.visitor();
    const pv = v ? { x: v.x + sx, y: v.y + sy } : null;
    const all = queryTargets();
    const list: { pt: PokeTarget; pr: ProbeTarget }[] = [];
    for (const t of all) {
      const r = t.rect;
      if (r.right < sx + 40 || r.left > sx + ctx.vw - 40 || r.top < sy + ctx.minTop || r.bottom > sy + ctx.vh - 4) continue;
      if (isEngaged(t.el)) continue;
      const given = poked.get(t.id);
      let bias = t.el.closest('footer') ? 1.25 : 1;
      if (pv && Math.hypot(cx(r) - pv.x, cy(r) - pv.y) < NEAR_CURSOR) bias *= 0.25;
      if (whims.slice(0, 2).includes(LIKE[t.kind])) bias *= 0.3; // just did something much like it
      list.push({ pt: t, pr: { id: t.id, kind: t.kind, rect: r, reach: t.reach, winnable: t.winnable, lastPoked: given ?? null, bias } });
    }
    return { all, list, at: now / 1000 };
  };

  const surfaceOf = (t: PokeTarget, ps: readonly SeenLike[]): number => {
    const P = ctx.perches();
    let i = P.findIndex((p) => !p.ledge && p.el.contains(t.el));
    if (i < 0) i = P.findIndex((p) => p.el.hasAttribute('data-poke-ledge') && !!p.el.parentElement?.contains(t.el));
    return i >= 0 && ps[i]?.ok && ps[i].visible ? i : -1;
  };

  /** Text (and other targets) on screen his body must not cover, document px. Read phase only. */
  const avoidRects = (t: PokeTarget, all: readonly PokeTarget[], contact: Rect): Rect[] => {
    const { sx, sy } = ctx.view();
    const out: Rect[] = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > ctx.vh || r.right < 0 || r.left > ctx.vw) continue;
        out.push({ left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy });
      }
    }
    for (const o of all) {
      if (o.el === t.el || (o.kind !== 'spin' && o.kind !== 'tug' && o.kind !== 'rattle')) continue;
      // another node: its hex (its label is text, already in)
      const hex = o.kind === 'tug' ? o.el.querySelector('svg')?.getBoundingClientRect() : null;
      out.push(hex ? { left: hex.left + sx, right: hex.right + sx, top: hex.top + sy, bottom: hex.bottom + sy } : o.rect);
    }
    out.push(contact); // the part his hand goes to (its label, if any, is text above)
    return out;
  };

  /** Plan how he gets at it; false = he can't (he'll leave it alone a while). */
  const start = (s: Probed, choice: ProbeChoice, pt: PokeTarget, all: readonly PokeTarget[], ps: readonly SeenLike[], now: number, forced = false): boolean => {
    if (s.idx < 0) return false;
    const { sx, sy } = ctx.view();
    const P = ctx.perches();
    const kind = pt.kind;
    const action = choice.action;
    const meX = s.char.x + sx;
    const base: Omit<Run, 'approach' | 'look' | 'hold' | 'facing' | 'aim' | 'dir' | 'surf'> = {
      t: pt,
      kind,
      action,
      win: choice.win,
      glanceBack: choice.glanceBack,
      phase: 'approach',
      at: now,
      beats: planBeats({ kind, action, win: choice.win, glanceBack: choice.glanceBack }, Math.random, thinks),
      i: -1,
      beatAt: now,
      fired: 0,
      forced,
      pin0: ctx.pinTop?.(pt.el) ?? null,
    };
    const heist = action !== 'look' && APPROACH[kind] === 'heist';
    if (heist) {
      const contactEl = (kind === 'tug' && pt.el.querySelector('svg')) || (kind === 'rattle' && pt.el.querySelector('.cta-btn')) || pt.el;
      const cr = contactEl.getBoundingClientRect();
      const contact = { left: cr.left + sx, right: cr.right + sx, top: cr.top + sy, bottom: cr.bottom + sy };
      const move = MOVE[kind];
      const reach = PROBE_REACH[move] ?? PROBE_REACH.prod!;
      const ki = ctx.insideScale;
      const spot = heistSpot({
        contact,
        avoid: avoidRects(pt, all, contact),
        view: { left: sx, right: sx + ctx.vw, top: sy, bottom: sy + ctx.vh },
        minTop: sy + ctx.minTop,
        scale: ki,
        reach,
        prefer: meX >= cx(contact) ? 1 : -1,
      });
      if (!spot) return false;
      // standing there, his feet are below the collar: still on screen
      const feetY = spot.at.y + (ctx.feet / k) * ki;
      if (feetY - sy > ctx.vh - 4) return false;
      run = { ...base, approach: 'heist', look: { x: cx(contact), y: cy(contact) }, hold: spot.at, facing: spot.facing, aim: AIM_AHEAD, dir: spot.side, surf: -1 };
      const poi: Poi = { id: `probe:${pt.id}`, kind: 'probe', s: -1, x: spot.at.x, face: spot.facing, look: run.look, activity: 'look', weight: 0 };
      if (!ctx.teleportTo({ spot: { x: spot.at.x, y: feetY }, facing: spot.facing }, poi, now)) {
        run = null;
        return false;
      }
      record(run, 'started', now);
      return true;
    }
    const i = surfaceOf(pt, ps);
    if (i < 0) return false;
    const p = P[i];
    const surf: StandSurface = { left: p.left + p.ext.lo, right: p.left + p.ext.hi, y: p.top, x0: p.left, x1: p.left + p.width };
    if (surf.right < sx + 40 || surf.left > sx + ctx.vw - 40) return false;
    const dirAttr = Number(pt.el.getAttribute('data-poke-dir'));
    const st = standFor(kind, action, pt.rect, { ...surf, left: Math.max(surf.left, sx + 40), right: Math.min(surf.right, sx + ctx.vw - 40) }, { scale: k, feet: ctx.feet, from: meX, dir: dirAttr === 1 || dirAttr === -1 ? dirAttr : undefined, rand: Math.random });
    const route = ctx.routeTo(ps, i, st.x);
    const poi: Poi = { id: `probe:${pt.id}`, kind: 'probe', s: i, x: st.x, face: st.facing, look: st.look, activity: 'look', weight: 0 };
    run = { ...base, approach: route ? 'walk' : 'drop', look: st.look, hold: null, facing: st.facing, aim: st.aim, dir: st.x >= cx(pt.rect) ? 1 : -1, surf: i };
    record(run, 'started', now);
    if (route) {
      s.goal = poi;
      if (!route.length) ctx.arrive(now);
      else ctx.setOff(poi, route, now);
      return true;
    }
    if (!ctx.teleportTo({ i, x: st.x }, poi, now)) {
      run = null;
      return false;
    }
    return true;
  };

  const cancel = (now: number, why: ProbeLog['result'] = 'aborted') => {
    if (run && run.phase !== 'return') record(run, why, now);
    run = null;
  };

  const finishProbe = (r: Run, now: number) => {
    const at = now / 1000;
    poked.set(r.t.id, at);
    lastProbeAt = now;
    finds = 0;
    recentKinds = [...recentKinds, r.kind].slice(-4);
    whimCats = ['probe' as Whim, ...whimCats].slice(0, 3);
    noteWhim(`probe:${r.kind}`);
    if (r.kind === 'rattle' && r.action !== 'look') {
      cta++;
      saveCta();
    }
  };

  const startBeat = (s: Probed, now: number) => {
    const r = run!;
    const b = r.beats[r.i];
    r.beatAt = now;
    r.fired = 0;
    const v = b.look === 'visitor' || b.face === 'visitor' ? ctx.visitor() : null;
    if ((b.look === 'visitor' || b.face === 'visitor') && !v) {
      // nobody to look at: a thoughtful blink at the target instead
      r.beats[r.i] = { kind: 'blink', dur: durOf('blink') * 1.4, look: 'target' };
      return startBeat(s, now);
    }
    if (b.face === 'visitor' && v) {
      if (Math.abs(v.x - s.char.x) > 10) s.facing = v.x > s.char.x ? 1 : -1;
    } else s.facing = r.facing;
    s.look = b.look === 'target' ? r.look : null;
    s.act = { kind: b.kind, at: now, dur: b.dur, look: b.look === 'visitor' };
    thinks = r.i === 0 ? noteRecent(thinks, b.kind as string, 2) : thinks;
    ctx.wakeIn(b.dur);
  };

  const begin = (s: Probed, now: number) => {
    const r = run!;
    if (!ctx.go({ type: 'fidget' }, now)) return cancel(now);
    r.phase = 'beats';
    r.i = 0;
    s.explored++;
    startBeat(s, now);
  };

  /** The hand meets it: the target answers (or the visitor's on it: he's caught, and backs off). */
  const touch = (b: Beat, now: number): boolean => {
    const r = run!;
    const el = r.t.el;
    let ok = false;
    let won = false;
    if (b.win && r.fired === 0) won = ok = pokeWin(el, r.dir);
    if (!ok) ok = poke(el, r.kind, r.dir);
    if (!ok) {
      // the visitor's pointer is on it (or it's gone): caught in the act
      record(r, 'caught', now);
      r.beats = [...r.beats.slice(0, r.i + 1), { kind: 'flinch', dur: durOf('flinch'), look: 'target' }, { kind: 'still', dur: 0.5, look: 'visitor' }];
      r.beats[r.i] = { ...b, hits: [] };
      r.win = false;
      return false;
    }
    if (r.fired === 0) record(r, won ? 'won' : 'touched', now);
    return true;
  };

  return {
    /** dev / tests */
    get log() {
      return log;
    },
    get whims() {
      return whims as readonly string[];
    },
    get active() {
      return run ? { kind: run.kind, action: run.action, approach: run.approach, phase: run.phase, beat: run.beats[run.i]?.kind, win: run.win } : null;
    },
    get caps() {
      return { cta, finds, sinceLast: (performance.now() - lastProbeAt) / 1000, recentKinds: [...recentKinds] };
    },
    /** He did something on his own (a fidget, an explore find's activity, sitting). */
    noteWhim,
    /** An explore find (probes need FINDS_PER_PROBE of them since the last). */
    noteFind() {
      finds++;
      whimCats = ['explore' as Whim, ...whimCats].slice(0, 3);
    },
    /** Fidgets to avoid next (across everything he's done lately). */
    fidgetRecent: (fidgets: readonly Fidget[]) => fidgetRecent(whims, fidgets),
    /** Explore filter: not the activity he just did (the stage falls back to anything if nothing's left). */
    fresh: (p: Poi) => !whims.slice(0, 2).includes(p.activity),

    /**
     * The idle decision (stage): `kind` from idle.ts. On 'explore' he may probe something instead.
     * True = a probe is under way (the stage does nothing else).
     */
    decide(s: Probed, kind: 'fidget' | 'explore' | 'rest', ps: readonly SeenLike[], now: number, sure = false): boolean {
      if (run || kind !== 'explore' || s.idx < 0) return false;
      const band = ctx.feel(now);
      if (band === 'shaken' || now - lastProbeAt < PROBE_GAP * 1000) return false;
      const P = ctx.perches();
      const p = P[s.idx];
      const region: Region = !p ? 'page' : p.el.closest('#top') ? 'hero' : p.el.closest('footer') ? 'footer' : 'page';
      const g = gather(now);
      const { sx, sy } = ctx.view();
      const st = { now: g.at, band, full: ctx.full(now), findsSinceProbe: finds, recentKinds, ctaProbes: cta, from: { x: s.char.x + sx, y: s.char.y + sy } };
      let list = g.list;
      let choice = chooseProbe(list.map((q) => q.pr), st);
      const whim = chooseWhim({ band, cursor: ctx.cursor(), region, ready: !!choice, recent: whimCats, rand: Math.random });
      if (!sure && whim !== 'probe') return false;
      for (let tries = 0; choice && tries < 3; tries++) {
        const pick = list.find((q) => q.pr.id === choice!.target.id)!;
        if (start(s, choice, pick.pt, g.all, ps, now)) return true;
        poked.set(pick.pr.id, g.at - COOLDOWN + RETRY_AFTER); // couldn't get at it: leave it a while
        list = list.filter((q) => q !== pick);
        choice = chooseProbe(list.map((q) => q.pr), st);
      }
      return false;
    },

    /** Dev: probe a target of `kind` now (nearest on screen), ignoring caps. */
    force(s: Probed, kind: ProbeKind, ps: readonly SeenLike[], now: number, o: { action?: ProbeAction; win?: boolean; glanceBack?: boolean; id?: string } = {}) {
      if (run || s.idx < 0) return false;
      const g = gather(now);
      const { sx, sy } = ctx.view();
      const me = { x: s.char.x + sx, y: s.char.y + sy };
      const list = g.all
        .filter((t) => t.kind === kind && (!o.id || t.id === o.id))
        .filter((t) => g.list.some((q) => q.pt === t))
        .sort((a, b) => Math.hypot(cx(a.rect) - me.x, cy(a.rect) - me.y) - Math.hypot(cx(b.rect) - me.x, cy(b.rect) - me.y));
      const band = ctx.feel(now);
      for (const t of list) {
        const action = o.action ?? (band === 'wary' || band === 'shaken' ? 'look' : ['rattle', 'peek', 'twitch'].includes(kind) ? 'handsOn' : 'poke');
        const choice: ProbeChoice = { target: { id: t.id, kind, rect: t.rect, reach: t.reach, winnable: t.winnable }, action, win: !!o.win && t.winnable, glanceBack: o.glanceBack ?? (band === 'warm' && action !== 'look') };
        if (start(s, choice, t, g.all, ps, now, true)) return true;
      }
      return false;
    },

    /** Stage arrive(): he reached a probe's spot (on foot, or gathered there from ink). */
    arrive(s: Probed, now: number) {
      if (!run || run.phase !== 'approach' || s.goal?.kind !== 'probe') return;
      begin(s, now);
    },

    /** Stage go(): a machine transition happened. */
    entered(s: Probed, prev: Machine, ev: Ev, now: number) {
      if (!run) return;
      const m = s.m;
      if (ev.type === 'attend' || ev.type === 'pester' || ev.type === 'take') cancel(now);
      else if (m.mode === 'idle' && run.phase === 'beats' && prev.mode === 'fidget') {
        // the beats ran out (or something stopped him): done
        if (run.i >= run.beats.length - 1) {
          record(run, run.action === 'look' ? 'looked' : 'done', now);
          finishProbe(run, now);
          run = null;
        } else cancel(now);
      }
    },

    /** Stage frame, before the busy checks: plays the beats, touches at the right moment. */
    tick(s: Probed, now: number) {
      const r = run;
      if (!r) return;
      // a target on a sticky plate: the plate holds still on screen while it's pinned, so its document
      // position (and where he looks) moves with the scroll
      if (r.pin0 !== null) {
        const top = ctx.pinTop?.(r.t.el) ?? r.pin0;
        const d = top - r.pin0;
        if (d !== 0) {
          const following = s.look === r.look;
          r.look = { x: r.look.x, y: r.look.y + d };
          if (r.hold) r.hold = { x: r.hold.x, y: r.hold.y + d };
          if (following) s.look = r.look;
          r.pin0 = top;
        }
      }
      const m = s.m.mode;
      if (r.phase === 'approach') {
        const ok = r.approach === 'walk' ? m === 'exploring' || m === 'fidget' || m === 'idle' : m === 'teleport' || m === 'idle' || m === 'fidget';
        if (!ok) cancel(now);
        return;
      }
      if (r.phase !== 'beats') return;
      if (m !== 'fidget' || !r.t.el.isConnected) return cancel(now);
      const b = r.beats[r.i];
      const u = (now - r.beatAt) / 1000 / b.dur;
      const hits = b.hits ?? [];
      while (r.fired < hits.length && u >= hits[r.fired]) {
        if (!touch(b, now)) break;
        r.fired++;
      }
      if (u < 1) return;
      if (r.i < r.beats.length - 1) {
        r.i++;
        startBeat(s, now);
        return;
      }
      // the last beat is over: the stage's fidget ends with this act; `entered` closes the run
    },

    /** The front arm's reach angle for the pose. */
    aim() {
      return run && run.phase === 'beats' ? run.aim : AIM_AHEAD;
    },
    /** A probe is under way (he's on his way to it, or at it). */
    get busy() {
      return !!run;
    },
    stop() {
      run = null;
    },
  };
}
export type ProbeDriver = ReturnType<typeof createProbeDriver>;
