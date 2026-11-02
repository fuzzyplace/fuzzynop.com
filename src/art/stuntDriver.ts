/**
 * Plays the title stunt (stunt.ts) on the stage. A small controller the Puppeteer calls from a few
 * hook points (`// ---- stunt hook ----` in PuppeteerStage.tsx); it owns nothing of the stage's state.
 *
 * - `want`: he's standing idle on the hero ground and the title is written. Measures the title in a
 *   ticker read phase (never mid-frame), builds the program, says yes once it's ready.
 * - `begin` / `step`: where he is, how he holds himself, the claw's grip, the letters (targets.ts
 *   `setGlyphs`), a soft light behind him so the silhouette reads on the dark hero. Positions are
 *   worked out in document px and handed back in screen px.
 * - `stop`: letters spring home (`resetGlyphs`), the light fades. Called when it's over, and the
 *   moment anything takes him (a press, a scroll, the claw fetching him).
 *
 * Once per page load, seeded at random (dev: `?stuntSeed=<n>`, or `__puppet.stunt(seed)`).
 */
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { mapTitle, type GlyphBox, type GlyphPose, type Rect } from './glyphs';
import { HANG_HAND, type Action, type StuntAct, type StuntOpts } from './poses';
import { beatAt, lettersAt, newSeed, siteFor, stuntProgram, type Station, type StuntProgram } from './stunt';
import { measureTitle, resetGlyphs, setGlyphs, titleEl } from './targets';
import { measure, setAttr } from './ticker';
import { lookAngle } from './walk';

/** His body in character units (see PuppeteerStage) and the px scale they're drawn at. */
export type StuntBody = {
  scale: number;
  feet: number; // origin to feet
  tall: number; // feet to the top of his head
  collar: Pt; // where the claw holds him, from the origin
  cycle: number; // px per gait cycle
  headroom: number; // screen px from the top his head must stay below (fixed header + a margin)
};
/** What the stage tells the driver each frame (screen px unless noted). */
export type StuntView = {
  sx: number;
  sy: number;
  vw: number;
  vh: number;
  char: Pt;
  facing: 1 | -1;
  pointer: Pt | null;
  ground: { top: number; left: number; lo: number; hi: number } | null; // document px; lo/hi: walk extent along it
};
export type StuntFrame = {
  char: Pt;
  facing: 1 | -1;
  action?: Action;
  actionK: number;
  kick: number;
  stunt?: { kind: StuntAct; k: number } & StuntOpts;
  amt: number; // gait amplitude
  phase: number; // gait phase
  grip: number; // the claw on his collar, 0..1 (v2.7: always 0; the claw is only ever the visitor's)
  ink?: { k: number; out: boolean }; // the boost: he runs off into ink on the ground and gathers himself on the title
  dangle: number;
  swing: number; // rad, about the collar
  tilt: number; // head, rad
  squash: number;
};
export type StuntEnd = { done: 'ground'; x: number } | { done: 'collect' };

type G = GlyphBox & { boxTop: number; boxBottom: number }; // + the span's own box (transform origin)
type Ready = { prog: StuntProgram; glyph: Map<string, G>; row0: G[]; hero: Pt; sy: number; vw: number; at: number };

// v2.7: not on load any more. He plays it when he feels like showing off near the title (the stage
// calls `invite`); `played` is set again once it starts (the stage is rebuilt on resize; this isn't).
let played = true;
let forced: number | null = null;
function devSeed(): number | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(window.location.search).get('stuntSeed');
  return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) >>> 0 : null;
}

const RUN = 230; // px/s at desktop scale
const envelope = (u: number) => Math.max(0, Math.min(1, u / 0.12, (1 - u) / 0.18)); // as stunt.ts fxPose
const rotate = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const DEG = Math.PI / 180;

export function createStunt(body: StuntBody, wake: () => void) {
  const s = body.scale;
  let ready: Ready | null = null;
  let measuring = false;
  let retryAt = 0; // the title wasn't all on screen: don't measure again until then
  let run: {
    p: Ready;
    t0: number;
    sy: number;
    start: Pt; // doc origin when it began
    facing: 1 | -1;
    ground: NonNullable<StuntView['ground']>;
    groundX: number; // doc x he's at on the ground
    ax: number; // where the run-up ended (doc x)
    phase: number;
    lastX: number;
    ySm: number | null;
    tilt: number;
    home: number | null; // ms the walk home started
    reset: boolean;
  } | null = null;
  let out: StuntFrame | null = null;
  let last: Pt | null = null;

  const h1 = titleEl();
  const mo = new MutationObserver(() => wake());
  if (h1) mo.observe(h1, { attributes: true, attributeFilter: ['data-written'] });
  const spot = document.querySelector<HTMLElement>('[data-stunt-light]');

  // ---- measuring (read phase) ----
  const build = (): Ready | null => {
    const h = titleEl();
    if (!h) return null;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hr = h.getBoundingClientRect();
    if (hr.top < body.headroom * 0.5 || hr.bottom > vh) return null; // the title isn't all on screen
    const m = measureTitle(h);
    if (!m || !m.glyphs.length) return null;
    // the text around the title, as text (its blocks are full width: they'd rule out the whole top row)
    const range = document.createRange();
    const textRect = (el: Element | null): Rect | null => {
      if (!el) return null;
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return r.width ? { left: r.left + sx, top: r.top + sy, right: r.right + sx, bottom: r.bottom + sy } : null;
    };
    const near = [textRect(h.previousElementSibling), textRect(h.nextElementSibling)].filter((r): r is Rect => !!r);
    const big = 1e6;
    const frame: Rect[] = [
      { left: -big, right: big, top: -big, bottom: sy + body.headroom }, // the fixed header
      { left: -big, right: sx + 4, top: -big, bottom: big },
      { left: sx + vw - 4, right: big, top: -big, bottom: big },
      { left: -big, right: big, top: sy + vh - 4, bottom: big },
    ];
    const map = mapTitle(m.glyphs, [...near, ...frame], { w: 22 * s, h: body.tall * s, hangUp: (body.tall - body.feet + HANG_HAND[1]) * s, hangDown: (body.feet - HANG_HAND[1]) * s });
    // the tagline's lines from the letters themselves (spaces aren't spans)
    const lines: string[][] = [];
    for (const g of m.glyphs) (lines[g.line] ??= [])[g.i] = g.ch;
    const tagline = lines.map((l) => Array.from(l, (c) => c ?? ' ').join(''));
    const site = siteFor(tagline, map, s);
    const seed = forced ?? devSeed() ?? newSeed();
    forced = null;
    const prog = stuntProgram(seed, site, { mobile: vw < 700 });
    const glyph = new Map<string, G>();
    for (const g of m.glyphs) {
      const el = h.querySelector(`[data-glyph="${g.key}"]`);
      if (!el) continue;
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      glyph.set(g.key, { ...g, boxTop: r.top + sy, boxBottom: r.bottom + sy });
    }
    const row0 = map.rows[0]?.glyphs.map((g) => glyph.get(g.key)!).filter(Boolean) ?? [];
    const hero = h.closest('section')?.getBoundingClientRect();
    if (import.meta.env.DEV) console.debug(`[puppet] stunt seed ${seed}: ${prog.variations.join(' + ') || 'nothing'}`, site);
    return { prog, glyph, row0, hero: hero ? { x: hero.left + sx, y: hero.top + sy } : { x: 0, y: 0 }, sy, vw, at: performance.now() };
  };

  /** He's free on the hero ground (the stage decides that). True once a program is ready to play. */
  const want = (now: number, v: StuntView, eligible: boolean): boolean => {
    if (played || !eligible || !v.ground || h1?.getAttribute('data-written') !== '1') return false;
    if (ready && ready.sy === v.sy && ready.vw === v.vw && now - ready.at < 1500) {
      if (ready.prog.variations.length) return true;
      played = true; // nothing here he can do at this size
      return false;
    }
    if (!measuring && now >= retryAt) {
      measuring = true;
      measure(() => {
        measuring = false;
        ready = build();
        if (import.meta.env.DEV) console.debug(`[puppet] stunt measured: ${ready ? 'ready' : 'not now'}`);
        if (ready) wake();
        else retryAt = performance.now() + 2500;
      });
    }
    return false;
  };
  /** A program is coming (title written, not played yet, in view): the stage holds off his other whims. */
  const pending = (now: number) => !played && now >= retryAt && h1?.getAttribute('data-written') === '1';

  const begin = (now: number, v: StuntView) => {
    if (!ready || !v.ground) return;
    played = true;
    const start = { x: v.char.x + v.sx, y: v.char.y + v.sy };
    run = { p: ready, t0: now, sy: v.sy, start, facing: v.facing, ground: v.ground, groundX: start.x, ax: start.x, phase: 0, lastX: start.x, ySm: null, tilt: 0, home: null, reset: false };
    ready = null;
    if (spot) setAttr(spot, 'data-on', '');
  };

  const stop = () => {
    if (!run) return;
    run = null;
    resetGlyphs();
    if (spot) setAttr(spot, 'data-on', null);
  };

  // ---- where he is ----
  const poseOf = (poses: Map<string, GlyphPose>, key: string) => poses.get(key) ?? {};
  /** A point of a letter after its current transform (CSS: origin + translate + rotate about it). */
  const moved = (g: G, p: Pt, pose: GlyphPose): Pt => {
    const o = { x: g.left + (pose.ox ?? 0.5) * (g.right - g.left), y: g.boxTop + (pose.oy ?? 1) * (g.boxBottom - g.boxTop) };
    const r = rotate({ x: p.x - o.x, y: p.y - o.y }, (pose.rot ?? 0) * DEG);
    return { x: o.x + (pose.x ?? 0) + r.x, y: o.y + (pose.y ?? 0) + r.y };
  };
  const gripOf = (g: G, pose: GlyphPose): Pt => moved(g, g.ch === ',' ? { x: g.right - 2, y: g.top + 3 } : { x: g.right - 1, y: g.top + 2 }, pose);
  /** His origin hanging from `grip` (facing the letter, to his left), rotated θ about the collar. */
  const hangOrigin = (grip: Pt, theta: number): Pt => {
    const f = -1;
    const d = { x: f * (HANG_HAND[0] - body.collar.x) * s, y: (HANG_HAND[1] - body.collar.y) * s };
    const r = rotate(d, theta);
    const collar = { x: grip.x - r.x, y: grip.y - r.y };
    return { x: collar.x - body.collar.x * f * s, y: collar.y - body.collar.y * s };
  };
  /** The highest letter top under his feet on the top row (doc y), x = doc. */
  const topY = (p: Ready, x: number) => {
    const half = 7 * s;
    let y = Infinity;
    let near = Infinity;
    let nearY = p.row0[0]?.top ?? 0;
    for (const g of p.row0) {
      if (!/\p{L}/u.test(g.ch)) continue;
      if (g.right > x - half && g.left < x + half) y = Math.min(y, g.top);
      const d = Math.abs((g.left + g.right) / 2 - x);
      if (d < near) {
        near = d;
        nearY = g.top;
      }
    }
    return Number.isFinite(y) ? y : nearY;
  };
  const center = (g: G) => (g.left + g.right) / 2;
  const seatX = (g: G) => g.right - 7 * s;
  /** Origin (doc) at a station, letters as posed now (hangs: θ = 0). */
  const at = (st: Station, poses: Map<string, GlyphPose>): Pt => {
    const r = run!;
    if (st.at === 'ground') return { x: r.groundX, y: r.ground.top - body.feet * s };
    const g = r.p.glyph.get(st.key)!;
    if (st.at === 'hang') return hangOrigin(gripOf(g, poseOf(poses, st.key)), 0);
    if (st.at === 'seat') return { x: seatX(g), y: g.top + (poseOf(poses, st.key).y ?? 0) - body.feet * s };
    return { x: center(g), y: topY(r.p, center(g)) - body.feet * s };
  };
  const stationFacing = (st: Station, fallback: 1 | -1): 1 | -1 => (st.at === 'hang' ? -1 : st.at === 'seat' ? 1 : fallback);

  // ---- one frame ----
  const step = (now: number, dt: number, v: StuntView): StuntFrame | StuntEnd => {
    const r = run;
    if (!r) return { done: 'collect' };
    const t = (now - r.t0) / 1000;
    const prog = r.p.prog;
    const hit = beatAt(prog, t);
    const poses = hit ? lettersAt(prog, t) : new Map<string, GlyphPose>();
    if (hit && hit.beat.kind !== 'cleanup') setGlyphs(poses);
    else if (!r.reset) {
      r.reset = true;
      resetGlyphs();
    }
    const doc = (p: Pt): Pt => ({ x: p.x - v.sx, y: p.y - v.sy });
    const f: StuntFrame = { char: { ...v.char }, facing: r.facing, actionK: 0, kick: 0, amt: 0, phase: r.phase, grip: 0, dangle: 0, swing: 0, tilt: 0, squash: 0 };
    let o: Pt; // origin, doc
    let look: Pt | null = null; // doc
    const glyphPt = (key: string | null): Pt | null => {
      const g = key ? r.p.glyph.get(key) : undefined;
      return g ? { x: center(g), y: (g.top + g.bottom) / 2 } : null;
    };
    const pointerDoc = v.pointer ? { x: v.pointer.x + v.sx, y: v.pointer.y + v.sy } : null;

    if (!hit) {
      // over: on the ground he walks back into the light; anywhere else the claw comes for him
      const last = prog.beats[prog.beats.length - 1];
      if (last && last.to.at !== 'ground') return { done: 'collect' };
      const g = r.ground;
      const goal = g.left + clamp(r.groundX - g.left, g.lo, g.hi);
      const dist = goal - r.groundX;
      if (Math.abs(dist) < 2) return { done: 'ground', x: r.groundX };
      r.home ??= now;
      const step = Math.sign(dist) * Math.min(Math.abs(dist), RUN * 0.75 * (s / 1.85) * dt);
      r.groundX += step;
      o = { x: r.groundX, y: g.top - body.feet * s };
      f.facing = r.facing = dist > 0 ? 1 : -1;
      f.amt = clamp((now - r.home) / 250);
    } else {
      const { beat: b, u } = hit;
      const A = at(b.from, poses);
      const B = at(b.to, poses);
      const target = glyphPt(b.glyph);
      f.facing = r.facing = stationFacing(b.to, r.facing);
      switch (b.kind) {
        case 'glance':
        case 'consider': {
          o = A;
          const first = target ?? glyphPt([...r.p.glyph.keys()][0] ?? null);
          if (first) f.facing = r.facing = first.x < o.x ? -1 : 1;
          look = first;
          f.action = b.kind === 'glance' ? 'glance' : 'tilt';
          f.actionK = u;
          break;
        }
        case 'approach': {
          const next = prog.beats[hit.index + 1];
          const to = next ? at(next.to, poses) : A;
          const dir = to.x < A.x ? -1 : 1;
          const room = Math.max(0, Math.abs(to.x - A.x) - 40 * s);
          const d = Math.min(room, RUN * (s / 1.85) * b.dur);
          r.ax = A.x + dir * d * u * (0.35 + 0.65 * u);
          o = { x: r.ax, y: A.y };
          f.facing = r.facing = dir;
          f.amt = d > 8 ? clamp(u * 5) : 0;
          if (d <= 8) {
            f.action = 'jump';
            f.actionK = 0.15 * u; // no room for a run-up: he gathers himself
          }
          look = target;
          break;
        }
        case 'boost': {
          // v2.7: no claw. Mid-stride he runs off into ink on the ground and gathers himself on his first spot
          const from = { x: r.ax, y: A.y };
          if (u < 0.44) {
            o = from;
            f.ink = { k: u / 0.44, out: true };
            f.facing = r.facing = B.x < from.x ? -1 : 1;
          } else if (u < 0.52) {
            o = B;
            f.ink = { k: 1, out: true };
          } else if (u < 0.92) {
            o = B;
            f.ink = { k: (u - 0.52) / 0.4, out: false };
            if (b.to.at === 'hang') f.stunt = { kind: 'cling', k: 1 };
          } else {
            const k = (u - 0.92) / 0.08;
            o = B;
            if (b.to.at === 'hang') f.stunt = { kind: 'cling', k: 1 };
            else {
              f.action = 'land';
              f.actionK = 0.3 + 0.7 * k;
            }
          }
          if (u >= 0.86) f.facing = r.facing = stationFacing(b.to, r.facing);
          look = target;
          break;
        }
        case 'step':
        case 'walk': {
          const keys = b.kind === 'walk' ? b.letters[0]?.keys ?? [] : [];
          let x: number;
          if (keys.length > 1) {
            // his feet run along the letters at the pace of the sag (stunt.ts, index units)
            const fi = u * (keys.length - 1);
            const i0 = Math.min(keys.length - 2, Math.floor(fi));
            x = lerp(center(r.p.glyph.get(keys[i0])!), center(r.p.glyph.get(keys[i0 + 1])!), fi - i0);
          } else x = lerp(A.x, B.x, easeInOut(u));
          let y = topY(r.p, x) - body.feet * s;
          if (keys.length) {
            const under = keys.reduce((a, k) => (Math.abs(center(r.p.glyph.get(k)!) - x) < Math.abs(center(r.p.glyph.get(a)!) - x) ? k : a));
            y += poseOf(poses, under).y ?? 0;
          }
          r.ySm = r.ySm === null ? y : lerp(r.ySm, y, 1 - Math.pow(1e-4, dt)); // steps up and down between letters, not a snap
          o = { x, y: r.ySm };
          f.facing = r.facing = B.x < A.x ? -1 : 1;
          f.amt = clamp(Math.min(u, 1 - u) * 8) * 0.75;
          break;
        }
        case 'poke':
        case 'watch': {
          o = A;
          const g = r.p.glyph.get(b.glyph!)!;
          f.facing = r.facing = center(g) < o.x ? -1 : 1;
          const c = { x: f.facing > 0 ? g.left + 3 : g.right - 3, y: g.top + 3 };
          const reach: [number, number] = [((c.x - o.x) * f.facing) / s, (c.y - o.y) / s];
          f.stunt = { kind: b.kind === 'poke' ? 'poke' : 'regard', k: u, reach };
          look = c;
          break;
        }
        case 'sit':
        case 'stand': {
          const g = r.p.glyph.get(b.kind === 'sit' ? (b.to as { key: string }).key : (b.from as { key: string }).key)!;
          const top = { x: center(g), y: topY(r.p, center(g)) - body.feet * s };
          const seat = { x: seatX(g), y: g.top - body.feet * s };
          const k = b.kind === 'sit' ? u : 1 - u;
          o = { x: lerp(top.x, seat.x, easeInOut(k)), y: lerp(top.y, seat.y, easeInOut(k)) };
          f.facing = r.facing = 1;
          f.action = 'sit';
          f.actionK = k;
          look = pointerDoc ?? { x: o.x + 200, y: o.y - 60 };
          break;
        }
        case 'perch': {
          o = A;
          f.facing = r.facing = 1;
          f.action = 'sit';
          f.actionK = 1;
          f.kick = 0.75 * Math.sin(u * b.dur * Math.PI * 2 * 0.7) * envelope(u);
          // looks round: out over the page, then at you
          look = u < 0.5 || !pointerDoc ? { x: o.x + 300, y: o.y + 140 } : pointerDoc;
          break;
        }
        case 'drop': {
          // off the edge (or let go), a short fall, and he catches the corner below
          const fromTop = b.from.at !== 'hang';
          if (u < 0.2) {
            const k = u / 0.2;
            o = A;
            if (fromTop) {
              f.facing = r.facing = B.x < A.x ? -1 : 1;
              f.action = 'jump';
              f.actionK = 0.15 * k;
            } else f.stunt = { kind: 'cling', k: 0 };
          } else if (u < 0.86) {
            const w = (u - 0.2) / 0.66;
            const hop = fromTop ? 16 * s * 4 * w * (1 - w) : 0;
            o = { x: lerp(A.x, B.x, easeInOut(w)), y: lerp(A.y, B.y, w * w) - hop };
            f.action = 'fall';
            f.actionK = w;
            f.facing = r.facing = w < 0.6 && fromTop ? (B.x < A.x ? -1 : 1) : -1;
          } else {
            const c = (u - 0.86) / 0.14;
            const theta = 0.22 * (1 - c) * Math.sin(c * Math.PI * 2);
            const g = r.p.glyph.get(b.glyph!)!;
            o = hangOrigin(gripOf(g, poseOf(poses, b.glyph!)), theta);
            f.swing = theta;
            f.stunt = { kind: 'cling', k: c, sway: -Math.sin(c * Math.PI * 2) * (1 - c) };
          }
          look = target;
          break;
        }
        case 'flick':
        case 'swing':
        case 'hang': {
          const key = (b.to as { key: string }).key;
          const g = r.p.glyph.get(key)!;
          const pose = poseOf(poses, key);
          const e = envelope(u);
          const sec = u * b.dur;
          const lean = 0.1 * e; // his weight brings his feet in under the grip a little
          let theta = lean;
          let sway = 0;
          if (b.kind === 'swing') {
            const dir = b.letters[0]?.dir ?? 1;
            const ph = sec * Math.PI * 2 * 0.9;
            theta += dir * 0.32 * e * Math.sin(ph);
            sway = -dir * Math.cos(ph) * e;
          } else if (b.kind === 'flick') {
            theta += (pose.rot ?? 0) * DEG * 1.6; // the comma flicks round, he's jerked with it
            sway = -(pose.rot ?? 0) / 22;
          } else theta += 0.05 * e * Math.sin(sec * Math.PI * 2 * 0.5);
          o = hangOrigin(gripOf(g, pose), theta);
          f.swing = theta;
          f.stunt = { kind: 'cling', k: u, sway };
          look = b.kind === 'flick' ? { x: g.left, y: g.top - 40 } : b.kind === 'hang' && u > 0.6 ? { x: o.x + 30, y: r.ground.top } : null;
          break;
        }
        case 'release': {
          // lets go, drops to the ground beside the title, knees give
          const land = { x: A.x + 6 * s, y: r.ground.top - body.feet * s };
          if (u < 0.08) {
            o = A;
            f.stunt = { kind: 'cling', k: 1 };
          } else if (u < 0.7) {
            const w = (u - 0.08) / 0.62;
            o = { x: lerp(A.x, land.x, w), y: lerp(A.y, land.y, w * w) };
            f.action = 'fall';
            f.actionK = w;
          } else {
            const k = (u - 0.7) / 0.3;
            o = land;
            f.action = 'land';
            f.actionK = k;
            f.squash = 0.12 * (1 - k);
            r.groundX = land.x;
          }
          break;
        }
        case 'lookback':
        case 'cleanup': {
          // "did you see that": a look back at the visitor (or out at the page)
          o = A;
          const there = pointerDoc ?? { x: v.sx + v.vw / 2, y: v.sy + v.vh / 2 };
          if (b.kind === 'lookback') look = there;
          if (b.from.at === 'hang') f.stunt = { kind: 'cling', k: u, back: b.kind === 'lookback' && there.x > o.x };
          else if (b.from.at === 'seat') {
            f.action = 'sit';
            f.actionK = 1;
          } else if (b.kind === 'lookback') {
            if (Math.abs(there.x - o.x) > 12) f.facing = r.facing = there.x < o.x ? -1 : 1;
            f.action = 'blink';
            f.actionK = clamp((u - 0.55) / 0.3);
          }
          break;
        }
      }
    }

    // gait advances with distance covered on foot
    if (f.amt > 0) r.phase = (r.phase + Math.abs(o.x - r.lastX) / body.cycle) % 1;
    r.lastX = o.x;
    f.phase = r.phase;
    f.char = doc(o);
    // head aims at what he's looking at (chin up / down; facing does left / right)
    const headY = f.char.y - 28 * s;
    const goal = look ? lookAngle(look.x - v.sx - f.char.x, look.y - v.sy - headY, 0.45) : 0;
    r.tilt = lerp(r.tilt, goal, 1 - Math.pow(0.004, dt));
    f.tilt = Math.abs(r.tilt - goal) < 0.002 ? goal : r.tilt;
    last = f.char;
    out = f;
    // the light behind him, so the silhouette reads on the dark title
    if (spot) {
      const cx = o.x - r.p.hero.x;
      const cy = o.y - 12 * s - r.p.hero.y;
      setAttr(spot, 'style', `transform: translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0) scale(${(s / 1.85).toFixed(2)})`);
    }
    return f;
  };

  return {
    want,
    pending,
    begin,
    step,
    stop,
    /** Scrolled since it began (the page wants him back). */
    scrolled: (sy: number) => !!run && Math.abs(sy - run.sy) > 2,
    get active() {
      return !!run;
    },
    get frame() {
      return out;
    },
    /** dev: the program playing and when it started (performance.now ms). */
    get info() {
      return run ? { prog: run.p.prog, t0: run.t0 } : null;
    },
    /** Where he last was (screen), for handing him back to the stage. */
    get last() {
      return last;
    },
    /** He feels like showing off: the stunt may play next time he's free on the hero ground. */
    invite() {
      if (!played || run) return;
      played = false;
      ready = null;
      retryAt = 0;
      wake();
    },
    /** dev: play again (with this seed) next time he's free on the hero ground. */
    force(seed?: number) {
      played = false;
      ready = null;
      forced = seed ?? null;
      wake();
    },
    destroy() {
      mo.disconnect();
      stop();
    },
  };
}
export type Stunt = ReturnType<typeof createStunt>;
