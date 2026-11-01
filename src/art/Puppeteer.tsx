import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character, STRIDE, type CharacterHandle, type Pose } from './Character';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { onLayout, setAttr, ticker } from './ticker';
import { WALK, clampTo, lookAngle, perchExtent, settledWalk, stepWalk, type Extent, type WalkState } from './walk';

/**
 * A ceiling-rail arm that carries the character around the page.
 * Perches = elements with [data-perch] (fraction along their top edge where he's set down).
 * Optional [data-perch-span] = px half-width around that point he may walk (default: the
 * element's width minus a margin). A plate only becomes a perch once it's printed
 * ([data-printed="1"]). He's set down on whichever perch sits nearest the reading line;
 * between perches the claw grabs him by the collar.
 *
 * On a perch he walks toward the pointer's x (mouse: live; touch: last tap), within the perch.
 * His local state (`walk`, `turn`, `tilt`, `amt`) is kept apart from the carry state so the
 * phase-3 state machine can wrap it.
 *
 * Perch rects are cached in document space (re-measured on layout changes only), so a frame
 * does no layout reads. The loop sleeps once he's perched and settled; scroll, layout,
 * print-state changes and pointer input wake it.
 */
const TRANSIT = 1.25; // s
const FEET = 26; // character units from origin to feet
const COLLAR = { x: -4, y: -12 };
const MARGIN = 36; // px kept clear at each end of a perch
const LOOK = 1.8; // s he keeps glancing at the pointer after it last moved
const HOVER = 70; // px from him where the idle claw hangs

type State = {
  char: Pt;
  from: Pt;
  idx: number; // active perch index, -1 = held in the claw
  transitStart: number; // -1 when perched
  swing: number;
  swingV: number;
  baseX: number;
  hoverX: number;
  bend: 1 | -1;
  facing: 1 | -1;
  // ---- local behaviour on a perch ----
  walk: WalkState; // x = offset from the perch's left edge
  anchored: boolean; // still where he was set down (follows the perch point if layout shifts)
  amt: number; // gait amplitude 0..1
  turn: number; // eased facing, -1..1
  tilt: number; // head tilt, rad
  squash: number;
};
type Perch = { el: HTMLElement; left: number; top: number; width: number; f: number; ext: Extent };
type Pointer = { x: number; y: number; t: number };

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
    let cache: Perch[] = [];
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
        return { el, left: r.left + sx, top: r.top + sy, width: r.width, f, ext };
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
        };
      });
      if (!ps.length) return false; // layout / print-state changes wake us when perches appear
      const line = vp.h * 0.5;
      let best = -1;
      let bestD = Infinity;
      ps.forEach((p, i) => {
        if (!p.ok || !p.visible) return;
        const d = Math.abs(p.top - line);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });

      if (!st.current) {
        const first = ps[0].pt;
        st.current = {
          char: { x: first.x, y: -120 },
          from: { x: first.x, y: -120 },
          idx: 0,
          transitStart: reduce ? -1 : now,
          swing: 0,
          swingV: 0,
          baseX: first.x,
          hoverX: first.x + HOVER,
          bend: -1,
          facing: 1,
          walk: { x: clampTo(cache[0].width * cache[0].f, cache[0].ext), v: 0, phase: 0, walking: false },
          anchored: true,
          amt: 0,
          turn: 1,
          tilt: 0,
          squash: 0,
        };
      }
      const s = st.current;
      const cur = s.idx >= 0 ? ps[s.idx] : undefined;
      const curOk = !!cur && cur.ok && cur.visible;
      const heldPt = { x: vp.w * (vp.w < 700 ? 0.78 : 0.86), y: vp.h * 0.34 };

      if (s.transitStart < 0) {
        let next = s.idx;
        if (best >= 0 && best !== s.idx) {
          const curD = curOk ? Math.abs(cur!.top - line) : Infinity;
          if (bestD + 80 < curD) next = best;
        } else if (best < 0 && !curOk && s.idx !== -1) next = -1; // nothing to stand on: pick him up
        if (next !== s.idx) {
          s.from = { ...s.char };
          s.idx = next;
          s.transitStart = reduce ? -1 : now;
          s.walk = { ...s.walk, v: 0, walking: false };
          if (reduce && next >= 0) {
            s.walk.x = clampTo(cache[next].width * cache[next].f, cache[next].ext);
            s.anchored = true;
          }
        }
      }

      if (s.idx === -1) {
        heldPt.x += Math.sin(now / 1400) * 18;
        heldPt.y += Math.cos(now / 1100) * 10;
      }
      const p = ptr.current;
      const perched = s.idx >= 0 && s.transitStart < 0;
      // walk toward the pointer along the perch (reduced motion: stay put)
      if (perched) {
        const perch = cache[s.idx];
        const goal = p && !reduce ? p.x - ps[s.idx].left : s.walk.x;
        if (!reduce) {
          const prevX = s.walk.x;
          s.walk = stepWalk(s.walk, goal, dt, perch.ext, cfg);
          if (s.walk.x !== prevX) s.anchored = false;
        }
      }
      const target = s.idx < 0 ? heldPt : perched ? { x: ps[s.idx].left + s.walk.x, y: ps[s.idx].pt.y } : ps[s.idx].pt;
      const prevX = s.char.x;
      let k = 1;
      if (s.transitStart >= 0) {
        k = clamp((now - s.transitStart) / 1000 / TRANSIT);
        const e = easeInOut(k);
        const lift = Math.min(s.from.y, target.y) - Math.min(220, vp.h * 0.25);
        // quadratic arc from → peak → target (target tracks scroll live)
        const mx = (s.from.x + target.x) / 2;
        s.char = {
          x: (1 - e) * (1 - e) * s.from.x + 2 * (1 - e) * e * mx + e * e * target.x,
          y: (1 - e) * (1 - e) * s.from.y + 2 * (1 - e) * e * lift + e * e * target.y,
        };
        if (k >= 1) {
          s.transitStart = -1;
          s.squash = 0.12;
          // walking resumes from where he lands
          if (s.idx >= 0) {
            s.walk = { x: clampTo(cache[s.idx].width * cache[s.idx].f, cache[s.idx].ext), v: 0, phase: s.walk.phase, walking: false };
            s.anchored = true;
          }
        }
      } else {
        s.char = { ...target };
      }

      // pendulum swing while carried, settles when perched
      const carried = s.transitStart >= 0 || s.idx === -1;
      const vx = (s.char.x - prevX) / Math.max(dt, 0.001);
      const targetSwing = carried ? clamp(-vx * 0.0009, -0.55, 0.55) : 0;
      s.swingV += ((targetSwing - s.swing) * 40 - s.swingV * 6) * dt;
      s.swing += s.swingV * dt;
      s.squash = Math.max(0, s.squash - dt * 0.6);

      // facing: direction of travel while moving; otherwise toward the pointer (or the page centre)
      if (carried) {
        if (Math.abs(vx) > 30) s.facing = vx > 0 ? 1 : -1;
      } else if (Math.abs(s.walk.v) > 2) s.facing = s.walk.v > 0 ? 1 : -1;
      else if (p) {
        if (Math.abs(p.x - s.char.x) > 28) s.facing = p.x > s.char.x ? 1 : -1;
      } else s.facing = s.char.x < vp.w / 2 ? 1 : -1;
      const turnStep = dt * 9; // ~0.2 s for a full about-face, edge-on halfway like a paper cut-out
      s.turn = reduce ? s.facing : s.turn + clamp(s.facing - s.turn, -turnStep, turnStep);

      // gait amplitude follows speed; eases out when he stops so the feet settle together
      const amtGoal = perched ? clamp(Math.abs(s.walk.v) / (cfg.vmax * 0.35)) : 0;
      s.amt = amtGoal >= s.amt ? amtGoal : Math.max(amtGoal, s.amt - dt * 4);

      // a glance at the pointer for a moment after it moves, while he stands still
      const looking = perched && !reduce && !!p && !s.walk.walking && (now - p.t) / 1000 < LOOK;
      const headY = s.char.y - 28 * scale;
      const tiltGoal = looking ? lookAngle(p!.x - s.char.x, p!.y - headY) : 0;
      s.tilt = Math.abs(tiltGoal - s.tilt) < 0.002 ? tiltGoal : lerp(s.tilt, tiltGoal, 1 - Math.pow(0.004, dt));

      // the idle claw trails behind him, its carriage easing along the rail — but on a leash around
      // its old resting spot (just past where he was set down) so it never comes to rest over the text
      // he's walking under. Narrow screens: the text spans the width, so it only leans his way.
      const rest = s.idx >= 0 ? ps[s.idx].pt.x + HOVER : s.char.x + HOVER;
      const leash = vp.w < 700 ? 30 : 220;
      const hoverGoal = carried ? s.char.x + HOVER : rest + clamp(s.char.x - HOVER * s.facing - rest, -leash, leash);
      s.hoverX = Math.abs(hoverGoal - s.hoverX) < 0.01 ? hoverGoal : lerp(s.hoverX, hoverGoal, 1 - Math.pow(0.12, dt));
      const baseGoal = carried ? s.char.x : s.hoverX - 10;
      s.baseX = lerp(s.baseX, baseGoal, 1 - Math.pow(0.02, dt));
      draw(now);

      // settled: perched and still, swing / squash / turn / head at rest, claw arrived → sleep until something changes
      const settled =
        !carried &&
        settledWalk(s.walk) &&
        s.amt === 0 &&
        s.turn === s.facing &&
        s.tilt === 0 &&
        !looking &&
        s.hoverX === hoverGoal &&
        Math.abs(s.swing) < 1e-4 &&
        Math.abs(s.swingV) < 1e-4 &&
        s.squash === 0 &&
        Math.abs(s.baseX - baseGoal) < 1e-4; // tight: a looser snap leaves the carriage visibly off by a sub-pixel
      return !settled;
    };

    const draw = (now: number) => {
      const s = st.current;
      if (!s) return;
      const held = s.idx === -1;
      const moving = s.transitStart >= 0;
      const carried = moving || held;
      const k = moving ? clamp((now - s.transitStart) / 1000 / TRANSIT) : 1;
      const collar = { x: s.char.x + COLLAR.x * s.facing * scale, y: s.char.y + COLLAR.y * scale };
      const hover = { x: s.hoverX, y: Math.max(vp.h * 0.08, s.char.y - 170) };
      // grip: closes at the start of a carry; opens at the end only if setting him down on a perch
      const gripW = held && !moving ? 1 : moving ? clamp(Math.min(k / 0.08, held ? 1 : (1 - k) / 0.08)) : 0;
      const tip = { x: lerp(hover.x, collar.x, gripW), y: lerp(hover.y, collar.y, gripW) };
      const t = vp.w < 700 ? 12 : 20;
      const base = { x: s.baseX, y: -t * 2 };
      // elbow side flips only once the tip is well past the carriage (no elbow pop as he walks)
      if (tip.x > base.x + 40) s.bend = -1;
      else if (tip.x < base.x - 40) s.bend = 1;
      const pose: Pose = { swing: 0, dangle: carried ? 1 : 0, facing: s.turn, squash: s.squash, phase: s.walk.phase, walk: s.amt, tilt: s.tilt };
      // character pivots on the collar while carried
      setAttr(tiltRef.current, 'transform', carried ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : null);
      charRef.current?.set(s.char.x, s.char.y, scale, pose);
      armRef.current?.set({ base, tip, bend: s.bend, grip: gripW });
    };

    const loop = ticker.loop(frame);
    const wake = () => loop.wake();
    const offLayout = onLayout(() => {
      dirty = true;
      wake();
    });
    const mo = new MutationObserver(wake);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-printed'] });

    // pointer: mouse/pen follow live; touch follows the last tap (a short press that didn't scroll)
    let down: { x: number; y: number; t: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      ptr.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !down) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 600;
      down = null;
      if (!tap) return;
      ptr.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      wake();
    };
    const onCancel = () => void (down = null);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('scroll', wake, { passive: true });
    draw(performance.now());
    wake();
    return () => {
      loop.stop();
      offLayout();
      mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('scroll', wake);
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
