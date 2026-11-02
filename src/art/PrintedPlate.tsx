import { useReducedMotion } from './reducedMotion';
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { armAt, follow, FOLLOW, rateFor, groupAt, groupLines, memberOffset, planAssembly, POST, puffAt, scrollKeys, sheetAt, snapBeat, timeAtScroll, union, type Box, type GroupIn, type Keys, type Plan } from './assembly';
import { cutLayout, hashSeed, tornPath } from './cutout';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, type Pt } from './geometry';
import { docTop, measure, onLayout, setAttr, ticker, view, whenIdle } from './ticker';
import { useSize } from './useSize';

/**
 * A paper-cut content plate that shadowy arms assemble as you scroll through it (choreography in
 * assembly.ts): two claws (one on phones) hanging from a ceiling rail carry the torn sheet in, it
 * lands with a soft slap and a small ink puff, then they place the words (`data-asm` units, see
 * `Words` and Chapter.tsx) one group at a time.
 *
 * v2.7, pinned and scrubbed: the plate sits in a taller track (`.plate-track`, a spacer of about
 * one viewport under it, `--pin` in global.css) and sticks (native `position: sticky`; scrolling is
 * never intercepted or slowed) while you scroll through it. Scroll position picks a time on the
 * assembly timeline (`scrollKeys`); the shown time follows it on a damped spring with a speed limit
 * (`follow`), so pieces glide however jumpy the wheel is. Stop scrolling and it settles on the
 * nearest rest beat ahead of you (an arm holding the next piece in the air), never half-placed.
 * Scroll back up and it runs backwards. A tall plate (taller than the viewport) pins with its
 * bottom in view and places its top while it scrolls in.
 *
 * Text is real DOM text throughout; only opacity and transforms of wrapper spans animate, and they
 * keep their layout position (no layout shift). Reduced motion: no pin, assembled, arm parked,
 * nothing moves. Keyboard focus inside completes it at once; in-page jumps (nav links, hash) skip
 * the animation (the plates jumped over snap to where the scroll puts them).
 *
 * Contracts for the character: data-perch; data-printed ('1' only when assembled, the arms have
 * left and the plate isn't pinned, so its document position is fixed; '0' otherwise, including
 * while it comes apart on the way back up); data-pinned ('1' while stuck: it moves in document
 * space); data-assembled ('1' whenever it's whole and the arms are gone, pinned or not: the
 * character stands on pinned plates, reading their live position; '0' from the moment the scroll
 * asks for it to come apart); data-sheet ('1' once the sheet is down, words may still be arriving:
 * he may stand on its top edge, never inside; '0' from the moment the scroll asks the sheet to lift
 * again); data-printing ('1' while pieces are being placed) and data-arm ("baseX baseY tipX tipY",
 * px from the plate's top-left, the plate-side arm) while that arm moves, including its swing back
 * to park. Probe anchors (targets.ts): the two torn top corners (lift), the top edge (peek), the
 * parked arm's tip (twitch); they come before the plate in the DOM so the plate and arm answer
 * through sibling selectors.
 */
const OVER = 240; // space above the plate the arms work in
const SIDE = 44; // gutter either side of the overlay
const NEAR = 1.5; // viewports: a plate this close to the screen gets its full art at once
const TWO_ARMS = 480; // plate px: two arms from here up (desktop, tablets); phones get one, fewer units
const TOP = 88; // a pinned plate sits at least this far down (clear of the header) ...
const BOTTOM = 24; // ... and its bottom at least this far above the viewport's
const IDLE = 0.16; // s without scrolling: settle on a rest beat
const SCROLL_PAD = 74; // html scroll-padding-top (72) + 2: an anchor jump lands just past the pin
const START = 0.95; // the sheet starts in when the plate top is this far down the viewport
const READY = 0.75; // a piece is placed once its slot's bottom is this far up the viewport (only before the pin)
/**
 * v2.9: a plate that fits sticks low enough for the character to stand on its top edge while it's
 * pinned (his whole height + the header's clearance above it: 64 + 12 + 70 units x his scale, plus
 * a few px), when the viewport has the room; otherwise as before.
 */
const ROOM = (vw: number) => (vw < 700 ? 172 : 212);
/** The sheet counts as down (data-sheet="1", he may stand on its top edge) this far into its settle. */
const SHEET_DOWN = 0.6;

/** In-page jumps (nav links, hash changes): plates show where the scroll lands without playing. */
let jumpUntil = 0;
let jumpWired = false;
const wireJumps = () => {
  if (jumpWired) return;
  jumpWired = true;
  const jump = () => void (jumpUntil = performance.now() + 1600);
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('a[href^="#"]')) jump();
  });
  window.addEventListener('hashchange', jump);
};

type Props = {
  id?: string;
  side: 'left' | 'right'; // which side the plate's arm lives on
  tone?: 'paper' | 'ink';
  perch?: number; // 0..1 where the character stands on the top edge
  seed?: number; // torn-edge seed; defaults to a hash of id
  className?: string;
  children: ReactNode;
};

type Unit = { el: HTMLElement | SVGElement; box: Box };
type Group = { members: Unit[]; box: Box };
type Run = { plan: Plan; groups: Group[]; key: string };

const LEAVES = '.asm-w, [data-asm="unit"], [data-asm="place"]';

/** Where a pinned plate sticks: a little above centre (with room above it for him) if it fits, else with its bottom in view. */
const stickFor = (vh: number, H: number, room: number) => (H + TOP + BOTTOM <= vh ? Math.min(vh - H - BOTTOM, Math.max(TOP, room, (vh - H) * 0.42)) : vh - H - BOTTOM);

export function PrintedPlate({ id, side, tone = 'paper', perch = side === 'right' ? 0.18 : 0.82, seed, className = '', children }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sheetEl = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const layerEls = useRef<(HTMLDivElement | null)[]>([]);
  const armG = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const armRef = [useRef<ArmHandle>(null), useRef<ArmHandle>(null)];
  const puffG = useRef<SVGGElement>(null);
  const puffEls = useRef<(SVGEllipseElement | null)[]>([]);
  const { w, h } = useSize(ref);
  const reduce = useReducedMotion();
  const geo = useRef({ top: 0, trackH: 0, H: 0, vh: 1, vw: 1 });
  const ready = useRef(false); // geo measured at least once
  const run = useRef<Run | null>(null);
  const keys = useRef<{ k: Keys; key: string } | null>(null);
  const st = useRef({ t: 0, v: 0 });
  const shown = useRef<{ t: number; state: 'wait' | 'run' | 'done' | '' }>({ t: NaN, state: '' });
  const groupKey = useRef<string[]>([]); // per group: last write ('h' hidden, 'p' placed, 'm' moving)
  const ctl = useRef({ lastSy: NaN, dir: 1 as 1 | -1, moved: 0, held: NaN, force: false, fresh: true });
  // The plate's art (torn cut-out paths, the arms overlay) is built lazily: when the main thread is
  // idle after the first paint, one plate per idle period, or at once (before the frame paints) when
  // the plate comes near the screen. Until then it's unassembled (hidden) below the fold.
  const [live, setLive] = useState(false);
  const wake = useRef<(() => void) | null>(null);

  const remeasure = () => {
    const tr = track.current;
    const o = outer.current;
    if (!tr || !o) return;
    geo.current = { top: docTop(tr), trackH: tr.offsetHeight, H: o.offsetHeight, vh: document.documentElement.clientHeight, vw: document.documentElement.clientWidth };
    ready.current = true;
  };

  // ---- static geometry (overlay space: plate origin at SIDE, OVER) ----
  // Two arms on a plate wide enough for them (desktop, tablets), one on phones. Each arm's shoulder
  // rides a post just outside its side of the plate (from the ceiling rail down), so nothing but the
  // arm itself ever crosses the copy, and it's long enough to reach its share of the plate.
  const two = w >= TWO_ARMS;
  const t = Math.min(24, Math.max(14, w * 0.03));
  const toolLen = t * 2.8;
  const l = clamp(((two ? w * 0.55 : w) + 40 - toolLen) / 2, 144, 240);
  const drop = l * 0.75; // shoulder this far above the claw
  const reach = Math.sqrt(Math.max(0, (1.95 * l) ** 2 - (drop - toolLen) ** 2)) * 0.95;
  const railY = OVER * 0.1;
  const postX = (s: 1 | -1) => (s === 1 ? SIDE + w + POST : SIDE - POST);
  const dir = side === 'right' ? 1 : -1;
  // arm 0 parks above its top corner, off the text: its base (top of its post) pivots the twitch, its tip is what he pokes
  const park = { x: side === 'right' ? SIDE + w - 70 : SIDE + 70, y: railY + 144 * 1.15 };
  const parkBase = { x: postX(dir), y: railY };

  // torn-paper cut-out: seeded per plate, regenerated only when the plate resizes
  const autoId = useId();
  const s0 = seed ?? hashSeed(id ?? `${autoId}-${side}-${tone}`);
  const layout = useMemo(() => cutLayout(s0), [s0]);
  const cut = useMemo(() => {
    const path = (sd: number) => (live && w > 0 && h > 0 ? `path("${tornPath(w, h, sd)}")` : undefined);
    return { face: path(s0), layers: layout.layers.map((ly) => path(ly.seed)) };
  }, [live, w, h, s0, layout]);
  const layerTone = tone === 'paper' ? ['bg-gray-600', 'bg-ink'] : ['bg-gray-700', 'bg-gray-400'];
  const layerRest = layout.layers.map((ly) => `translate(${ly.dx.toFixed(1)}px, ${ly.dy.toFixed(1)}px) rotate(${ly.rot.toFixed(2)}deg)`);

  // ---- drawing (all writes; reads happen in the ticker's read phase) ----
  const g = useRef({ w, h, two, reach, drop, railY, park, parkBase, dir, layerRest, postX });
  g.current = { w, h, two, reach, drop, railY, park, parkBase, dir, layerRest, postX };

  /** Pose an arm (plate-space tip): its shoulder slides down its post to stay a little above the claw. */
  const poseArm = (i: number, tip: Pt, grip: number, armSide: 1 | -1) => {
    const { h, drop, railY, postX } = g.current;
    const T = { x: tip.x + SIDE, y: tip.y + OVER };
    const base = { x: postX(armSide), y: clamp(T.y - drop, railY, OVER + h) };
    armRef[i].current?.set({ base, tip: T, bend: armSide === 1 ? -1 : 1, grip, railY });
    return base;
  };
  const parked = () => {
    const { park, parkBase, railY } = g.current;
    setAttr(armG[0].current, 'display', null);
    setAttr(armG[0].current, 'opacity', null);
    setAttr(armG[1].current, 'display', 'none');
    armRef[0].current?.set({ base: parkBase, tip: park, bend: g.current.dir === 1 ? -1 : 1, grip: 0, railY });
  };

  const clearUnits = () => {
    face.current?.querySelectorAll<HTMLElement | SVGElement>(LEAVES).forEach((el) => {
      const s = el.style;
      if (s.opacity || s.translate || s.rotate || s.scale) s.opacity = s.translate = s.rotate = s.scale = '';
      if (s.getPropertyValue('--asm-lift')) s.removeProperty('--asm-lift');
    });
    groupKey.current = [];
  };
  const clearSheet = () => {
    const sh = sheetEl.current;
    if (sh) sh.style.transform = sh.style.opacity = sh.style.transformOrigin = '';
    layerEls.current.forEach((el, i) => el && (el.style.transform = g.current.layerRest[i]));
    ref.current?.style.removeProperty('--plate-lift');
    setAttr(puffG.current, 'display', 'none');
  };

  /** Assembled: no inline animation state left, arms parked / gone. (data-printed follows the pin, see `step`.) */
  const finish = () => {
    if (shown.current.state === 'done') return;
    shown.current.state = 'done';
    clearUnits();
    clearSheet();
    const o = outer.current;
    setAttr(o, 'data-asm-state', null);
    setAttr(o, 'data-printing', null);
    setAttr(o, 'data-arm', null);
    parked();
  };
  /** Not started (or fully taken apart again): nothing shown, no arms. */
  const empty = () => {
    if (shown.current.state === 'wait') return;
    shown.current.state = 'wait';
    clearUnits();
    clearSheet();
    const o = outer.current;
    setAttr(o, 'data-asm-state', 'wait');
    setAttr(o, 'data-printing', null);
    setAttr(o, 'data-arm', null);
    setAttr(armG[0].current, 'display', 'none');
    setAttr(armG[1].current, 'display', 'none');
  };

  /** Measure the units (read phase) and plan the choreography. Transforms are cleared first so the boxes are layout boxes. */
  const plan = (key: string): Run | null => {
    const f = face.current;
    const plate = ref.current;
    if (!f || !plate) return null;
    const sh = sheetEl.current;
    if (sh) sh.style.transform = '';
    f.querySelectorAll<HTMLElement | SVGElement>(LEAVES).forEach((el) => {
      el.style.translate = el.style.rotate = el.style.scale = '';
    });
    shown.current.t = NaN; // repaint after
    groupKey.current = [];
    const { w, h, park, two, reach } = g.current;
    const mobile = !two;
    // layout boxes in plate px: centres from the rendered rects with the plate's tilt undone, sizes from layout
    const fr = f.getBoundingClientRect();
    const fc = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
    const a = (-layout.rot * Math.PI) / 180;
    const boxOf = (el: HTMLElement | SVGElement): Box | null => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      const bw = el instanceof HTMLElement ? el.offsetWidth : r.width;
      const bh = el instanceof HTMLElement ? el.offsetHeight : r.height;
      const vx = r.left + r.width / 2 - fc.x;
      const vy = r.top + r.height / 2 - fc.y;
      const cx = f.offsetWidth / 2 + vx * Math.cos(a) - vy * Math.sin(a);
      const cy = f.offsetHeight / 2 + vx * Math.sin(a) + vy * Math.cos(a);
      return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
    };
    const units = (els: Iterable<HTMLElement | SVGElement>) =>
      [...els].flatMap((el) => {
        const box = boxOf(el);
        return box ? [{ el, box }] : [];
      });
    const groups: Group[] = [];
    const modes: GroupIn['mode'][] = [];
    const push = (members: Unit[], mode: GroupIn['mode']) => {
      if (!members.length) return;
      groups.push({ members, box: union(members.map((m) => m.box)) });
      modes.push(mode);
    };
    const done = new Set<Element>();
    f.querySelectorAll<HTMLElement | SVGElement>('[data-asm], [data-asm-cluster]').forEach((el) => {
      if (done.has(el)) return;
      if (el.hasAttribute('data-asm-cluster')) {
        if (!mobile) return; // desktop: its parts are placed one by one
        const inner = [...el.querySelectorAll<HTMLElement | SVGElement>('[data-asm]')];
        inner.forEach((x) => done.add(x));
        push(units(inner.flatMap((x) => (x.dataset.asm === 'words' || x.dataset.asm === 'lines' ? [...x.querySelectorAll<HTMLElement>('.asm-w')] : [x]))), 'carry');
        return;
      }
      const kind = el.dataset.asm;
      if (kind === 'words') {
        const ws = units(el.querySelectorAll<HTMLElement>('.asm-w'));
        if (mobile) push(ws, 'carry');
        else ws.forEach((u) => push([u], ws.length <= 5 ? 'carry' : 'deal'));
      } else if (kind === 'lines') {
        const ws = units(el.querySelectorAll<HTMLElement>('.asm-w'));
        const lines = groupLines(ws.map((u) => u.box)).map((ix) => ix.map((i) => ws[i]));
        const per = mobile ? 2 : 1;
        for (let i = 0; i < lines.length; i += per) push(lines.slice(i, i + per).flat(), 'deal');
      } else if (kind === 'place') push(units([el]), 'carry');
      else push(units([el]), 'deal');
    });
    const p = planAssembly(
      groups.map((gr, i) => ({ box: gr.box, mode: modes[i] })),
      { w, h, side, arms: mobile ? 1 : 2, mobile, reach, seed: s0, rest: { x: park.x - SIDE, y: park.y - OVER } },
    );
    return { plan: p, groups, key };
  };

  /** One frame of the assembly at plan time `now` (0 < now < end). */
  const render = (r: Run, now: number) => {
    const { plan: p, groups } = r;
    const o = outer.current;
    if (shown.current.state !== 'run') {
      shown.current.state = 'run';
      setAttr(o, 'data-asm-state', 'run'); // words become inline-blocks (same layout) so they can move
    }
    // the sheet
    const s = sheetAt(p.sheet, now);
    const sh = sheetEl.current;
    if (sh) {
      sh.style.transformOrigin = `${p.sheet.origin.x}px ${p.sheet.origin.y}px`;
      sh.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) perspective(1400px) rotate(${s.rot.toFixed(2)}deg) rotateX(${s.rx.toFixed(2)}deg) scale(${s.sx.toFixed(4)}, ${s.sy.toFixed(4)})`;
      sh.style.opacity = s.opacity < 1 ? s.opacity.toFixed(3) : '';
    }
    ref.current?.style.setProperty('--plate-lift', s.lift.toFixed(3));
    layout.layers.forEach((ly, i) => {
      const el = layerEls.current[i];
      const k = s.fan[i];
      if (el) el.style.transform = `translate(${(ly.dx * k).toFixed(1)}px, ${(ly.dy * k).toFixed(1)}px) rotate(${(ly.rot * k).toFixed(2)}deg)`;
    });
    // the ink puff
    const puff = puffAt(p, now);
    setAttr(puffG.current, 'display', puff ? null : 'none');
    puff?.forEach((d, i) => {
      const el = puffEls.current[i];
      setAttr(el, 'transform', `translate(${(d.x + SIDE).toFixed(1)} ${(d.y + OVER).toFixed(1)}) rotate(${p.sheet.puff.drops[i].rot.toFixed(0)}) scale(${d.scale.toFixed(3)})`);
      setAttr(el, 'opacity', d.opacity.toFixed(3));
    });
    // the words
    const keyOf = groupKey.current;
    groups.forEach((gr, i) => {
      const q = groupAt(p.groups[i], now);
      const k = !q ? 'h' : q.opacity >= 1 && q.dx === 0 && q.dy === 0 && q.rot === 0 && q.sx === 1 && q.sy === 1 ? 'p' : 'm';
      if (k !== 'm' && keyOf[i] === k) return;
      keyOf[i] = k;
      for (const m of gr.members) {
        const ms = m.el.style;
        if (k === 'h' || k === 'p') {
          ms.translate = ms.rotate = ms.scale = '';
          ms.opacity = k === 'p' ? '1' : '';
          ms.removeProperty('--asm-lift');
          continue;
        }
        const off = memberOffset(gr.box, m.box, q!);
        ms.translate = `${off.x.toFixed(1)}px ${off.y.toFixed(1)}px`;
        ms.rotate = `${q!.rot.toFixed(2)}deg`;
        ms.scale = `${q!.sx.toFixed(4)} ${q!.sy.toFixed(4)}`;
        ms.opacity = q!.opacity.toFixed(3);
        ms.setProperty('--asm-lift', q!.lift.toFixed(2));
      }
    });
    // the arms
    let arm0: { base: Pt; tip: Pt } | null = null;
    p.arms.forEach((_, i) => {
      const a = armAt(p, i, now);
      const gEl = armG[i].current;
      if (a.gone) {
        setAttr(gEl, 'display', 'none');
        return;
      }
      setAttr(gEl, 'display', null);
      setAttr(gEl, 'opacity', a.fade < 1 ? a.fade.toFixed(3) : null);
      const base = poseArm(i, a.tip, a.grip, a.side);
      if (i === 0 && a.active) arm0 = { base, tip: { x: a.tip.x + SIDE, y: a.tip.y + OVER } };
    });
    const A = arm0 as { base: Pt; tip: Pt } | null;
    setAttr(o, 'data-printing', now < p.placed ? '1' : null);
    setAttr(o, 'data-arm', A ? `${(A.base.x - SIDE).toFixed(0)} ${(A.base.y - OVER).toFixed(0)} ${(A.tip.x - SIDE).toFixed(0)} ${(A.tip.y - OVER).toFixed(0)}` : null);
  };

  // every render (mount, resize): a new size queues a re-measure and a re-plan
  const sized = useRef('');
  useLayoutEffect(() => {
    const key = `${w}x${h}`;
    if (sized.current !== key) {
      sized.current = key;
      keys.current = null;
      measure(() => {
        remeasure();
        wake.current?.();
      });
    }
    if (reduce) {
      finish();
      setAttr(outer.current, 'data-printed', '1');
      setAttr(outer.current, 'data-assembled', '1');
      setAttr(outer.current, 'data-sheet', '1');
      setAttr(outer.current, 'data-pinned', null);
      outer.current?.style.removeProperty('top');
      setAttr(anchor.current, 'style', null);
      return;
    }
    if (shown.current.state === '') {
      setAttr(outer.current, 'data-printed', '0');
      setAttr(outer.current, 'data-assembled', '0');
      setAttr(outer.current, 'data-sheet', '0');
      empty();
    } else if (shown.current.state === 'done') parked();
  });

  // build the art when idle, or as soon as the plate is near the viewport (checked per scroll frame)
  useEffect(() => {
    if (live) return;
    let done = false;
    const go = (sync: boolean) => {
      if (done) return;
      done = true;
      if (sync) flushSync(() => setLive(true));
      else setLive(true);
    };
    const near = ticker.loop(() => {
      if (!ready.current) return true; // not measured yet: check again next frame
      const { top, trackH } = geo.current;
      const v = view();
      if (top < v.sy + v.h * (1 + NEAR) && top + trackH > v.sy - v.h * NEAR) go(true); // committed before this frame paints
      return false;
    });
    const check = () => near.wake();
    const offIdle = whenIdle(() => go(false));
    window.addEventListener('scroll', check, { passive: true });
    const offLayout = onLayout(check);
    check();
    return () => {
      done = true;
      near.stop();
      offIdle();
      offLayout();
      window.removeEventListener('scroll', check);
    };
  }, [live]);

  // the scroll-driven clock: one ticker loop, awake while scrolling and while the shown time catches up
  const liveRef = useRef(live);
  liveRef.current = live && w > 0;
  useEffect(() => {
    if (reduce) return;
    wireJumps();
    let planning = false;
    const loop = ticker.loop((now, dt) => {
      if (!ready.current) return false;
      const o = outer.current;
      const { top, trackH, H, vh, vw } = geo.current;
      const v = view();
      // the pin: where it sticks, where it starts and ends (document scroll px)
      const stick = stickFor(vh, H, ROOM(vw));
      const pinLen = Math.max(0, trackH - H);
      const pinStart = top - stick;
      const pinEnd = pinStart + pinLen;
      const top$ = `${stick.toFixed(0)}px`;
      if (o && o.style.top !== top$) o.style.top = top$;
      // the id lands where the plate is assembled (short plates: the scroll ends at the pin's end) or at its top (tall ones)
      setAttr(anchor.current, 'style', `top:${(stick >= TOP ? pinLen - stick + SCROLL_PAD : 0).toFixed(0)}px`);
      const pinned = pinLen > 0 && v.sy >= pinStart && v.sy < pinEnd;
      setAttr(o, 'data-pinned', pinned ? '1' : null);

      if (!liveRef.current) return false; // its art is committed before the next frame (near check), which wakes us
      const sizeKey = `${w}x${h}`;
      if (!run.current || run.current.key !== sizeKey) {
        if (!planning) {
          planning = true;
          measure(() => {
            planning = false;
            run.current = plan(sizeKey);
            keys.current = null;
            wake.current?.();
          });
        }
        return false;
      }
      const r = run.current;
      const p = r.plan;
      const geoKey = `${top}|${trackH}|${H}|${vh}|${vw}`;
      if (!keys.current || keys.current.key !== geoKey) {
        const s0 = top - vh * START;
        const sheet = Math.min(Math.max(s0 + vh * 0.3, pinStart - vh * 0.1), top - vh * 0.4); // landed by the time its top is ~40% down
        const ready = r.groups.map((gr) => top + gr.box.y + gr.box.h - vh * READY);
        keys.current = { k: scrollKeys(p, { s0, sheet, pinStart, pinEnd, ready, tall: stick < TOP }), key: geoKey };
      }
      const c = ctl.current;
      // direction + idle
      if (Number.isNaN(c.lastSy)) c.lastSy = v.sy;
      const dy = v.sy - c.lastSy;
      if (Math.abs(dy) > 0.5) {
        const d = dy > 0 ? 1 : -1;
        if (d !== c.dir) c.held = NaN;
        c.dir = d;
        c.moved = now;
        c.lastSy = v.sy;
      }
      let target = c.force ? p.end : timeAtScroll(keys.current.k, v.sy);
      const idle = (now - c.moved) / 1000 > IDLE;
      if (!c.force && target > 0 && target < p.end) {
        if (idle && Number.isNaN(c.held)) c.held = snapBeat(p.beats, target, c.dir);
        if (!Number.isNaN(c.held)) {
          if ((c.dir > 0 && target < c.held) || (c.dir < 0 && target > c.held)) target = c.held;
          else c.held = NaN;
        }
      } else c.held = NaN;

      const s = st.current;
      const off = top + trackH < v.sy - 60 || top > v.sy + v.h + 60;
      if (c.fresh || off || c.force || now < jumpUntil) {
        s.t = target; // first sight, off screen, focused, or a jump: no playback
        s.v = 0;
        c.fresh = false;
      } else follow(s, target, dt, { omega: FOLLOW.omega, maxRate: rateFor(p.end, two ? 3 : 2.6) });

      if (s.t !== shown.current.t) {
        if (import.meta.env.DEV) setAttr(o, 'data-asm-t', `${s.t.toFixed(2)}/${p.end.toFixed(2)}`);
        if (s.t <= 0) empty();
        else if (s.t >= p.end) finish();
        else render(r, s.t);
        shown.current.t = s.t;
      }
      // assembled = whole and the arms gone, pinned or not (he may stand on it); it drops the moment
      // the scroll asks for it to come apart (target below the end), a frame before anything moves
      const whole = s.t >= p.end && target >= p.end;
      setAttr(o, 'data-assembled', whole ? '1' : '0');
      // the sheet is down (words may still be arriving): its top edge is somewhere to stand; drops,
      // like data-assembled, the moment the scroll asks for the sheet to lift again
      const down = p.landed + p.sheet.settle * SHEET_DOWN;
      setAttr(o, 'data-sheet', s.t >= down && target >= down ? '1' : '0');
      setAttr(o, 'data-printed', whole && !pinned ? '1' : '0');
      // awake while catching up, or while a stop might still settle on a beat
      return s.t !== target || (!idle && target > 0 && target < p.end && !c.force);
    });
    const onWake = () => loop.wake();
    wake.current = onWake;
    const offLayout = onLayout(() => {
      remeasure();
      onWake();
    });
    window.addEventListener('scroll', onWake, { passive: true });
    if (ready.current) onWake();
    return () => {
      wake.current = null;
      loop.stop();
      offLayout();
      window.removeEventListener('scroll', onWake);
    };
  }, [reduce, w, h, two]);

  // once the art is built, check again (it may have been waiting on it)
  useEffect(() => {
    if (live && w > 0) wake.current?.();
  }, [live, w]);

  const nDrops = run.current?.plan.sheet.puff.drops.length ?? 11;
  return (
    <div ref={track} className={`plate-track relative ${className}`}>
      {id && <span ref={anchor} id={id} className="plate-target" aria-hidden="true" />}
      <div
        ref={outer}
        className="plate-pin relative"
        data-perch={perch}
        data-poke-host=""
        onFocus={() => {
          ctl.current.force = true; // keyboard inside: show it whole, now
          wake.current?.();
        }}
        onBlur={(e) => {
          if (outer.current?.contains(e.relatedTarget as Node | null)) return;
          ctl.current.force = false;
          ctl.current.fresh = true; // back to where the scroll is, without playing
          wake.current?.();
        }}
      >
        <span className="plate-anchor left-0 top-0" data-poke="lift" data-poke-reach="top" data-poke-dir="-1" aria-hidden="true" />
        <span className="plate-anchor right-0 top-0" data-poke="lift" data-poke-reach="top" data-poke-dir="1" aria-hidden="true" />
        <span className="plate-anchor plate-anchor--edge" data-poke="peek" data-poke-reach="top" aria-hidden="true" />
        {live && w > 0 && <span className="plate-anchor" style={{ left: park.x - SIDE - 12, top: park.y - OVER - 12 }} data-poke="twitch" data-poke-reach="dangle" aria-hidden="true" />}
        <div ref={ref} className="plate-shadow plate-alive" style={{ '--plate-rot': `${layout.rot.toFixed(2)}deg` } as CSSProperties}>
          <div ref={sheetEl} className="plate-sheet relative isolate">
            {layout.layers.map((_, i) => (
              <div
                key={i}
                ref={(e) => void (layerEls.current[i] = e)}
                aria-hidden="true"
                className={`plate-layer absolute inset-0 ${layerTone[i]} ${cut.layers[i] ? '' : 'plate-cut'}`}
                style={{ clipPath: cut.layers[i], zIndex: -1 - i, transform: layerRest[i] }}
              />
            ))}
            {/* the sheet's face: torn paper (or ink) behind the content, so words can be carried in over its edge */}
            <div aria-hidden="true" className={`absolute inset-0 ${tone === 'paper' ? 'plate-paper' : 'plate-ink'} ${cut.face ? '' : 'plate-cut'}`} style={{ clipPath: cut.face }} />
            <div ref={face} className={`plate-face relative ${tone === 'paper' ? 'plate-paper text-on-paper' : 'plate-ink text-on-surface'} px-7 py-10 md:px-12 md:py-14`}>
              {children}
            </div>
          </div>
        </div>

        {live && w > 0 && (
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ left: -SIDE, top: -OVER, width: w + SIDE * 2, height: h + OVER }}
            viewBox={`0 0 ${w + SIDE * 2} ${h + OVER}`}
            aria-hidden="true"
          >
            {/* ink pushed out from under the sheet as it lands */}
            <g ref={puffG} display="none">
              {Array.from({ length: nDrops }, (_, i) => (
                <ellipse key={i} ref={(e) => void (puffEls.current[i] = e)} rx={(run.current?.plan.sheet.puff.drops[i]?.r ?? 3) * (run.current?.plan.sheet.puff.drops[i]?.long ?? 1.5)} ry={run.current?.plan.sheet.puff.drops[i]?.r ?? 3} className="fill-ink" opacity="0" />
              ))}
            </g>
            <g ref={armG[1]} display="none">
              <MechArm ref={armRef[1]} l1={l} l2={l} t={t * 0.9} tool="claw" toolLen={toolLen * 0.92} tether rim={tone === 'ink'} />
            </g>
            <g ref={armG[0]} className="plate-arm" style={{ transformOrigin: `${parkBase.x}px ${parkBase.y}px` }}>
              <MechArm ref={armRef[0]} l1={l} l2={l} t={t} tool="claw" toolLen={toolLen} rail={{ x1: SIDE - 22, x2: SIDE + w + 22 }} tether rim={tone === 'ink'} />
            </g>
          </svg>
        )}
      </div>
      <div className="plate-spacer" aria-hidden="true" />
    </div>
  );
}

/**
 * A line of copy split into words the arms can place (`.asm-w`): plain inline spans at rest (one
 * text run: wrapping, find in page and selection as before), inline-blocks only while the plate is
 * being assembled. Splits on plain spaces only, so tie()'s non-breaking pairs travel together.
 */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <Fragment key={i}>
          {i > 0 ? ' ' : ''}
          <span className="asm-w">{word}</span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * A plate title split into words the arms place (`.asm-w`) and letters (`data-plate-glyph="<plateId>:<index>"`,
 * index = the letter's position in `text`) kept for letter play. Plain inline spans at rest, so the
 * line shapes as one run (kerning, wrapping, find in page). Use inside a heading that carries the
 * full text as its accessible name (`aria-label`); these spans are aria-hidden.
 */
export function TitleGlyphs({ text, plate }: { text: string; plate: string }) {
  let i = 0;
  const words = text.split(' ').map((word) => {
    const start = i;
    i += word.length + 1;
    return { word, start };
  });
  return (
    <span aria-hidden="true">
      {words.map(({ word, start }, k) => (
        <Fragment key={k}>
          {k > 0 ? ' ' : ''}
          <span className="asm-w">
            {[...word].map((ch, j) =>
              ch === ' ' ? (
                ch
              ) : (
                <span key={j} className="plate-glyph" data-plate-glyph={`${plate}:${start + j}`}>
                  {ch}
                </span>
              ),
            )}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
