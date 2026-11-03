import { peekView } from '../art/ticker';
import { sfx } from './bus';
import { inkCue, linesDone, plateCues, puppetCues, writtenCue, type Cue, type PlanLike } from './events';
import { bedIn, buildGraph, duckBed, voice } from './graph';
import { panFor, spec, variation, VoicePool, type SoundName } from './mix';
import type { Bed } from './synth';

/**
 * The sound engine (its own chunk, loaded the first time sound starts). One AudioContext and the
 * graph in graph.ts, a quiet bed of fog under everything once sound is on, and the bus (`sfx`) taken
 * over while on. The context suspends while off or while the page is hidden, bed and all.
 */

export type PlayOpts = { gain?: number; rate?: number; pan?: number; at?: number };
export type Engine = {
  play: (name: SoundName, o?: PlayOpts) => void;
  setOn: (on: boolean) => void;
  /** The bed on or off (dev board only; it follows sound otherwise). */
  setBed: (on: boolean) => void;
  readonly on: boolean;
};

type Log = { name: SoundName; t: number }[];
declare global {
  interface Window {
    __sfx?: { log: Log; count: Record<string, number> };
  }
}

/** A cue that comes too soon after the same sound waits up to this long for its gap (a piece is never skipped). */
const WAIT = 0.15;
/** The circuit tree's links: a faint tick as one is hovered or focused. */
const NODE = '[data-poi="node"]';

let engine: Engine | null = null;

export function getEngine(ac: AudioContext): Engine {
  return (engine ??= createEngine(ac));
}

function createEngine(ac: AudioContext): Engine {
  const g = buildGraph(ac);
  const pool = new VoicePool();
  const vcas = new Map<number, GainNode>();
  let bed: Bed | null = null;
  let bedWanted = true;
  let mode: string | null = null;
  let ink: boolean | undefined | null = null;
  let lines: number | null = null;
  let node: Element | null = null;
  let on = false;

  const dev = import.meta.env.DEV;
  const log: Log = [];
  const count: Record<string, number> = {};
  if (dev) window.__sfx = { log, count };

  function play(name: SoundName, o: PlayOpts = {}) {
    if (!on || document.hidden) return; // off or hidden: nothing queues up
    const s = spec(name);
    const now = ac.currentTime;
    const ok = pool.admit(name, now + (o.at ?? 0), undefined, WAIT);
    if (!ok) return;
    if (ok.evict !== null) {
      vcas.get(ok.evict)?.gain.setTargetAtTime(0, now, 0.005);
      vcas.delete(ok.evict);
    }
    const v = variation();
    const t = ok.at + 0.005 + v.delay;
    const vca = voice(g, name, { t, v, gain: (o.gain ?? 1) * v.gain * ok.duck, rate: o.rate, pan: o.pan });
    if (bed && name !== 'hover') duckBed(bed, t, s.dur);
    vcas.set(ok.id, vca);
    window.setTimeout(
      () => {
        vcas.delete(ok.id);
        vca.disconnect();
      },
      (t - now + s.dur + 0.3) * 1000,
    );
    if (dev) {
      log.push({ name, t: Math.round(performance.now()) });
      if (log.length > 400) log.shift();
      count[name] = (count[name] ?? 0) + 1;
    }
  }

  const cue = (c: Cue, pan: number) => play(c.name, { gain: c.gain, rate: c.rate, at: c.at, pan: c.pan ?? pan });

  // ---- the bus ----
  const handlers = {
    puppet(m: string, x: number, k?: boolean) {
      const cs = puppetCues(mode, m);
      const c = inkCue(ink, k);
      mode = m;
      ink = k;
      if (!cs.length && !c) return;
      const pan = panFor(x, peekView().w || window.innerWidth);
      for (const q of cs) cue(q, pan);
      if (c) cue(c, pan);
    },
    written(q: readonly number[]) {
      const c = writtenCue(lines, q);
      lines = linesDone(q);
      if (c) cue(c, 0.15);
    },
    plate(plan: object, t0: number, t1: number) {
      for (const c of plateCues(plan as PlanLike, t0, t1)) cue(c, 0);
    },
  };

  // ---- the circuit tree's links (delegated: no component knows about sound) ----
  const enter = (e: Event) => {
    const el = e.target instanceof Element ? e.target.closest(NODE) : null;
    if (el === node) return;
    node = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    play('hover', { pan: panFor(r.left + r.width / 2, window.innerWidth) });
  };
  const listen = (v: boolean) => {
    const f = v ? document.addEventListener.bind(document) : document.removeEventListener.bind(document);
    f('pointerover', enter, { passive: true } as AddEventListenerOptions);
    f('focusin', enter);
  };

  // ---- the bed ----
  function bedOn(v: boolean) {
    if (v && !bed) {
      bed = g.bed();
      bedIn(bed, ac.currentTime);
    } else if (!v && bed) {
      bed.stop();
      bed = null;
    }
  }

  const onVis = () => {
    if (document.hidden) void ac.suspend();
    else if (on) void ac.resume();
  };
  document.addEventListener('visibilitychange', onVis);

  function setOn(v: boolean) {
    if (v === on) return;
    on = v;
    if (v) {
      Object.assign(sfx, handlers);
      sfx.on = true;
      listen(true);
      if (!document.hidden) void ac.resume();
      bedOn(bedWanted); // fades in from silence each time sound starts
    } else {
      sfx.on = false;
      mode = null;
      ink = null;
      lines = null;
      node = null;
      listen(false);
      bedOn(false);
      void ac.suspend();
    }
  }

  return {
    play,
    setOn,
    setBed(v: boolean) {
      bedWanted = v;
      if (on) bedOn(v);
    },
    get on() {
      return on;
    },
  };
}
