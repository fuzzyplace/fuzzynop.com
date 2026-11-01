/**
 * One shared requestAnimationFrame loop for the whole stage.
 * Runs only while something is awake; pauses when the tab is hidden.
 * Each loop's step returns `true` to keep running or `false` to sleep until `wake()`.
 * Components write to the DOM through refs inside their step: no React render per frame.
 */
export type Step = (now: number, dt: number) => boolean;
export type Loop = { wake: () => void; stop: () => void };

type Env = {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  hidden: () => boolean;
  onVisibility: (cb: () => void) => void;
};

export function createTicker(env: Env) {
  const awake = new Set<Step>();
  let id = 0;
  let last = 0;

  const frame = (now: number) => {
    id = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (const step of [...awake]) {
      let keep = false;
      try {
        keep = step(now, dt);
      } catch (err) {
        console.error(err); // a broken loop drops out; the rest of the stage keeps running
      }
      if (!keep) awake.delete(step);
    }
    schedule();
  };
  const schedule = () => {
    if (id || !awake.size || env.hidden()) return;
    id = env.raf(frame);
  };
  let listening = false;
  const onVisibility = () => {
    if (env.hidden()) {
      if (id) env.caf(id);
      id = 0;
    } else {
      last = env.now(); // no catch-up jump after a background tab
      schedule();
    }
  };

  function loop(step: Step): Loop {
    return {
      wake() {
        if (!listening) {
          listening = true;
          env.onVisibility(onVisibility);
        }
        if (!awake.has(step)) {
          if (!awake.size && !id) last = env.now();
          awake.add(step);
        }
        schedule();
      },
      stop() {
        awake.delete(step);
      },
    };
  }

  return { loop, get running() { return id !== 0; }, get size() { return awake.size; } };
}

export const ticker = createTicker({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  hidden: () => document.hidden,
  onVisibility: (cb) => document.addEventListener('visibilitychange', cb),
});

/** Skip DOM writes when the value hasn't changed (keeps settled frames free of style work). */
const written = new WeakMap<Element, Record<string, string | null>>();
export function setAttr(el: Element | null, name: string, value: string | number | null) {
  if (!el) return;
  const v = value === null ? null : String(value);
  let m = written.get(el);
  if (!m) written.set(el, (m = {}));
  if (m[name] === v) return;
  m[name] = v;
  if (v === null) el.removeAttribute(name);
  else el.setAttribute(name, v);
}

/** Document-space top of an element, ignoring transforms (matches motion's useScroll). */
export function docTop(el: HTMLElement) {
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur) {
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return y;
}

/** Re-measure callbacks: window resize + any change to the document's size (fonts, images, content). */
const measurers = new Set<() => void>();
let ro: ResizeObserver | null = null;
const measureAll = () => measurers.forEach((m) => m());
export function onLayout(fn: () => void) {
  measurers.add(fn);
  if (!ro) {
    ro = new ResizeObserver(measureAll);
    ro.observe(document.body);
    window.addEventListener('resize', measureAll);
  }
  return () => {
    measurers.delete(fn);
  };
}

/** Call after a layout change the body ResizeObserver can't see (e.g. an absolutely placed perch moved). */
export const notifyLayout = () => measureAll();
