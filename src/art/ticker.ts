/**
 * One shared requestAnimationFrame loop for the whole stage.
 * Runs only while something is awake; pauses when the tab is hidden.
 * Each loop's step returns `true` to keep running or `false` to sleep until `wake()`.
 * Components write to the DOM through refs inside their step: no React render per frame.
 *
 * Read phase, then write phase: `env.read` runs once at the top of every frame, before any step,
 * while layout is still clean. Steps take scroll/viewport metrics from `view()` (that one read)
 * and never read layout themselves, so one step's attribute writes can't force a synchronous
 * layout in the next step's read.
 */
export type Step = (now: number, dt: number) => boolean;
export type Loop = { wake: () => void; stop: () => void };

type Env = {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  hidden: () => boolean;
  onVisibility: (cb: () => void) => void;
  read?: () => void; // the frame's read phase (runs before any step)
  inFrame?: (on: boolean) => void;
};

export function createTicker(env: Env) {
  const awake = new Set<Step>();
  const reads = new Set<() => void>(); // one-off layout reads queued for the next frame's read phase
  let id = 0;
  let last = 0;
  let inFrame = false; // wakes during a frame are scheduled once, when it ends

  const frame = (now: number) => {
    id = 0;
    inFrame = true;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    env.read?.();
    env.inFrame?.(true);
    for (const read of [...reads]) {
      reads.delete(read);
      try {
        read();
      } catch (err) {
        console.error(err);
      }
    }
    for (const step of [...awake]) {
      let keep = false;
      try {
        keep = step(now, dt);
      } catch (err) {
        console.error(err); // a broken loop drops out; the rest of the stage keeps running
      }
      if (!keep) awake.delete(step);
    }
    env.inFrame?.(false);
    inFrame = false;
    schedule();
  };
  const schedule = () => {
    if (id || inFrame || (!awake.size && !reads.size) || env.hidden()) return;
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

  const listen = () => {
    if (listening) return;
    listening = true;
    env.onVisibility(onVisibility);
  };
  /**
   * Queue a layout read for the next frame's read phase (after the frame-start read, before any
   * step writes): measuring there never forces an extra synchronous layout. It may wake loops,
   * which then run in that same frame.
   */
  function measure(read: () => void) {
    listen();
    if (!awake.size && !id) last = env.now();
    reads.add(read);
    schedule();
  }

  function loop(step: Step): Loop {
    return {
      wake() {
        listen();
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

  return { loop, measure, get running() { return id !== 0; }, get size() { return awake.size; } };
}

/** Scroll + viewport metrics. Inside a ticker frame: the values read at the frame's start. */
export type View = { sx: number; sy: number; w: number; h: number; ch: number };
const cur: View = { sx: 0, sy: 0, w: 0, h: 0, ch: 0 };
let framing = false;
const readView = () => {
  cur.sx = window.scrollX;
  cur.sy = window.scrollY;
  cur.w = window.innerWidth;
  cur.h = window.innerHeight;
  cur.ch = document.documentElement.clientHeight;
};
/**
 * scrollX/Y, innerWidth/Height (w, h) and the root's clientHeight (ch). In a ticker step this is
 * the frame's single read (free); outside a frame (events, effects) it reads live.
 */
export function view(): Readonly<View> {
  if (!framing) readView();
  return cur;
}
/**
 * The last values read (no read now: may be a frame stale). For drawing during a React commit,
 * where a live read would force layout; a queued `measure` / loop wake corrects it before paint.
 */
export const peekView = (): Readonly<View> => cur;

export const ticker = createTicker({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  hidden: () => document.hidden,
  onVisibility: (cb) => document.addEventListener('visibilitychange', cb),
  read: readView,
  inFrame: (on) => void (framing = on),
});

/**
 * Deferred work, one callback per idle period, starting after the first frame has painted
 * (requestIdleCallback with a timeout, so it also runs on a main thread that's never quite idle).
 * Returns a cancel function.
 */
type IdleFn = (cb: (d?: IdleDeadline) => void, opts?: { timeout: number }) => number;
const idleQueue: (() => void)[] = [];
let idleBusy = false;
let painted = false;
let idleRan = 0;
const IDLE_MIN_MS = 8; // a job needs at least this much of an idle period (unless it timed out)
const pumpIdle = () => {
  if (idleBusy || !idleQueue.length) return;
  idleBusy = true;
  const ric: IdleFn = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 120));
  // the first job may push in after 1.5 s; the rest wait longer for a truly idle period, so a busy
  // (or throttled) main thread doesn't get them back to back as long tasks
  const run = (): void =>
    void ric(
      (d) => {
        if (d && !d.didTimeout && d.timeRemaining() < IDLE_MIN_MS) return run();
        idleBusy = false;
        idleRan++;
        idleQueue.shift()?.();
        pumpIdle();
      },
      { timeout: idleRan ? 4000 : 1500 },
    );
  if (painted) run();
  else
    requestAnimationFrame(() => {
      painted = true;
      run();
    });
};
export function whenIdle(fn: () => void, first = false) {
  if (first) idleQueue.unshift(fn);
  else idleQueue.push(fn);
  pumpIdle();
  return () => {
    const i = idleQueue.indexOf(fn);
    if (i >= 0) idleQueue.splice(i, 1);
  };
}

/** Queue a layout read for the next frame's read phase (see createTicker's `measure`). */
export const measure = (read: () => void) => ticker.measure(read);

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
