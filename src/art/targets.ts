/**
 * The page side of the character's play: what he can touch, and how it answers. DOM helpers only;
 * the decisions live in pure modules (glyphs.ts, stunt.ts, probe.ts) and the stage wires them.
 * Contract (docs/DESIGN_SYSTEM.md, "Character contracts"):
 *
 * - Title letters: `[data-glyph="line:index"]` spans in the hero h1, `data-written="1"` on the h1
 *   once the arm has written it. `setGlyph` / `setGlyphs` drive letters per frame (sag, tilt,
 *   swing...), `resetGlyphs` springs them all home, `pokeGlyph` plays a one-shot jiggle or flick.
 * - Probe targets: `[data-poke="spin|lift|peek|tug|rattle|twitch|tap"]` + `data-poke-reach`
 *   ("top" | "side" | "dangle": how he gets at it) + optional `data-poke-win` (it has a "win"
 *   response). `poke` / `pokeWin` toggle `data-poked="a|b"` (a new value restarts the CSS keyframes)
 *   with `--poke-dir` (±1, the side he's on); each target's response is CSS in global.css.
 *
 * Rules: never click or focus anything; leave a target alone while the visitor hovers or focuses it
 * (`isEngaged`); transforms only; under prefers-reduced-motion every write here is a no-op.
 * Layout reads (`queryTargets`, `measureTitle`, `titleMap`) belong in a ticker read phase.
 */
import { mapTitle, type Body, type GlyphBox, type GlyphPose, type MapOpts, type Rect, type TitleMap } from './glyphs';

export type { GlyphPose };

export type PokeKind = 'spin' | 'lift' | 'peek' | 'tug' | 'rattle' | 'twitch' | 'tap';
export type PokeReach = 'top' | 'side' | 'dangle';
export const POKE_KINDS: readonly PokeKind[] = ['spin', 'lift', 'peek', 'tug', 'rattle', 'twitch', 'tap'];
export type GlyphFx = 'jiggle' | 'flick';

export type PokeTarget = {
  el: Element;
  id: string; // stable for the element's lifetime (for cooldowns)
  kind: PokeKind; // its first declared kind
  kinds: PokeKind[];
  reach: PokeReach;
  winnable: boolean;
  rect: Rect; // document px
};

const isKind = (k: string): k is PokeKind => (POKE_KINDS as readonly string[]).includes(k);
const isReach = (r: string | null): r is PokeReach => r === 'top' || r === 'side' || r === 'dangle';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const ids = new WeakMap<Element, string>();
let nextId = 0;
const idOf = (el: Element, kind: string) => {
  let id = ids.get(el);
  if (!id) ids.set(el, (id = el.id || `${kind}-${nextId++}`));
  return id;
};

const kindsOf = (el: Element) => (el.getAttribute('data-poke') ?? '').split(/\s+/).filter(isKind);
const docRect = (r: DOMRect): Rect => ({ left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY });

/**
 * Every probe target that can answer right now (document px). Skips targets on a plate that isn't
 * whole (data-assembled), on a pinned plate (its document rect moves with the scroll, and a probe
 * plans in document px; he can still stand on it), a print arm that isn't parked, and anything with
 * no box (hidden at this width).
 */
export function queryTargets(root: ParentNode = document): PokeTarget[] {
  const out: PokeTarget[] = [];
  for (const el of root.querySelectorAll('[data-poke]')) {
    const kinds = kindsOf(el);
    if (!kinds.length || el.closest('[data-printed]:not([data-assembled="1"]), [data-pinned="1"]')) continue;
    if (kinds.includes('twitch') && el.closest('[data-arm], [data-printing]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const reach = el.getAttribute('data-poke-reach');
    out.push({ el, id: idOf(el, kinds[0]), kind: kinds[0], kinds, reach: isReach(reach) ? reach : 'top', winnable: el.hasAttribute('data-poke-win'), rect: docRect(r) });
  }
  return out;
}

/** The visitor is on it (pointer over it or focus inside it, or its plate): leave it alone. */
export function isEngaged(el: Element): boolean {
  const q = ':hover, :focus-within';
  const host = el.closest('[data-poke-host]');
  return el.matches(q) || (!!host && host.matches(q));
}

function fire(el: Element, kind: string, dir: number, win: boolean) {
  const d = String(dir < 0 ? -1 : 1);
  const style = (el as HTMLElement | SVGElement).style;
  style.setProperty('--poke-dir', d);
  // plate parts answer through their plate (a sibling), which reads the direction from the host
  (el.closest('[data-poke-host]') as HTMLElement | null)?.style.setProperty('--poke-dir', d);
  el.setAttribute('data-poked-kind', kind);
  if (win) el.setAttribute('data-poked-win', '');
  else el.removeAttribute('data-poked-win');
  el.setAttribute('data-poked', el.getAttribute('data-poked') === 'a' ? 'b' : 'a');
}

/**
 * Prod a target: it plays its response once (`kind` defaults to its first declared kind; `dir` is
 * the side he's on, -1 left / +1 right; a plate corner uses its own `data-poke-dir`). Returns false
 * (and does nothing) under reduced motion, if the visitor is engaged with it, or if it doesn't
 * take that kind. Never clicks or focuses.
 */
export function poke(el: Element, kind?: PokeKind, dir: number = 1): boolean {
  if (reduced() || !el.isConnected) return false;
  const kinds = kindsOf(el);
  const k = kind ?? kinds[0];
  if (!k || !kinds.includes(k) || isEngaged(el)) return false;
  const own = Number(el.getAttribute('data-poke-dir'));
  fire(el, k, own === 1 || own === -1 ? own : dir, false);
  return true;
}

/** A probe that wins (full trust only): the target's bigger answer, if it has one (`data-poke-win`). */
export function pokeWin(el: Element, dir: number = 1): boolean {
  if (reduced() || !el.isConnected || !el.hasAttribute('data-poke-win') || isEngaged(el)) return false;
  const k = kindsOf(el)[0];
  if (!k) return false;
  fire(el, k, dir, true);
  return true;
}

// ---- title letters ----

export const titleEl = (): HTMLElement | null => document.querySelector('#top h1');
/** The arm has written the tagline and withdrawn (the stunt may start). */
export const isTitleWritten = () => titleEl()?.getAttribute('data-written') === '1';

const glyphCache = new Map<string, HTMLElement>();
export function glyphEl(key: string): HTMLElement | null {
  const hit = glyphCache.get(key);
  if (hit?.isConnected) return hit;
  const el = document.querySelector<HTMLElement>(`[data-glyph="${CSS.escape(key)}"]`);
  if (el) glyphCache.set(key, el);
  else glyphCache.delete(key);
  return el;
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();
/** CSS transform + origin for a pose ('none' for identity). Pure. */
export function poseCss(p: GlyphPose | null): { transform: string; origin: string } {
  const x = p?.x ?? 0;
  const y = p?.y ?? 0;
  const rot = p?.rot ?? 0;
  const origin = `${f2((p?.ox ?? 0.5) * 100)}% ${f2((p?.oy ?? 1) * 100)}%`;
  const parts: string[] = [];
  if (Math.abs(x) >= 0.005 || Math.abs(y) >= 0.005) parts.push(`translate(${f2(x)}px, ${f2(y)}px)`);
  if (Math.abs(rot) >= 0.005) parts.push(`rotate(${f2(rot)}deg)`);
  return { transform: parts.length ? parts.join(' ') : 'none', origin };
}

const lastCss = new WeakMap<HTMLElement, string>();
const unblock = new WeakMap<HTMLElement, number>();
const live = new Set<HTMLElement>();
const SPRING_MS = 900; // the spring-home transition (--md-sys-motion-duration-extra-long1) plus slack

function hold(el: HTMLElement) {
  const t = unblock.get(el);
  if (t !== undefined) clearTimeout(t);
  unblock.delete(el);
  if (!el.hasAttribute('data-glyph-block')) el.setAttribute('data-glyph-block', '');
}
function release(el: HTMLElement, after: number) {
  const t = window.setTimeout(() => {
    unblock.delete(el);
    el.removeAttribute('data-glyph-block');
    el.style.transformOrigin = '';
    lastCss.delete(el);
  }, after);
  unblock.set(el, t);
}

/**
 * Set one letter's pose for this frame (by key or element). Writes only when the pose changed;
 * while driven the letter has no transition. `null` = identity (still driven). No-op under reduced
 * motion.
 */
export function setGlyph(target: string | HTMLElement, pose: GlyphPose | null): void {
  if (reduced()) return;
  const el = typeof target === 'string' ? glyphEl(target) : target;
  if (!el) return;
  const { transform, origin } = poseCss(pose);
  const key = `${transform}|${origin}`;
  if (live.has(el) && lastCss.get(el) === key) return;
  hold(el);
  if (!live.has(el)) {
    live.add(el);
    el.setAttribute('data-glyph-live', '');
  }
  lastCss.set(el, key);
  el.style.transformOrigin = origin;
  el.style.transform = transform;
}

/** Set several letters' poses (letters not named are left as they are). */
export function setGlyphs(poses: Map<string, GlyphPose> | Record<string, GlyphPose>): void {
  if (reduced()) return;
  const entries = poses instanceof Map ? poses.entries() : Object.entries(poses);
  for (const [k, p] of entries) setGlyph(k, p);
}

/** Spring every driven letter back to where it was (CSS transition), then drop it back to inline. */
export function resetGlyphs(): void {
  for (const el of live) {
    el.removeAttribute('data-glyph-live');
    el.style.transform = '';
    lastCss.delete(el);
    release(el, SPRING_MS);
  }
  live.clear();
}

/** One-shot letter response (CSS keyframes): `jiggle` (a poked letter) or `flick` (a flicked comma). */
export function pokeGlyph(key: string, fx: GlyphFx, dir: number = 1): boolean {
  if (reduced()) return false;
  const el = glyphEl(key);
  if (!el || live.has(el)) return false;
  hold(el);
  el.style.setProperty('--poke-dir', String(dir < 0 ? -1 : 1));
  el.setAttribute('data-poked-kind', fx);
  el.setAttribute('data-poked', el.getAttribute('data-poked') === 'a' ? 'b' : 'a');
  release(el, 1200); // the longest glyph keyframes (global.css) plus slack
  return true;
}

// ---- measuring the title (read phase only) ----

let canvas: CanvasRenderingContext2D | null = null;
const metricCache = new Map<string, { fa: number; a: number; d: number }>();
function metrics(font: string, ch: string) {
  const k = `${font}|${ch}`;
  let m = metricCache.get(k);
  if (!m) {
    canvas ??= document.createElement('canvas').getContext('2d');
    if (!canvas) return { fa: 0, a: 0, d: 0 };
    canvas.font = font;
    const t = canvas.measureText(ch);
    m = { fa: t.fontBoundingBoxAscent, a: t.actualBoundingBoxAscent, d: t.actualBoundingBoxDescent };
    metricCache.set(k, m);
  }
  return m;
}

/**
 * The title's letters as ink boxes (document px; see glyphs.ts GlyphBox) and the text around it he
 * must never cover (eyebrow, lede). Measure at rest: a driven letter's transform shifts its box.
 */
export function measureTitle(h1: HTMLElement | null = titleEl()): { glyphs: GlyphBox[]; obstacles: Rect[] } | null {
  if (!h1) return null;
  const cs = getComputedStyle(h1);
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const range = document.createRange();
  const glyphs: GlyphBox[] = [];
  for (const el of h1.querySelectorAll<HTMLElement>('[data-glyph]')) {
    const [line, i] = (el.dataset.glyph ?? '').split(':').map(Number);
    const ch = el.textContent ?? '';
    if (!el.firstChild || !ch) continue;
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect(); // the text's content area (font ascent + descent)
    const m = metrics(font, ch);
    const baseline = r.top + scrollY + m.fa;
    glyphs.push({ key: `${line}:${i}`, line, i, ch, left: r.left + scrollX, right: r.right + scrollX, top: baseline - m.a, bottom: baseline + m.d, baseline });
  }
  // the text itself (each line's box), not the block: the eyebrow's block runs the full width, its words don't
  const obstacles: Rect[] = [];
  for (const e of [h1.previousElementSibling, h1.nextElementSibling]) {
    if (!e) continue;
    range.selectNodeContents(e);
    const lines = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
    if (lines.length) for (const r of lines) obstacles.push(docRect(r));
    else obstacles.push(docRect(e.getBoundingClientRect()));
  }
  return { glyphs, obstacles };
}

/** measureTitle + glyphs.mapTitle in one call. `extra`: more no-go boxes (e.g. the header strip). */
export function titleMap(body: Body, extra: Rect[] = [], opts?: MapOpts): TitleMap | null {
  const m = measureTitle();
  return m ? mapTitle(m.glyphs, [...m.obstacles, ...extra], body, opts) : null;
}
