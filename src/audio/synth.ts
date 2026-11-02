import type { SoundName, Variation } from './mix';

/**
 * The sounds themselves, synthesised with Web Audio: filtered noise bursts and short tones under
 * soft envelopes. No samples. Each recipe builds its nodes into `out` (the voice's gain) starting
 * at `t`, coloured by the play's variation (pitch, brightness, softness, shake).
 */

export type Voice = { ac: BaseAudioContext; out: AudioNode; t: number; v: Variation; rate: number; noise: AudioBuffer };

/** Two seconds of white noise, made once per context. */
export function makeNoise(ac: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const EPS = 0.0001;

type Burst = {
  at?: number; // s after the voice start
  type?: BiquadFilterType;
  f: number; // filter frequency
  f1?: number; // filter frequency at the end (sweep)
  q?: number;
  a?: number; // attack s
  d: number; // decay s
  g: number; // peak gain
  speed?: number; // noise playback rate (colours it)
};

/** A filtered noise burst with an attack and an exponential decay. */
function burst(V: Voice, b: Burst) {
  const { ac, out, v } = V;
  const t = V.t + (b.at ?? 0);
  const a = Math.max(0.001, (b.a ?? 0.002) * (1 + v.soft * 0.8));
  const src = ac.createBufferSource();
  src.buffer = V.noise;
  src.playbackRate.value = (b.speed ?? 1) * V.rate;
  const f = ac.createBiquadFilter();
  f.type = b.type ?? 'bandpass';
  const bright = v.bright * (1 - v.soft * 0.15);
  f.frequency.setValueAtTime(b.f * bright * V.rate, t);
  if (b.f1) f.frequency.exponentialRampToValueAtTime(b.f1 * bright * V.rate, t + a + b.d);
  f.Q.value = b.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(b.g, t + a);
  g.gain.exponentialRampToValueAtTime(EPS, t + a + b.d);
  src.connect(f).connect(g).connect(out);
  const off = Math.random() * 1.5;
  src.start(t, off, a + b.d + 0.05);
}

type Tone = { at?: number; type?: OscillatorType; f: number; f1?: number; a?: number; d: number; g: number; lp?: number };

/** A short tone with a pitch glide (thumps, clacks, servo blips). */
function tone(V: Voice, o: Tone) {
  const { ac, out, v } = V;
  const t = V.t + (o.at ?? 0);
  const a = Math.max(0.001, (o.a ?? 0.003) * (1 + v.soft));
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f * V.rate, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1 * V.rate, t + a + o.d);
  const g = ac.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(o.g, t + a);
  g.gain.exponentialRampToValueAtTime(EPS, t + a + o.d);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp * v.bright;
    node = osc.connect(f);
  }
  node.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + a + o.d + 0.05);
}

/** A servo: a buzzy tone through a lowpass, wobbling a little, gliding up as it works. */
function servo(V: Voice, o: { f: number; f1: number; d: number; g: number; lp: number; at?: number }) {
  const { ac, out, v } = V;
  const t = V.t + (o.at ?? 0);
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(o.f * V.rate, t);
  osc.frequency.linearRampToValueAtTime(o.f1 * V.rate, t + o.d);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 28 + Math.random() * 10;
  const depth = ac.createGain();
  depth.gain.value = o.f * 0.04 * V.rate;
  lfo.connect(depth).connect(osc.frequency);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = o.lp * v.bright;
  f.Q.value = 2;
  const g = ac.createGain();
  const a = 0.03 * (1 + v.soft);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(o.g, t + a);
  g.gain.setValueAtTime(o.g, t + o.d * 0.6);
  g.gain.exponentialRampToValueAtTime(EPS, t + o.d);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + o.d + 0.05);
  lfo.stop(t + o.d + 0.05);
}

/** A run of small hits at loose intervals (scratching, scrabbling, ink flicked off). */
function run(n: number, gap: [number, number], hit: (at: number, i: number) => void) {
  let at = 0;
  for (let i = 0; i < n; i++) {
    hit(at, i);
    at += gap[0] + Math.random() * (gap[1] - gap[0]);
  }
}

export const RECIPES: Record<SoundName, (V: Voice) => void> = {
  // ---- breath ----
  inhale: (V) => burst(V, { f: 900, f1: 1500, q: 0.8, a: 1.1, d: 0.7, g: 0.09, speed: 0.5 }),
  exhale: (V) => burst(V, { f: 800, f1: 480, q: 0.7, a: 0.25, d: 1.7, g: 0.08, speed: 0.45 }),

  // ---- body ----
  step: (V) => {
    burst(V, { type: 'lowpass', f: 900, q: 0.7, d: 0.045, g: 0.35 }); // the pad of the foot on paper
    burst(V, { at: 0.018 + Math.random() * 0.01, f: 3200, q: 1.2, d: 0.012, g: 0.1 }); // the sticky lift
    if (V.v.shake > 0.5) burst(V, { at: 0.05, f: 2400, q: 1, d: 0.02, g: 0.06 }); // shaky: a little scrape
  },
  scuff: (V) => {
    burst(V, { f: 1400, q: 0.7, a: 0.01, d: 0.12, g: 0.28 });
    burst(V, { f: 700, f1: 900, q: 2, a: 0.02, d: 0.1, g: 0.08, speed: 0.5 }); // a small "hup"
  },
  land: (V) => {
    tone(V, { f: 120, f1: 48, d: 0.18, g: 0.5 - V.v.soft * 0.15 });
    burst(V, { type: 'lowpass', f: 520, q: 0.8, d: 0.12, g: 0.3 });
    burst(V, { at: 0.012, f: 2600, q: 1, d: 0.02, g: 0.06 });
  },
  sit: (V) => {
    burst(V, { f: 2200, q: 0.5, a: 0.04, d: 0.12, g: 0.08 });
    tone(V, { at: 0.09, f: 95, f1: 52, d: 0.14, g: 0.24 });
    burst(V, { at: 0.09, type: 'lowpass', f: 600, d: 0.14, g: 0.22 });
  },
  tap: (V) => {
    burst(V, { f: 2200, q: 3, d: 0.025, g: 0.28 });
    tone(V, { type: 'triangle', f: 640, f1: 520, d: 0.03, g: 0.06 });
  },
  knock: (V) => {
    tone(V, { f: 230, f1: 175, d: 0.09, g: 0.32 });
    burst(V, { f: 900, q: 4, d: 0.05, g: 0.22 });
  },
  scratch: (V) => run(5, [0.06, 0.11], (at, i) => burst(V, { at, type: 'highpass', f: 3000, d: 0.03, g: 0.09 * (1 - i * 0.1) })),
  rustle: (V) => burst(V, { f: 2500, f1: 1800, q: 0.5, a: 0.05, d: 0.2, g: 0.12 }),
  swish: (V) => burst(V, { f: 600, f1: 3000, q: 1.2, a: 0.03, d: 0.1, g: 0.2 }),
  gasp: (V) => burst(V, { f: 1200, f1: 2000, q: 1.5, a: 0.06, d: 0.15, g: 0.13, speed: 0.6 }),
  sigh: (V) => burst(V, { f: 900, f1: 500, q: 1, a: 0.15, d: 0.9, g: 0.11, speed: 0.5 }),
  shake: (V) =>
    run(6, [0.05, 0.075], (at, i) => {
      burst(V, { at, f: 1800 + i * 120, q: 2, d: 0.03, g: 0.14 * (1 - i * 0.12) }); // wet flicks
      if (i % 2) tone(V, { at: at + 0.01, f: 900, f1: 1300, d: 0.025, g: 0.03 });
    }),
  inkOut: (V) => {
    burst(V, { type: 'highpass', f: 4000, a: 0.05, d: 0.55, g: 0.1 }); // fizz
    run(4, [0.1, 0.16], (at, i) => tone(V, { at: 0.08 + at, f: 760 - i * 90, f1: 320, d: 0.05, g: 0.05 })); // drops falling
    burst(V, { at: 0.6, type: 'lowpass', f: 700, d: 0.08, g: 0.18 }); // the puddle
  },
  inkIn: (V) => {
    burst(V, { type: 'highpass', f: 3600, f1: 5200, a: 0.5, d: 0.15, g: 0.1 }); // fizz swelling
    run(4, [0.1, 0.15], (at, i) => tone(V, { at, f: 320 + i * 110, f1: 820 + i * 90, d: 0.045, g: 0.045 })); // drops rising
    burst(V, { at: 0.62, type: 'lowpass', f: 900, d: 0.06, g: 0.14 });
  },
  pat: (V) => {
    burst(V, { type: 'lowpass', f: 700, d: 0.04, g: 0.2 });
    burst(V, { at: 0.11, type: 'lowpass', f: 650, d: 0.04, g: 0.16 });
  },
  scrabble: (V) => run(4, [0.06, 0.1], (at, i) => burst(V, { at, f: 1800 + Math.random() * 600, q: 2, d: 0.02, g: 0.13 * (1 - i * 0.1) })),
  slide: (V) => burst(V, { f: 2400, f1: 3400, q: 0.8, a: 0.05, d: 0.25, g: 0.1 }),

  // ---- machine ----
  whirr: (V) => {
    servo(V, { f: 170, f1: 230, d: 0.3, g: 0.045, lp: 900 });
    burst(V, { type: 'highpass', f: 5000, a: 0.03, d: 0.22, g: 0.012 });
  },
  click: (V) => {
    burst(V, { type: 'highpass', f: 2500, d: 0.008, g: 0.24 });
    tone(V, { type: 'square', f: 1800, d: 0.006, g: 0.025, lp: 4000 });
  },
  windup: (V) => servo(V, { f: 140, f1: 260, d: 0.18, g: 0.035, lp: 800 }),
  press: (V) => {
    burst(V, { f: 1200, q: 2, d: 0.03, g: 0.28 });
    tone(V, { f: 260, f1: 140, d: 0.05, g: 0.14 });
    burst(V, { at: 0.025, type: 'highpass', f: 3000, d: 0.006, g: 0.12 });
  },
  slap: (V) => {
    burst(V, { type: 'lowpass', f: 2200, d: 0.09, g: 0.42 });
    burst(V, { type: 'highpass', f: 3000, d: 0.02, g: 0.14 });
    tone(V, { f: 150, f1: 70, d: 0.1, g: 0.18 });
  },
  puff: (V) => burst(V, { f: 500, f1: 380, q: 0.7, a: 0.03, d: 0.3, g: 0.12, speed: 0.6 }),
  settle: (V) => burst(V, { type: 'highpass', f: 4000, d: 0.006, g: 0.12 }),
  peel: (V) => {
    burst(V, { f: 1800, f1: 4000, q: 0.6, a: 0.1, d: 0.15, g: 0.09 });
    run(3, [0.04, 0.07], (at) => burst(V, { at: 0.05 + at, type: 'highpass', f: 4500, d: 0.005, g: 0.05 }));
  },
  creak: (V) => {
    const { ac, out, v } = V;
    const t = V.t;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(88 * V.rate, t);
    osc.frequency.linearRampToValueAtTime(70 * V.rate, t + 0.5);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 7;
    const depth = ac.createGain();
    depth.gain.value = 6;
    lfo.connect(depth).connect(osc.frequency);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 * v.bright;
    f.Q.value = 6;
    const g = ac.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.1);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.55);
    osc.connect(f).connect(g).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.6);
    lfo.stop(t + 0.6);
  },

  // ---- ui ----
  ui: (V) => {
    burst(V, { type: 'highpass', f: 3500, d: 0.006, g: 0.2 });
    tone(V, { f: 2400, d: 0.012, g: 0.045 });
  },
};
