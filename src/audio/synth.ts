import { BED, GRAIN_JITTER, GRAINS, nextShape, ROOM, type Grain, type SoundName, type Variation } from './mix';

/**
 * The sounds themselves, synthesised with Web Audio: filtered noise and a few low sines, shaped
 * like felt, paper, ink and breath. No samples. Each recipe builds its nodes into `out` (the voice's
 * gain) starting at `t`. Most of it is lowpassed well under 2 kHz before the master's own ceiling.
 */

export type Voice = { ac: BaseAudioContext; out: AudioNode; t: number; v: Variation; rate: number; noise: AudioBuffer };

/** Seconds of white noise, made once per context. */
export function makeNoise(ac: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Brown noise (a deep rumble, most of it under 200 Hz), normalised, for the bed. */
export function makeBrown(ac: BaseAudioContext, seconds = 9.7): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = b;
    peak = Math.max(peak, Math.abs(b));
  }
  // fade the ends together so the loop doesn't click
  const x = Math.floor(ac.sampleRate * 0.05);
  for (let i = 0; i < x; i++) {
    const k = i / x;
    d[len - x + i] = d[len - x + i] * (1 - k) + d[i] * k;
  }
  for (let i = 0; i < len; i++) d[i] /= peak || 1;
  return buf;
}

/** The room: a long, dark, softly decaying noise tail (a generated impulse response, no file). */
export function makeRoom(ac: BaseAudioContext, seconds = ROOM.seconds): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < len; i++) {
      lp += ROOM.dark * (Math.random() * 2 - 1 - lp); // darken, twice
      lp2 += ROOM.dark * 2 * (lp - lp2);
      const k = i / len;
      d[i] = lp2 * Math.min(1, i / (ac.sampleRate * 0.012)) * (1 - k) ** 2.5; // soft onset, long fall
    }
  }
  return buf;
}

const EPS = 0.0001;

/** An envelope on a gain: silent at t, up to `peak` after `a` s, gone (exponentially) by `t + d`. */
function env(g: AudioParam, t: number, peak: number, a: number, d: number) {
  g.setValueAtTime(EPS, t);
  g.linearRampToValueAtTime(Math.max(EPS * 2, peak), t + a);
  g.exponentialRampToValueAtTime(EPS, t + d);
}

/** A slice of noise starting at t, `len` s long (from a random place in the buffer). */
function noise(V: Voice, t: number, len: number, rate = 1) {
  const src = V.ac.createBufferSource();
  src.buffer = V.noise;
  src.playbackRate.value = rate;
  src.start(t, Math.random() * Math.max(0, V.noise.duration - len - 0.05), len + 0.02);
  return src;
}

function filter(ac: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** A sine from f0 falling (or rising) to f1 over `glide` s, under an envelope. */
function tone(V: Voice, t: number, f0: number, f1: number, glide: number, peak: number, a: number, d: number, type: OscillatorType = 'sine') {
  const { ac, out } = V;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  const g = ac.createGain();
  env(g.gain, t, peak, a, d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.02);
  return o;
}

/** A dull thud: a low sine dropping into its note, and a lowpassed puff of noise (felt, cloth). */
function thud(V: Voice, t: number, f: number, size: number, lp: number) {
  const r = V.rate;
  tone(V, t, f * 1.6 * r, f * r, 0.04, 0.5 * size, 0.004, 0.08 + 0.16 * size);
  const n = noise(V, t, 0.08);
  const g = V.ac.createGain();
  env(g.gain, t, 0.45 * size, 0.002, 0.03 + 0.05 * size);
  n.connect(filter(V.ac, 'lowpass', lp * V.v.bright, 0.6)).connect(g).connect(V.out);
}

/** One small placed piece in a given grain. */
function tick(V: Voice, gr: Grain, g = 1, at = 0) {
  const { ac, out, v } = V;
  const t = V.t + at;
  const r = V.rate;
  const n = noise(V, t, gr.len + 0.01, r);
  const ng = ac.createGain();
  env(ng.gain, t, 0.7 * g, 0.0015, gr.len);
  n.connect(filter(ac, 'bandpass', gr.f * r * v.bright, gr.q)).connect(filter(ac, 'lowpass', gr.lp * v.bright)).connect(ng).connect(out);
  tone(V, t, gr.knock * r * 1.15, gr.knock * r, 0.006, 0.3 * gr.wood * g, 0.002, 0.04);
}

/** The last grain used, so the next tick never repeats it. */
let lastGrain = -1;
const grain = () => {
  const n = nextShape(GRAINS, lastGrain, GRAIN_JITTER);
  lastGrain = n.i;
  return n.s;
};

/** A breathy swell of noise through a moving band, with a wet wobble on it (ink). */
function whoosh(V: Voice, f0: number, f1: number, rise: number, len: number, peak: number) {
  const { ac, out, t, v } = V;
  const n = noise(V, t, len + 0.05);
  const bp = filter(ac, 'bandpass', f0 * v.bright, 1.1);
  bp.frequency.setValueAtTime(f0 * v.bright, t);
  bp.frequency.exponentialRampToValueAtTime(f1 * v.bright, t + len * 0.9);
  // the wobble: the band sways a little, quickly, like liquid
  const lfo = ac.createOscillator();
  lfo.frequency.value = 9 + Math.random() * 5;
  const depth = ac.createGain();
  depth.gain.value = 0.12 * Math.min(f0, f1);
  lfo.connect(depth).connect(bp.frequency);
  lfo.start(t);
  lfo.stop(t + len + 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.exponentialRampToValueAtTime(peak, t + rise);
  g.gain.exponentialRampToValueAtTime(EPS, t + len);
  n.connect(bp).connect(filter(ac, 'lowpass', 1600)).connect(g).connect(out);
  // a little body under it: the dark of the ink
  const b = noise(V, t, len + 0.05, 0.5);
  const bg = ac.createGain();
  bg.gain.setValueAtTime(EPS, t);
  bg.gain.exponentialRampToValueAtTime(peak * 0.9, t + rise);
  bg.gain.exponentialRampToValueAtTime(EPS, t + len);
  b.connect(filter(ac, 'lowpass', 260)).connect(bg).connect(out);
}

export const RECIPES: Record<SoundName, (V: Voice) => void> = {
  // a sheet of heavy paper settles: a dull, low felt thud (the room gives it its dark tail)
  sheet: (V) => thud(V, V.t, 78, 1, 520),
  tick: (V) => tick(V, grain()),
  // a nib dragging across paper: a narrow band of noise, stuttering
  scratch: (V) => {
    const { ac, out, t, v } = V;
    const len = 0.2 + Math.random() * 0.06;
    const n = noise(V, t, len + 0.02);
    const am = ac.createGain();
    am.gain.value = 0.55;
    const saw = ac.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(17 + Math.random() * 4, t);
    saw.frequency.linearRampToValueAtTime(26 + Math.random() * 6, t + len);
    const sd = ac.createGain();
    sd.gain.value = 0.45;
    saw.connect(sd).connect(am.gain);
    saw.start(t);
    saw.stop(t + len + 0.02);
    const g = ac.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.linearRampToValueAtTime(0.35, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(EPS, t + len);
    n.connect(filter(ac, 'bandpass', 950 * v.bright, 1.3)).connect(filter(ac, 'lowpass', 1600)).connect(am).connect(g).connect(out);
  },
  // the claw: a slow servo creak (a low sawtooth, its rate gliding, rung through a narrow band), then it closes softly
  clamp: (V) => {
    const { ac, out, t, v } = V;
    const r = V.rate;
    const creak = ac.createOscillator();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(34 * r, t);
    creak.frequency.exponentialRampToValueAtTime(52 * r, t + 0.16);
    const g = ac.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.04);
    g.gain.linearRampToValueAtTime(0.3, t + 0.14);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.19);
    creak.connect(filter(ac, 'bandpass', 640 * v.bright, 5)).connect(filter(ac, 'lowpass', 1300)).connect(g).connect(out);
    creak.start(t);
    creak.stop(t + 0.2);
    tone(V, t, 140 * r, 175 * r, 0.16, 0.06, 0.03, 0.19); // the motor under it
    thud(V, t + 0.17, 105, 0.55, 650);
  },
  // letting go: a soft breath out, and a faint knock
  release: (V) => {
    const { ac, out, t, v } = V;
    const n = noise(V, t, 0.2);
    const lp = filter(ac, 'lowpass', 1200 * v.bright, 0.8);
    lp.frequency.setValueAtTime(1200 * v.bright, t);
    lp.frequency.exponentialRampToValueAtTime(280, t + 0.16);
    const g = ac.createGain();
    env(g.gain, t, 0.3, 0.012, 0.18);
    n.connect(lp).connect(g).connect(out);
    tone(V, t, 170 * V.rate, 140 * V.rate, 0.02, 0.18, 0.002, 0.06);
  },
  // he runs off into ink: a breathy swell rising through the band, then drained away
  inkOut: (V) => whoosh(V, 300, 1050, 0.36, 0.55, 0.32),
  // he gathers himself out of it: the same breath falling, closing on a tiny wet tick
  inkIn: (V) => {
    whoosh(V, 1000, 330, 0.24, 0.5, 0.28);
    tick(V, { ...GRAINS[1], f: GRAINS[1].f * 0.9 }, 0.6, 0.44);
  },
  // he lands: a small soft thud
  land: (V) => thud(V, V.t, 120, 0.5, 600),
  // a stunt starts: a tiny low flourish, a short swish up over a low glide
  stunt: (V) => {
    const { ac, out, t, v } = V;
    const n = noise(V, t, 0.22);
    const bp = filter(ac, 'bandpass', 360 * v.bright, 1.5);
    bp.frequency.setValueAtTime(360 * v.bright, t);
    bp.frequency.exponentialRampToValueAtTime(760 * v.bright, t + 0.14);
    const g = ac.createGain();
    env(g.gain, t, 0.25, 0.06, 0.2);
    n.connect(bp).connect(g).connect(out);
    tone(V, t, 180 * V.rate, 240 * V.rate, 0.12, 0.08, 0.02, 0.2);
  },
  // sound turned on: one soft low tone
  ui: (V) => {
    tone(V, V.t, 196, 196, 0.01, 0.3, 0.02, 0.85);
    tone(V, V.t, 392, 392, 0.01, 0.035, 0.03, 0.5);
  },
  // a circuit tree link: a faint, dry tick
  hover: (V) => {
    const { ac, out, t, v } = V;
    const n = noise(V, t, 0.014);
    const g = ac.createGain();
    env(g.gain, t, 0.35, 0.0015, 0.009);
    n.connect(filter(ac, 'bandpass', 800 * v.bright, 2.5)).connect(filter(ac, 'lowpass', 1200)).connect(g).connect(out);
  },
};

/** The bed's nodes: `level` is faded in and out; `duck` dips while other sounds play. */
export type Bed = { level: GainNode; duck: GainNode; stop: () => void };

/**
 * The bed: fog breathing. Deep brown noise under a slowly drifting lowpass, a faint band of air above
 * it, and two low sines a hair apart that beat very slowly; all of it swelling on a slow breath.
 * Every period is unrelated to the others, so it never audibly loops.
 */
export function makeBed(ac: BaseAudioContext, out: AudioNode, brown: AudioBuffer, white: AudioBuffer): Bed {
  const t = ac.currentTime;
  const stops: (AudioScheduledSourceNode)[] = [];
  const lfo = (hz: number, depth: number, param: AudioParam) => {
    const o = ac.createOscillator();
    o.frequency.value = hz;
    const g = ac.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(t);
    stops.push(o);
  };
  const breath = ac.createGain();
  breath.gain.value = 1;
  lfo(BED.breath.hz, BED.breath.depth, breath.gain);

  // the air: brown noise, its lowpass drifting
  const air = ac.createBufferSource();
  air.buffer = brown;
  air.loop = true;
  const lp = filter(ac, 'lowpass', BED.air.cut, 0.5);
  lfo(BED.air.lfo, BED.air.swing, lp.frequency);
  air.connect(lp).connect(breath);
  air.start(t, Math.random() * brown.duration);
  stops.push(air);

  // the hiss: a faint band of fog higher up, coming and going on its own slower cycle
  const hiss = ac.createBufferSource();
  hiss.buffer = white;
  hiss.loop = true;
  hiss.playbackRate.value = 0.93;
  const hg = ac.createGain();
  hg.gain.value = BED.hiss.gain;
  lfo(BED.hiss.lfo, BED.hiss.gain * 0.7, hg.gain);
  hiss.connect(filter(ac, 'bandpass', BED.hiss.f, BED.hiss.q)).connect(filter(ac, 'lowpass', 1400)).connect(hg).connect(breath);
  hiss.start(t, Math.random() * white.duration);
  stops.push(hiss);

  // the drone: two low sines a hair apart (they beat slowly)
  const dg = ac.createGain();
  dg.gain.value = BED.drone.gain;
  for (const f of [BED.drone.f, BED.drone.f + BED.drone.beat]) {
    const o = ac.createOscillator();
    o.frequency.value = f;
    o.connect(dg);
    o.start(t);
    stops.push(o);
  }
  dg.connect(breath);

  const duck = ac.createGain();
  const level = ac.createGain();
  level.gain.value = 0;
  breath.connect(duck).connect(level).connect(out);
  return {
    level,
    duck,
    stop: () => {
      for (const s of stops) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      level.disconnect();
    },
  };
}
