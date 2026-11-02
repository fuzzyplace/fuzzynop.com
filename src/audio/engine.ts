import { measure, peekView } from '../art/ticker';
import { sfx, type PuppetPose } from './bus';
import { ArmTracker, breathing, frameCues, nextBreath, noteCues, plateCues, pokeCues, BREATH_PERIOD, type Cue, type PlanLike, type Snap } from './events';
import { LAYER_GAIN, MASTER, panFor, spec, variation, VoicePool, type Band, type Layer, type SoundName } from './mix';
import { makeNoise, RECIPES } from './synth';

/**
 * The sound engine (its own chunk, loaded the first time the visitor turns sound on). One
 * AudioContext: voices → per-layer gain → master → limiter → speakers. It takes over the bus
 * (`sfx`) while on, suspends the context while off or while the page is hidden, and plays the
 * idle breath on a timer in step with the character's CSS breathing (never a ticker loop).
 */

export type PlayOpts = { gain?: number; rate?: number; pan?: number; at?: number; band?: Band };
export type Engine = { play: (name: SoundName, o?: PlayOpts) => void; setOn: (on: boolean) => void; readonly on: boolean };

type Log = { name: SoundName; t: number }[];
declare global {
  interface Window {
    __sfx?: { log: Log; count: Record<string, number>; band: string; snap: Snap | null };
  }
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BANDS = new Set(['shaken', 'wary', 'tolerant', 'warm']);

let engine: Engine | null = null;

export function getEngine(ac: AudioContext): Engine {
  return (engine ??= createEngine(ac));
}

function createEngine(ac: AudioContext): Engine {
  const noise = makeNoise(ac);
  // master: a soft limiter keeps a pile-up from ever getting loud
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -20;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const master = ac.createGain();
  master.gain.value = MASTER;
  master.connect(limiter).connect(ac.destination);
  const layers = {} as Record<Layer, GainNode>;
  for (const l of Object.keys(LAYER_GAIN) as Layer[]) {
    layers[l] = ac.createGain();
    layers[l].gain.value = LAYER_GAIN[l];
    layers[l].connect(master);
  }
  const pool = new VoicePool();
  const vcas = new Map<number, GainNode>();
  const arms = new ArmTracker();
  const armX = new WeakMap<object, { left: number; at: number }>();
  let band: Band = 'tolerant';
  let last: Snap | null = null;
  let on = false;

  const dev = import.meta.env.DEV;
  const log: Log = [];
  const count: Record<string, number> = {};
  if (dev) window.__sfx = { log, count, band, snap: null };

  function play(name: SoundName, o: PlayOpts = {}) {
    if (!on || document.hidden) return; // off or hidden: nothing queues up
    const s = spec(name);
    const now = ac.currentTime;
    const ok = pool.admit(name, now + (o.at ?? 0));
    if (!ok) return;
    if (ok.evict !== null) {
      const g = vcas.get(ok.evict);
      g?.gain.setTargetAtTime(0, now, 0.01);
      vcas.delete(ok.evict);
    }
    const v = variation(o.band ?? band);
    const t = now + 0.005 + v.delay + (o.at ?? 0);
    const vca = ac.createGain();
    vca.gain.value = (o.gain ?? 1) * v.gain * ok.duck;
    let tail: AudioNode = vca;
    if (ac.createStereoPanner && o.pan) {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      tail = vca.connect(p);
    }
    tail.connect(layers[s.layer]);
    let lfo: OscillatorNode | null = null;
    if (v.shake > 0) {
      // shaken: a tremble in the level
      lfo = ac.createOscillator();
      lfo.frequency.value = 14 + Math.random() * 6;
      const depth = ac.createGain();
      depth.gain.value = vca.gain.value * 0.35 * v.shake;
      lfo.connect(depth).connect(vca.gain);
      lfo.start(t);
      lfo.stop(t + s.dur + 0.1);
    }
    RECIPES[name]({ ac, out: vca, t, v, rate: (o.rate ?? 1) * v.rate, noise });
    vcas.set(ok.id, vca);
    window.setTimeout(() => {
      vcas.delete(ok.id);
      vca.disconnect();
    }, (t - now + s.dur + 0.4) * 1000);
    if (dev) {
      log.push({ name, t: Math.round(performance.now()) });
      if (log.length > 400) log.shift();
      count[name] = (count[name] ?? 0) + 1;
    }
  }

  const cue = (c: Cue, pan: number) => play(c.name, { gain: c.gain, rate: c.rate, at: c.at, pan: c.pan ?? pan });
  const charPan = () => (last ? panFor(last.x, peekView().w || window.innerWidth) : 0);

  // ---- the bus ----
  const handlers = {
    note(k: string) {
      for (const c of noteCues(k)) cue(c, charPan());
    },
    puppet(mode: string, x: number, y: number, hidden: boolean, b: string, patting: boolean, pose: PuppetPose) {
      const cur: Snap = { mode, x, y, hidden, band: b, patting, action: pose.action, phase: pose.phase ?? 0, walk: pose.walk ?? 0, ink: pose.ink ? { ...pose.ink } : undefined, stunt: pose.stunt?.kind };
      if (BANDS.has(b)) band = b as Band;
      const cues = frameCues(last, cur);
      last = cur;
      if (dev) {
        window.__sfx!.band = band;
        window.__sfx!.snap = cur;
      }
      if (cues.length) {
        const pan = panFor(x, peekView().w || window.innerWidth);
        for (const c of cues) cue(c, pan);
      }
      if (breathing(cur, peekView().w || window.innerWidth, peekView().h || window.innerHeight)) breath.wake();
    },
    plate(plan: object, t0: number, t1: number) {
      for (const c of plateCues(plan as PlanLike, t0, t1)) cue(c, 0);
    },
    arm(key: object, x: number) {
      const c = arms.update(key, x, 0, performance.now() / 1000);
      if (!c) return;
      // where the arm is on screen: its SVG's left edge, measured in a frame's read phase (never here)
      const m = armX.get(key);
      const now = performance.now();
      if (!m || now - m.at > 1000) {
        const el = (key as SVGElement).ownerSVGElement;
        if (el) measure(() => armX.set(key, { left: el.getBoundingClientRect().left, at: performance.now() }));
      }
      cue(c, m ? panFor(m.left + x, peekView().w || window.innerWidth) : 0);
    },
    poke(kind: string, win: boolean) {
      for (const c of pokeCues(kind, win)) cue(c, charPan());
    },
  };

  // ---- ui clicks: links, the CTA, the link tree, nav (one listener, nothing in the components) ----
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('a[href], button, [role="link"]');
    if (!el || el.closest('[data-sfx-silent]')) return;
    play('ui', { pan: panFor(e.clientX, window.innerWidth) * 0.5 });
  };

  // ---- breath: in step with `.char-breathe`, only while he's still and on screen ----
  const breath = (() => {
    let timer = 0;
    const cssTime = () => {
      const el = document.querySelector('.char-breathe');
      const a = el?.getAnimations?.()[0];
      const ct = a?.currentTime;
      return typeof ct === 'number' ? ct / 1000 : performance.now() / 1000;
    };
    const tick = () => {
      timer = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!on || document.hidden || reduced() || !breathing(last, w, h)) return; // asleep until the next frame says he's still
      const { inhale, exhale } = nextBreath(cssTime(), BREATH_PERIOD);
      const which: SoundName = inhale <= exhale ? 'inhale' : 'exhale';
      const wait = Math.min(inhale, exhale);
      if (wait < 0.08) play(which, { pan: charPan() * 0.7 });
      timer = window.setTimeout(tick, wait < 0.08 ? 150 : Math.max(60, wait * 1000 - 30));
    };
    return {
      wake() {
        if (!timer && on && !reduced()) timer = window.setTimeout(tick, 60);
      },
      stop() {
        window.clearTimeout(timer);
        timer = 0;
      },
    };
  })();

  const onVis = () => {
    if (document.hidden) void ac.suspend();
    else if (on) void ac.resume();
  };
  document.addEventListener('visibilitychange', onVis);

  function setOn(v: boolean) {
    on = v;
    if (v) {
      Object.assign(sfx, handlers);
      sfx.on = true;
      document.addEventListener('click', onClick, true);
      if (!document.hidden) void ac.resume();
      breath.wake();
    } else {
      sfx.on = false;
      document.removeEventListener('click', onClick, true);
      breath.stop();
      last = null;
      void ac.suspend();
    }
  }

  return {
    play,
    setOn,
    get on() {
      return on;
    },
  };
}
