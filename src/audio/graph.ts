import { BED, CEILING_HZ, FLOOR_HZ, LAYER_GAIN, LIMIT, MASTER, ROOM, spec, type Layer, type SoundName, type Variation } from './mix';
import { makeBed, makeBrown, makeNoise, makeRoom, RECIPES, type Bed } from './synth';

/**
 * The signal path, on any context (the live one, or an OfflineAudioContext to measure it):
 * voices → pan → layer gain → master, and a per-sound send into one shared dark room that returns
 * into the master too; then a lowpass ceiling (the mix stays dark), a subsonic floor, and a limiter
 * as a safety net. The bed goes straight into the master.
 */
export type Graph = {
  ac: BaseAudioContext;
  layers: Record<Layer, GainNode>;
  room: AudioNode;
  master: GainNode;
  noise: AudioBuffer;
  bed: () => Bed;
};

export function buildGraph(ac: BaseAudioContext, dest: AudioNode = ac.destination): Graph {
  const noise = makeNoise(ac);
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = LIMIT.threshold;
  limiter.knee.value = 6;
  limiter.ratio.value = LIMIT.ratio;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const ceiling = ac.createBiquadFilter();
  ceiling.type = 'lowpass';
  ceiling.frequency.value = CEILING_HZ;
  ceiling.Q.value = 0.5;
  const floor = ac.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = FLOOR_HZ;
  floor.Q.value = 0.5;
  const master = ac.createGain();
  master.gain.value = MASTER;
  master.connect(ceiling).connect(floor).connect(limiter).connect(dest);
  // the room: one long, dark tail every voice can send into
  const room = ac.createConvolver();
  room.buffer = makeRoom(ac);
  const wet = ac.createGain();
  wet.gain.value = ROOM.wet;
  room.connect(wet).connect(master);
  const layers = {} as Record<Layer, GainNode>;
  for (const l of Object.keys(LAYER_GAIN) as Layer[]) {
    layers[l] = ac.createGain();
    layers[l].gain.value = LAYER_GAIN[l];
    layers[l].connect(master);
  }
  let brown: AudioBuffer | null = null;
  let white: AudioBuffer | null = null;
  return {
    ac,
    layers,
    room,
    master,
    noise,
    bed: () => makeBed(ac, master, (brown ??= makeBrown(ac)), (white ??= makeNoise(ac, 7.3))),
  };
}

export type VoiceOpts = { t: number; v: Variation; gain?: number; rate?: number; pan?: number };

/** One voice into the graph at `t`: returns its gain (to fade it if it's evicted). */
export function voice(g: Graph, name: SoundName, o: VoiceOpts): GainNode {
  const { ac } = g;
  const s = spec(name);
  const vca = ac.createGain();
  vca.gain.value = (o.gain ?? 1) * s.level;
  let tail: AudioNode = vca;
  if (ac.createStereoPanner && o.pan) {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail = vca.connect(p);
  }
  tail.connect(g.layers[s.layer]);
  if (s.room > 0) {
    const send = ac.createGain();
    send.gain.value = s.room * LAYER_GAIN[s.layer];
    tail.connect(send).connect(g.room);
  }
  RECIPES[name]({ ac, out: vca, t: o.t, v: o.v, rate: (o.rate ?? 1) * o.v.rate, noise: g.noise });
  return vca;
}

/** Fade the bed in (from where it is) over BED.fade s. */
export function bedIn(b: Bed, t: number) {
  b.level.gain.cancelScheduledValues(t);
  b.level.gain.setValueAtTime(b.level.gain.value, t);
  b.level.gain.linearRampToValueAtTime(BED.level, t + BED.fade);
}

/** Dip the bed under a sound that starts at `t` and lasts `dur` s, then let it come back. */
export function duckBed(b: Bed, t: number, dur: number) {
  const g = b.duck.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(BED.duck, t, 0.06);
  g.setTargetAtTime(1, t + dur, BED.back / 3);
}
