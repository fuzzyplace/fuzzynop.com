import { ROOM, type SoundName, type Variation } from './mix';

/**
 * The sounds themselves, synthesised with Web Audio: very short high noise ticks with a small
 * pitched ping under each, nothing below about 2 kHz (low thumps read as the wrong kind of noise).
 * No samples. Each recipe builds its nodes into `out` (the voice's gain) starting at `t`.
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

/** The room: a short, dark, decaying noise tail (a generated impulse response, no file). */
export function makeRoom(ac: BaseAudioContext, seconds = ROOM.seconds): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.25 * (Math.random() * 2 - 1 - lp); // darken
      d[i] = lp * (1 - i / len) ** 3;
    }
  }
  return buf;
}

const EPS = 0.0001;

/** A highpassed noise tick. */
function tick(V: Voice, o: { at?: number; f: number; d: number; g: number }) {
  const { ac, out, v } = V;
  const t = V.t + (o.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = V.noise;
  src.playbackRate.value = V.rate;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = o.f * v.bright;
  const g = ac.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(o.g, t + 0.001);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.001 + o.d);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5, o.d + 0.02);
}

/** A tiny sine ping that gives the tick a pitch. */
function ping(V: Voice, o: { at?: number; f: number; d: number; g: number }) {
  const { ac, out } = V;
  const t = V.t + (o.at ?? 0);
  const osc = ac.createOscillator();
  osc.frequency.value = o.f * V.rate;
  const g = ac.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(o.g, t + 0.002);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.002 + o.d);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.d + 0.03);
}

export const RECIPES: Record<SoundName, (V: Voice) => void> = {
  tick: (V) => {
    tick(V, { f: 4500, d: 0.005, g: 0.18 });
    ping(V, { f: 3100, d: 0.018, g: 0.02 });
  },
  pick: (V) => {
    // the claw catching: two small ticks close together, the second a touch higher
    tick(V, { f: 3500, d: 0.005, g: 0.16 });
    ping(V, { f: 2300, d: 0.014, g: 0.018 });
    tick(V, { at: 0.024, f: 5000, d: 0.004, g: 0.12 });
    ping(V, { at: 0.024, f: 2900, d: 0.012, g: 0.014 });
  },
  ui: (V) => {
    tick(V, { f: 4000, d: 0.004, g: 0.14 });
    ping(V, { f: 2600, d: 0.01, g: 0.02 });
  },
};
