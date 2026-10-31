import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Character, type Pose } from './Character';
import { MechArm } from './MechArm';
import { clamp, easeInOut, lerp, type Pt } from './geometry';

/**
 * A ceiling-rail arm that carries the character around the page.
 * Perches = elements with [data-perch] (fraction along their top edge). A plate only becomes
 * a perch once it's printed ([data-printed="1"]). The character is set down on whichever
 * perch sits nearest the reading line; between perches the claw grabs him by the collar.
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

export function Puppeteer() {
  const reduce = useReducedMotion();
  const [, force] = useState(0);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const st = useRef<State | null>(null);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!vp.w) return;
    let raf = 0;
    let last = performance.now();
    const scale = vp.w < 700 ? 1.3 : 1.85;

    const perches = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-perch]')).map((el) => {
        const r = el.getBoundingClientRect();
        const f = parseFloat(el.dataset.perch ?? '0.5');
        return {
          ok: el.dataset.printed !== '0',
          pt: { x: r.left + r.width * f, y: r.top - FEET * scale },
          top: r.top,
          visible: r.top > 70 && r.top < vp.h - 8,
        };
      });

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ps = perches();
      if (!ps.length) {
        raf = requestAnimationFrame(frame);
        return;
      }
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
      if (s.transitStart >= 0) {
        const k = clamp((now - s.transitStart) / 1000 / TRANSIT);
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
      s.baseX = lerp(s.baseX, s.char.x + (carried ? 0 : 60), 1 - Math.pow(0.02, dt));

      force((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [vp, reduce]);

  const s = st.current;
  if (!s || !vp.w) return null;

  const scale = vp.w < 700 ? 1.3 : 1.85;
  const held = s.idx === -1;
  const moving = s.transitStart >= 0;
  const carried = moving || held;
  const k = moving ? clamp((performance.now() - s.transitStart) / 1000 / TRANSIT) : 1;
  const collar = { x: s.char.x + COLLAR.x * s.facing * scale, y: s.char.y + COLLAR.y * scale };
  const hover = { x: s.char.x + 70, y: Math.max(vp.h * 0.08, s.char.y - 170) };
  // grip: closes at the start of a carry; opens at the end only if setting him down on a perch
  const gripW = held && !moving ? 1 : moving ? clamp(Math.min(k / 0.08, held ? 1 : (1 - k) / 0.08)) : 0;
  const tip = { x: lerp(hover.x, collar.x, gripW), y: lerp(hover.y, collar.y, gripW) };
  const t = vp.w < 700 ? 12 : 20;
  const l = vp.h * 0.42;
  const base = { x: s.baseX, y: -t * 2 };
  const pose: Pose = { swing: carried ? s.swing : 0, dangle: carried ? 1 : 0, facing: s.facing, squash: s.squash };

  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full overflow-visible" viewBox={`0 0 ${vp.w} ${vp.h}`} aria-hidden="true">
      {/* character pivots on the collar while carried */}
      <g transform={carried ? `rotate(${(s.swing * 180) / Math.PI} ${collar.x} ${collar.y})` : undefined}>
        <Character x={s.char.x} y={s.char.y} scale={scale} pose={{ ...pose, swing: 0 }} />
      </g>
      <MechArm base={base} tip={tip} l1={l} l2={l} bend={tip.x > base.x ? -1 : 1} t={t} tool="claw" toolLen={t * 2.6} grip={gripW} />
    </svg>
  );
}
