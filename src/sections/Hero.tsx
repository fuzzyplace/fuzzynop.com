import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hero } from '../content/site';
import { variants } from '../content/variants';
import { Depth, Ground, HexLattice, Ledge, SpiderLeg, Splatter } from '../art/Decor';
import { MechArm, type ArmHandle } from '../art/MechArm';
import { clamp, easeInOut, lerp, type Pt } from '../art/geometry';
import { notifyLayout, ticker } from '../art/ticker';
import { useSize } from '../art/useSize';

/** The arm writes the tagline line by line, then withdraws and idles. */
const DELAY = 0.6;
const PER_LINE = 1.15;
const TRAVEL = 0.22; // share of each line spent moving to its start
const RETRACT = 0.9;
const HOLD = 4.5; // ?hero=rotate: s a question stays written
const ERASE = 0.7; // s to wipe it before the next one

/** Which lines the arm writes: the open question (default), the three questions in turn, or the v2.3 tagline. */
const SETS = variants.hero === 'classic' ? [hero.tagline] : variants.hero === 'rotate' ? hero.questions : [hero.question];
const ASK = variants.hero !== 'classic'; // a question ends in a blinking cursor

type Box = { x: number; y: number; w: number; h: number };

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const lines = useRef<(HTMLSpanElement | null)[]>([]);
  const armRef = useRef<ArmHandle>(null);
  const { w, h } = useSize(ref);
  const reduce = useReducedMotion();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [qi, setQi] = useState(0); // which question (rotate) — changes every few seconds, not per frame
  const text = SETS[qi];
  const n = text.length;
  const writeEnd = DELAY + n * PER_LINE;
  const cycleAt = useRef(0); // clock time the current question started

  useLayoutEffect(() => {
    const host = ref.current?.getBoundingClientRect();
    if (!host) return;
    lines.current.length = n;
    setBoxes(
      lines.current.map((el) => {
        const r = el!.getBoundingClientRect();
        return { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height };
      }),
    );
    notifyLayout(); // the ground perch moves with w (groundH) without resizing the body
  }, [w, h, qi]);

  // Draw one frame of the hero at `time` (s since load) — tagline reveal + arm pose. DOM writes only.
  const draw = useRef<(time: number) => void>(() => {});
  draw.current = (clock: number) => {
    const scrollY = reduce ? 0 : window.scrollY;
    // rotate: each question is written, held, wiped, then the next one is written
    let time = clock - cycleAt.current;
    if (SETS.length > 1 && !reduce && time > writeEnd + RETRACT + HOLD + ERASE) {
      cycleAt.current = clock;
      time = 0;
      setQi((i) => (i + 1) % SETS.length);
    }
    const wipe = SETS.length > 1 && !reduce ? clamp((time - writeEnd - RETRACT - HOLD) / ERASE) : 0;
    // reveal fraction per line
    const q = text.map((_, i) => (reduce ? 1 : clamp((time - DELAY - i * PER_LINE - PER_LINE * TRAVEL) / (PER_LINE * (1 - TRAVEL))) * (1 - wipe)));
    q.forEach((v, i) => {
      const el = lines.current[i];
      if (el) el.style.clipPath = `inset(-10% ${((1 - v) * 100).toFixed(2)}% -10% 0)`;
    });
    if (!w) return;

    // arm geometry — the base rides the ceiling rail, trailing the tip, so reach stays modest
    const narrow = w < 700;
    const t = clamp(w * 0.022, 12, 30);
    const sway = reduce ? { x: 0, y: 0 } : { x: Math.sin(time * 0.6) * 18, y: Math.cos(time * 0.45) * 12 };
    const rest: Pt = { x: w * 0.7 + sway.x, y: h * (narrow ? 0.26 : 0.34) + sway.y - scrollY * 0.6 };

    let tip = rest;
    let hot = 0;
    if (boxes.length === n && !reduce) {
      const mid = (b: Box) => b.y + Math.min(b.h, h * 0.16) * 0.58;
      if (time < writeEnd) {
        const i = clamp(Math.floor((time - DELAY) / PER_LINE), 0, n - 1);
        const s = clamp((time - DELAY - i * PER_LINE) / PER_LINE);
        const b = boxes[i];
        const prev = i === 0 ? rest : { x: boxes[i - 1].x + boxes[i - 1].w, y: mid(boxes[i - 1]) };
        if (time < DELAY) tip = rest;
        else if (s < TRAVEL) {
          const e = easeInOut(s / TRAVEL);
          tip = { x: lerp(prev.x, b.x, e), y: lerp(prev.y, mid(b), e) - Math.sin(Math.PI * e) * 60 };
        } else {
          tip = { x: b.x + q[i] * b.w, y: mid(b) + Math.sin(q[i] * 40) * 2 };
          hot = 1;
        }
      } else {
        const k = easeInOut(clamp((time - writeEnd) / RETRACT));
        const last = boxes[n - 1];
        tip = { x: lerp(last.x + last.w, rest.x, k), y: lerp(mid(last), rest.y, k) };
      }
    }
    const base: Pt = { x: clamp(tip.x + w * (narrow ? 0.3 : 0.22), 0, w + t), y: -t * 0.6 };
    armRef.current?.set({ base, tip, bend: -1, hot, railY: -4 });
  };

  // clock starts at mount; the loop runs only while the hero is near the viewport
  const start = useRef(0);
  const time = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  useLayoutEffect(() => {
    draw.current(reduce ? writeEnd + RETRACT : time.current);
  });
  useEffect(() => {
    if (reduce) return;
    const near = () => window.scrollY < window.innerHeight * 1.2;
    const loop = ticker.loop((now) => {
      if (!near()) return false;
      time.current = (now - start.current) / 1000;
      draw.current(time.current);
      return true;
    });
    const wake = () => near() && loop.wake();
    window.addEventListener('scroll', wake, { passive: true });
    wake();
    return () => {
      loop.stop();
      window.removeEventListener('scroll', wake);
    };
  }, [reduce]);

  const narrow = w < 700;
  // [x fraction of the hero, px above the ground perch]: each a hop from the last
  const LEDGES: [number, number][] = [
    [0.8, 130],
    [0.93, 250],
    [0.83, 370],
  ];
  const groundH = narrow ? 70 : 96;
  const perchX = narrow ? 0.82 : 0.9;
  const t = clamp(w * 0.022, 12, 30);
  const l = h * (narrow ? 0.46 : 0.5);

  return (
    <section ref={ref} id="top" className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
      {/* depth layers */}
      <Depth depth={0.8} className="right-[-6%] top-[8%] opacity-90">
        <HexLattice cols={9} rows={6} r={46} tone="far" seed={4} />
      </Depth>
      <Depth depth={0.45} className="left-[38%] top-[-4%]">
        <SpiderLeg length={narrow ? 320 : 560} t={narrow ? 10 : 16} tone="mid" delay={0.4} />
      </Depth>
      <Depth depth={0.25} className="right-[-3%] top-[-6%] hidden md:block">
        <SpiderLeg length={700} t={20} tone="near" flip delay={1.2} />
      </Depth>
      <div className="hero-shade" aria-hidden="true" />
      {/* a pool of light where the character stands — silhouettes need something to stand against */}
      <div className="hero-pool" style={{ left: `${perchX * 100}%` }} aria-hidden="true" />
      <Depth depth={0.1} className="bottom-[14%] right-[12%] hidden md:block">
        <Splatter size={200} seed={9} />
      </Depth>

      <div className="shell relative z-10 pb-44 pt-40">
        <p className="type-label-medium text-gray-300">{hero.eyebrow}</p>
        <h1 className="type-display-large mt-6 text-on-surface">
          {text.map((line, i) => (
            <span
              key={line}
              ref={(el) => {
                lines.current[i] = el;
              }}
              className="block w-fit py-1"
            >
              {line}
              {ASK && i === n - 1 && (
                <span className="caret" aria-hidden="true">
                  _
                </span>
              )}
            </span>
          ))}
        </h1>
      </div>

      {/* the arm */}
      {w > 0 && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <MechArm ref={armRef} l1={l} l2={l} t={t} toolLen={t * 3.2} rail={{ x1: 0, x2: w }} />
        </svg>
      )}

      {/* ground — the character's first perch */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <Ground width={Math.max(w, 1)} height={groundH} />
      </div>
      {/* desktop: he walks only within the pool of light (a black silhouette vanishes on the dark ground beyond it) */}
      <div className="absolute inset-x-0" style={{ bottom: groundH * 0.62 }} data-perch={perchX} data-perch-span={narrow ? undefined : 260} aria-hidden="true" />
      {/* desktop: hung hex stepping-stones in the light, clear of the headline — somewhere for him to climb */}
      {!narrow &&
        LEDGES.map(([x, up]) => <Ledge key={x} style={{ left: `calc(${x * 100}% - 42px)`, bottom: groundH * 0.62 + up - 26 }} />)}
    </section>
  );
}
