/**
 * The character as a curious explorer: what on the page is worth a look, and which thing to go to
 * next. Pure: the Puppeteer measures the scene (document px) and plans the route; this module only
 * turns the scene into points of interest and picks one.
 *
 * A point of interest (POI) is a spot on a walkable surface plus what he does when he gets there:
 * peek over a plate's edge, hop up and tap a hung hex stone, crouch over an ink splatter, watch a
 * printing arm, stand beside a heading (on the plate's top edge — never over its text), sit on a
 * ledge or a plate's end with his legs over the edge.
 */
import { clamp, type Pt } from './geometry';
import type { Action } from './poses';

export type Activity = Extract<Action, 'look' | 'peek' | 'tap' | 'crouch' | 'watch' | 'read' | 'sit'>;
export type PoiKind = 'perch' | 'ledge' | 'edge' | 'stone' | 'splat' | 'printer' | 'heading' | 'seat';
export type Poi = {
  id: string; // stable across measurements, for "been there recently"
  kind: PoiKind;
  s: number; // surface index he stands on
  x: number; // where his feet go, document px
  face: 1 | -1 | 0; // which way he faces when he gets there (0 = toward `look`, or as he arrived)
  look: Pt | null; // what his head turns to, document px
  activity: Activity;
  weight: number; // base appeal
  target?: number; // stone: the ledge (surface index) he taps
};

/** A walkable surface as the scene sees it (document px). left/right = where he may stand. */
export type SceneSurface = { left: number; right: number; y: number; bottom: number; x0: number; x1: number; ledge: boolean; plate: boolean };
export type Scene = {
  surfaces: (SceneSurface | null)[]; // null = not usable now (unprinted, off screen)
  splats: { x: number; y: number; r: number }[];
  printers: { s: number; tip: Pt }[]; // s = the printing plate's perch index
  headings: { s: number; left: number; right: number; top: number }[]; // tight text box of each heading on a plate
  view: { left: number; right: number; top: number; bottom: number }; // the viewport, document px
  reach: number; // px above his feet he can tap with a hop
  pad: number; // px he keeps from the viewport's sides
  sitOut: number; // px from his origin to the edge when he sits on it (his knees just overhang it)
};

const onScreen = (x: number, sc: Scene) => x >= sc.view.left + sc.pad && x <= sc.view.right - sc.pad;
const within = (x: number, s: SceneSurface) => clamp(x, s.left, s.right);

/** Every point of interest in the scene that he could stand at, on screen. */
export function collectPois(sc: Scene): Poi[] {
  const out: Poi[] = [];
  const S = sc.surfaces;
  const push = (p: Poi) => {
    if (onScreen(p.x, sc)) out.push(p);
  };
  S.forEach((s, i) => {
    if (!s) return;
    const mid = (s.left + s.right) / 2;
    // another perch: go and stand on it, have a look round
    push({ id: `perch:${i}`, kind: s.ledge ? 'ledge' : 'perch', s: i, x: within(mid, s), face: 0, look: null, activity: 'look', weight: s.ledge ? 1.2 : 0.7 });
    if (s.plate) {
      // the plate's ends: peek over the edge
      push({ id: `edge:${i}:l`, kind: 'edge', s: i, x: s.left, face: -1, look: { x: s.x0 - 40, y: s.y + 120 }, activity: 'peek', weight: 1 });
      push({ id: `edge:${i}:r`, kind: 'edge', s: i, x: s.right, face: 1, look: { x: s.x1 + 40, y: s.y + 120 }, activity: 'peek', weight: 1 });
    }
    // somewhere to sit: a ledge's or a plate's end, his knees at the very edge, legs over it.
    // A seat may lie just past where he walks; he shuffles out onto it as he sits down.
    if (s.ledge || s.plate) {
      const w = sc.sitOut;
      for (const dir of [-1, 1] as const) {
        const x = (dir < 0 ? s.x0 : s.x1) - dir * w;
        push({ id: `seat:${i}:${dir}`, kind: 'seat', s: i, x, face: dir, look: null, activity: 'sit', weight: s.ledge ? 1.4 : 0.8 });
      }
    }
    // a hung stone overhead: stand under it and hop up to tap it
    if (s.ledge) {
      S.forEach((b, j) => {
        if (!b || j === i) return;
        const up = b.y - s.bottom; // gap from the stone's underside down to the surface below it
        if (up < 20 || up > sc.reach) return;
        if (mid < b.left - 4 || mid > b.right + 4) return;
        push({ id: `stone:${i}`, kind: 'stone', s: j, x: within(mid, b), face: 0, look: { x: mid, y: s.bottom }, activity: 'tap', weight: 1.5, target: i });
      });
    }
  });
  // decor ink splatters: walk to the nearest spot on a surface near it, crouch over it or look at it
  sc.splats.forEach((sp, n) => {
    let bestI = -1;
    let bestD = Infinity;
    S.forEach((s, i) => {
      if (!s) return;
      const dx = Math.max(0, s.left - sp.x, sp.x - s.right);
      const d = Math.abs(s.y - sp.y) + dx * 2;
      if (d < bestD && Math.abs(s.y - sp.y) < 320 && dx < 200) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI < 0) return;
    const s = S[bestI]!;
    push({ id: `splat:${n}`, kind: 'splat', s: bestI, x: within(sp.x, s), face: 0, look: { x: sp.x, y: sp.y }, activity: sp.y > s.y + 10 ? 'crouch' : 'look', weight: 1 });
  });
  // a plate being printed: stand on a surface above / near it, a little clear of the arm, and watch
  sc.printers.forEach((pr) => {
    let bestI = -1;
    let bestD = Infinity;
    S.forEach((s, i) => {
      if (!s || i === pr.s) return;
      const d = Math.abs(s.y - pr.tip.y) + Math.max(0, s.left - pr.tip.x, pr.tip.x - s.right);
      if (d < bestD && s.y < pr.tip.y + 60) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI < 0) return;
    const s = S[bestI]!;
    let x = within(pr.tip.x, s);
    if (Math.abs(x - pr.tip.x) < 90) x = within(pr.tip.x + (pr.tip.x > (s.left + s.right) / 2 ? -90 : 90), s);
    push({ id: `printer:${pr.s}`, kind: 'printer', s: bestI, x, face: 0, look: pr.tip, activity: 'watch', weight: 1.8 });
  });
  // a heading: stand on the plate's top just past its end (above the plate's padding, not its text)
  sc.headings.forEach((h, n) => {
    const s = S[h.s];
    if (!s) return;
    const x = within(h.right + 30, s);
    push({ id: `heading:${n}`, kind: 'heading', s: h.s, x, face: x > (h.left + h.right) / 2 ? -1 : 1, look: { x: (h.left + h.right) / 2, y: h.top + 12 }, activity: 'read', weight: 0.9 });
  });
  return out;
}

export type Mood = 'explore' | 'rest';
/**
 * Pick where to go next. `cost` = seconds his route there takes, or null when he can't get there on
 * his own. Nearer, unvisited, more interesting spots win, with a little chance. `rest` only considers
 * seats; `explore` everything else. Spots he's already standing at are skipped.
 */
export function choosePoi(
  pois: Poi[],
  opt: { from: { s: number; x: number }; cost: (p: Poi) => number | null; recent: readonly string[]; rand: () => number; mood: Mood },
): Poi | null {
  let best: Poi | null = null;
  let bestScore = 0;
  for (const p of pois) {
    if ((opt.mood === 'rest') !== (p.activity === 'sit')) continue;
    if (p.s === opt.from.s && Math.abs(p.x - opt.from.x) < 30) continue;
    const c = opt.cost(p);
    if (c === null) continue;
    const seen = opt.recent.indexOf(p.id);
    const novelty = seen < 0 ? 1 : 0.08 + 0.12 * (seen / Math.max(1, opt.recent.length));
    const score = (p.weight * novelty * (0.55 + 0.9 * opt.rand())) / (1 + c / 6);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Most recent first, at most `max`. */
export const remember = (recent: readonly string[], id: string, max = 5) => [id, ...recent.filter((r) => r !== id)].slice(0, max);
