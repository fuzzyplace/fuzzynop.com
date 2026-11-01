import { useReducedMotion } from './reducedMotion';
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { armAt, groupAt, groupLines, memberOffset, paceFor, planAssembly, POST, sheetAt, union, type Box, type GroupIn, type Plan } from './assembly';
import { cutLayout, hashSeed, tornPath } from './cutout';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, type Pt } from './geometry';
import { docTop, measure, onLayout, setAttr, ticker, view, whenIdle } from './ticker';
import { useSize } from './useSize';

/**
 * A paper-cut content plate that shadowy arms assemble as it scrolls into view (choreography in
 * assembly.ts): two claws (one on phones) hanging from a ceiling rail carry the torn sheet in, lay
 * it down, and it flutters into its tilt while its backing layers fan out; then they place the words
 * (`data-asm` units, see `Words` and Chapter.tsx) into it one group at a time.
 *
 * Triggered, not scrubbed: it starts when the plate's top reaches 88% of the viewport and plays on
 * its own clock (~1.5–2.6 s), which runs faster if you scroll on before it's done (paceFor), so it's
 * together by the time its top is mid-screen. A plate that's already high on screen (or above it)
 * when first seen is shown assembled at once (deep links, reloads, scrolling back up).
 *
 * Text is real DOM text throughout; only opacity and transforms of wrapper spans animate, and they
 * keep their layout position (no layout shift). Reduced motion: assembled, arm parked, nothing moves.
 *
 * Contracts for the character: data-perch; data-printed ('0' until assembled and the arms have
 * left, then '1'); data-printing ('1' while the arms place things) and data-arm ("baseX baseY tipX
 * tipY", px from the plate's top-left, the plate-side arm) while an arm moves, including its swing
 * back up to its park spot. Probe anchors (targets.ts): the two torn top corners (lift), the top
 * edge (peek), the parked arm's tip (twitch); they come before the plate in the DOM so the plate and
 * arm answer through sibling selectors.
 */
const OVER = 240; // space above the plate the arms work in
const SIDE = 44; // gutter either side of the overlay
const TRIGGER = 0.88; // starts when the plate top is this far down the viewport
const AT_ONCE = 0.45; // first seen higher than this (or above the viewport): shown assembled
const AT_ONCE_FIRST = 0.6; // ...when the stage loads: a plate mostly on screen is shown assembled
const NEAR = 1.5; // viewports: a plate this close to the screen gets its full art at once
const TWO_ARMS = 480; // plate px: two arms from here up (desktop, tablets); phones get one, fewer units, quicker
// dev only: `?asmSlow=3` plays the assembly 3× slower (for frame strips); the plate's clock is on data-asm-t
const SLOW = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(window.location.search).get('asmSlow')) || 1) : 1;

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
type Run = { plan: Plan; groups: Group[]; t: number; drawn: Set<number>; landed: Set<number> } | null;

const LEAVES = '.asm-w, [data-asm="unit"], [data-asm="place"]';

export function PrintedPlate({ id, side, tone = 'paper', perch = side === 'right' ? 0.18 : 0.82, seed, className = '', children }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sheetEl = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const layerEls = useRef<(HTMLDivElement | null)[]>([]);
  const armG = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const armRef = [useRef<ArmHandle>(null), useRef<ArmHandle>(null)];
  const { w, h } = useSize(ref);
  const reduce = useReducedMotion();
  const geo = useRef({ top: 0, height: 0, vh: 1 });
  const ready = useRef(false); // geo measured at least once
  const seen = useRef(false); // the first trigger check has run
  const sized = useRef(''); // the w×h a measurement has been queued for
  const phase = useRef<'wait' | 'run' | 'done'>('wait');
  const run = useRef<Run>(null);
  // The plate's art (torn cut-out paths, the arms overlay) is built lazily: when the main thread is
  // idle after the first paint, one plate per idle period, or at once (before the frame paints) when
  // the plate comes near the screen. Until then it's unassembled (hidden) below the fold.
  const [live, setLive] = useState(false);
  const wake = useRef<(() => void) | null>(null);

  const remeasure = () => {
    const el = ref.current;
    if (!el) return;
    geo.current = { top: docTop(el), height: el.clientHeight, vh: document.documentElement.clientHeight };
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
      const st = el.style;
      if (st.opacity || st.translate || st.rotate || st.scale) {
        st.opacity = st.translate = st.rotate = st.scale = '';
      }
    });
  };

  /** Assembled: no inline animation state left, arms parked / gone, perch available. */
  const finish = () => {
    phase.current = 'done';
    run.current = null;
    clearUnits();
    const sh = sheetEl.current;
    if (sh) sh.style.transform = sh.style.opacity = sh.style.transformOrigin = '';
    layerEls.current.forEach((el, i) => el && (el.style.transform = g.current.layerRest[i]));
    ref.current?.style.removeProperty('--plate-lift');
    const o = outer.current;
    setAttr(o, 'data-asm-state', null);
    setAttr(o, 'data-printing', null);
    setAttr(o, 'data-arm', null);
    setAttr(o, 'data-printed', '1');
    parked();
  };

  /** Measure the units (read phase) and plan the choreography. */
  const plan = (): Run => {
    const f = face.current;
    const plate = ref.current;
    if (!f || !plate) return null;
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
    const units = (els: Iterable<HTMLElement | SVGElement>) => [...els].flatMap((el) => {
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
    return { plan: p, groups, t: 0, drawn: new Set(), landed: new Set() };
  };

  /** One frame of the assembly at the run's clock. */
  const render = (r: NonNullable<Run>) => {
    const { plan: p, groups, t: now } = r;
    const o = outer.current;
    // the sheet
    const s = sheetAt(p.sheet, now);
    const sh = sheetEl.current;
    if (sh) {
      sh.style.transformOrigin = `${p.sheet.origin.x}px ${p.sheet.origin.y}px`;
      sh.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) perspective(1400px) rotate(${s.rot.toFixed(2)}deg) rotateX(${s.rx.toFixed(2)}deg) scale(${s.scale.toFixed(4)})`;
      sh.style.opacity = s.opacity < 1 ? s.opacity.toFixed(3) : '';
    }
    ref.current?.style.setProperty('--plate-lift', s.lift.toFixed(3));
    layout.layers.forEach((ly, i) => {
      const el = layerEls.current[i];
      const k = s.fan[i];
      if (el) el.style.transform = `translate(${(ly.dx * k).toFixed(1)}px, ${(ly.dy * k).toFixed(1)}px) rotate(${(ly.rot * k).toFixed(2)}deg)`;
    });
    // the words
    groups.forEach((gr, i) => {
      if (r.landed.has(i)) return;
      const q = groupAt(p.groups[i], now);
      if (!q) return;
      const settled = q.opacity >= 1 && q.dx === 0 && q.dy === 0 && q.rot === 0;
      for (const m of gr.members) {
        const st = m.el.style;
        if (settled) {
          st.translate = st.rotate = st.scale = '';
          st.opacity = '1';
          continue;
        }
        const off = memberOffset(gr.box, m.box, q);
        st.translate = `${off.x.toFixed(1)}px ${off.y.toFixed(1)}px`;
        st.rotate = `${q.rot.toFixed(2)}deg`;
        st.scale = q.scale.toFixed(4);
        st.opacity = q.opacity.toFixed(3);
      }
      if (settled) r.landed.add(i);
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

  const begin = () => {
    phase.current = 'run';
    setAttr(outer.current, 'data-asm-state', 'run'); // words become inline-blocks (same layout) so they can move
    measure(() => {
      if (phase.current !== 'run') return;
      run.current = plan();
      if (!run.current) finish();
      wake.current?.();
    });
  };

  // every render (mount, resize): set the resting state before paint; a new size queues a re-measure
  useLayoutEffect(() => {
    const key = `${w}x${h}`;
    if (sized.current !== key) {
      sized.current = key;
      if (phase.current === 'run') finish(); // resized mid-assembly: just show it
      measure(() => {
        remeasure();
        wake.current?.();
      });
    }
    if (reduce || phase.current === 'done') {
      if (phase.current !== 'done') finish();
      else parked();
      return;
    }
    if (phase.current === 'wait') {
      setAttr(outer.current, 'data-printed', '0');
      setAttr(outer.current, 'data-asm-state', 'wait');
      setAttr(armG[0].current, 'display', 'none');
      setAttr(armG[1].current, 'display', 'none');
    }
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
      const { top, height } = geo.current;
      const v = view();
      if (top < v.sy + v.h * (1 + NEAR) && top + height > v.sy - v.h * NEAR) go(true); // committed before this frame paints
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

  // the trigger + the assembly clock: one ticker loop, awake only while it plays
  const liveRef = useRef(live);
  liveRef.current = live && w > 0;
  useEffect(() => {
    if (reduce) return;
    const loop = ticker.loop((_, dt) => {
      if (!ready.current || phase.current === 'done') return false;
      const { top, height, vh } = geo.current;
      const v = view();
      const topFrac = (top - v.sy) / vh;
      if (phase.current === 'wait') {
        const first = !seen.current;
        seen.current = true;
        if (top - v.sy >= TRIGGER * vh) return false; // not yet
        if (topFrac < (first ? AT_ONCE_FIRST : AT_ONCE)) {
          finish(); // already up the screen (or past it): there's no time to watch it built
          return false;
        }
        if (!liveRef.current) return false; // its art is committed before the next frame (near check), which wakes us
        begin();
        return true;
      }
      const r = run.current;
      if (!r) return true; // measuring: next frame
      if (top + height < v.sy || top > v.sy + 2.5 * vh) {
        finish(); // scrolled well away: done off screen
        return false;
      }
      r.t += (dt * paceFor(topFrac)) / SLOW;
      if (import.meta.env.DEV) setAttr(outer.current, 'data-asm-t', r.t.toFixed(2));
      if (r.t >= r.plan.end) {
        finish();
        return false;
      }
      render(r);
      return true;
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
  }, [reduce]);

  // once the art is built, check the trigger again (it may have been waiting on it)
  useEffect(() => {
    if (live && w > 0) wake.current?.();
  }, [live, w]);

  return (
    <div
      ref={outer}
      id={id}
      className={`relative ${className}`}
      data-perch={perch}
      data-poke-host=""
      onFocus={() => {
        if (phase.current !== 'done') finish();
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
          <g ref={armG[1]} display="none">
            <MechArm ref={armRef[1]} l1={l} l2={l} t={t * 0.9} tool="claw" toolLen={toolLen * 0.92} tether />
          </g>
          <g ref={armG[0]} className="plate-arm" style={{ transformOrigin: `${parkBase.x}px ${parkBase.y}px` }}>
            <MechArm ref={armRef[0]} l1={l} l2={l} t={t} tool="claw" toolLen={toolLen} rail={{ x1: SIDE - 22, x2: SIDE + w + 22 }} tether />
          </g>
        </svg>
      )}
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
