import { peekView } from '../art/ticker';
import { sfx } from './bus';
import { linesDone, pickCue, plateCues, writtenCue, type Cue, type PlanLike } from './events';
import { FLOOR_HZ, LAYER_GAIN, MASTER, panFor, ROOM, spec, variation, VoicePool, type Layer, type SoundName } from './mix';
import { makeNoise, makeRoom, RECIPES } from './synth';

/**
 * The sound engine (its own chunk, loaded the first time sound starts). One AudioContext: voices →
 * per-layer gain → master (dry, plus a little room) → highpass floor → limiter → speakers. It takes over the bus
 * (`sfx`) while on, and suspends the context while off or while the page is hidden.
 */

export type PlayOpts = { gain?: number; rate?: number; pan?: number; at?: number };
export type Engine = { play: (name: SoundName, o?: PlayOpts) => void; setOn: (on: boolean) => void; readonly on: boolean };

type Log = { name: SoundName; t: number }[];
declare global {
  interface Window {
    __sfx?: { log: Log; count: Record<string, number> };
  }
}

let engine: Engine | null = null;

export function getEngine(ac: AudioContext): Engine {
  return (engine ??= createEngine(ac));
}

function createEngine(ac: AudioContext): Engine {
  const noise = makeNoise(ac);
  // master: a soft limiter keeps a few pops at once from ever getting loud; a floor under it cuts rumble
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -20;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const master = ac.createGain();
  master.gain.value = MASTER;
  const floor = ac.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = FLOOR_HZ;
  floor.connect(limiter).connect(ac.destination);
  master.connect(floor);
  // the room: a short dark tail under the dry pops
  const room = ac.createConvolver();
  room.buffer = makeRoom(ac);
  const wet = ac.createGain();
  wet.gain.value = ROOM.wet;
  room.connect(wet).connect(floor);
  master.connect(room);
  const layers = {} as Record<Layer, GainNode>;
  for (const l of Object.keys(LAYER_GAIN) as Layer[]) {
    layers[l] = ac.createGain();
    layers[l].gain.value = LAYER_GAIN[l];
    layers[l].connect(master);
  }
  const pool = new VoicePool();
  const vcas = new Map<number, GainNode>();
  let mode: string | null = null;
  let lines: number | null = null;
  let on = false;

  const dev = import.meta.env.DEV;
  const log: Log = [];
  const count: Record<string, number> = {};
  if (dev) window.__sfx = { log, count };

  function play(name: SoundName, o: PlayOpts = {}) {
    if (!on || document.hidden) return; // off or hidden: nothing queues up
    const s = spec(name);
    const now = ac.currentTime;
    const ok = pool.admit(name, now + (o.at ?? 0));
    if (!ok) return;
    if (ok.evict !== null) {
      vcas.get(ok.evict)?.gain.setTargetAtTime(0, now, 0.005);
      vcas.delete(ok.evict);
    }
    const v = variation();
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
    RECIPES[name]({ ac, out: vca, t, v, rate: (o.rate ?? 1) * v.rate, noise });
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
    puppet(m: string, x: number) {
      const c = pickCue(mode, m);
      mode = m;
      if (c) cue(c, panFor(x, peekView().w || window.innerWidth));
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
      if (!document.hidden) void ac.resume();
    } else {
      sfx.on = false;
      mode = null;
      lines = null;
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
