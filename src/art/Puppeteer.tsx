import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character, type CharacterHandle, type Pose } from './Character';
import { MechArm, type ArmHandle } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';
import { onLayout, setAttr, ticker } from './ticker';

/**
 * A ceiling-rail arm that carries the character around the page.
 * Perches = elements with [data-perch] (fraction along their top edge). A plate only becomes
 * a perch once it's printed ([data-printed="1"]). The character is set down on whichever
 * perch sits nearest the reading line; between perches the claw grabs him by the collar.
 *
 * Perch rects are cached in document space (re-measured on layout changes only), so a frame
 * does no layout reads. The loop sleeps once he's perched and settled; scroll, layout and
 * print-state changes wake it.
 */
const TRANSIT = 1.25; // s
const FEET = 26; // character units from origin to feet
const COLLAR = { x: -4, y: -12 };

type State = {
  char: Pt;
  from: Pt;
  idx: number; // active perch index, -1 = held in the claw
  transitStart: number; // -1 when perched
  swing: number;
  swingV: number;
  baseX: number;
  facing: 1 | -1;
  squash: number;
};
type Perch = { el: HTMLElement; left: number; top: number; width: number; f: number };

export function Puppeteer() {
  const reduce = useReducedMotion();
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const st = useRef<State | null>(null);
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
    let cache: Perch[] = [];
    const measure = () => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      cache = Array.from(document.querySelectorAll<HTMLElement>('[data-perch]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { el, left: r.left + sx, top: r.top + sy, width: r.width, f: parseFloat(el.dataset.perch ?? '0.5') };
      });
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
        st.current = { char: { x: first.x, y: -120 }, from: { x: first.x, y: -120 }, idx: 0, transitStart: reduce ? -1 : now, swing: 0, swingV: 0, baseX: first.x, facing: 1, squash: 0 };
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
        }
      }

      if (s.idx === -1) {
        heldPt.x += Math.sin(now / 1400) * 18;
        heldPt.y += Math.cos(now / 1100) * 10;
      }
      const target = s.idx >= 0 ? ps[s.idx].pt : heldPt;
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
      if (Math.abs(vx) > 30) s.facing = vx > 0 ? 1 : -1;
      else if (!carried) s.facing = s.char.x < vp.w / 2 ? 1 : -1;
      const baseGoal = s.char.x + (carried ? 0 : 60);
      s.baseX = lerp(s.baseX, baseGoal, 1 - Math.pow(0.02, dt));
      draw(now);

      // settled: perched, swing and squash at rest, carriage arrived → sleep until something changes
      const settled = !carried && Math.abs(s.swing) < 1e-4 && Math.abs(s.swingV) < 1e-4 && s.squash === 0 && Math.abs(s.baseX - baseGoal) < 1e-4; // tight: a looser snap leaves the carriage visibly off by a sub-pixel
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
      const hover = { x: s.char.x + 70, y: Math.max(vp.h * 0.08, s.char.y - 170) };
      // grip: closes at the start of a carry; opens at the end only if setting him down on a perch
      const gripW = held && !moving ? 1 : moving ? clamp(Math.min(k / 0.08, held ? 1 : (1 - k) / 0.08)) : 0;
      const tip = { x: lerp(hover.x, collar.x, gripW), y: lerp(hover.y, collar.y, gripW) };
      const t = vp.w < 700 ? 12 : 20;
      const base = { x: s.baseX, y: -t * 2 };
      const pose: Pose = { swing: 0, dangle: carried ? 1 : 0, facing: s.facing, squash: s.squash };
      // character pivots on the collar while carried
      setAttr(tiltRef.current, 'transform', carried ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : null);
      charRef.current?.set(s.char.x, s.char.y, scale, pose);
      armRef.current?.set({ base, tip, bend: tip.x > base.x ? -1 : 1, grip: gripW });
    };

    const loop = ticker.loop(frame);
    const wake = () => loop.wake();
    const offLayout = onLayout(() => {
      dirty = true;
      wake();
    });
    const mo = new MutationObserver(wake);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-printed'] });
    window.addEventListener('scroll', wake, { passive: true });
    draw(performance.now());
    wake();
    return () => {
      loop.stop();
      offLayout();
      mo.disconnect();
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
