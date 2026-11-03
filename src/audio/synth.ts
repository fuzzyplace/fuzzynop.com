import { nextMouth, ROOM, type Mouth, type SoundName, type Variation } from './mix';

/**
 * The sounds themselves, synthesised with Web Audio: a rounded mouth pop. A sine that falls fast
 * into its note (the round part) and a tiny noise impulse ringing in a resonant bandpass (the
 * tongue knocking in a hollow), both gone within a tenth of a second. No samples. Each recipe
 * builds its nodes into `out` (the voice's gain) starting at `t`; every pop takes a new mouth.
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
/** s: the fall into the note, and the swell of the round part. */
const GLIDE = 0.006;

/** One pop in the given mouth, scaled by `g`. */
function pop(V: Voice, m: Mouth, g: number, at = 0) {
  const { ac, out, v } = V;
  const t = V.t + at;
  const r = V.rate;
  // the round part: falls (or rises a touch) into its note in the first few ms, while it's still
  // swelling, so what rings is the low note and not the start of the fall
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(m.f * m.drop * r, t);
  osc.frequency.exponentialRampToValueAtTime(m.f * r, t + GLIDE);
  const og = ac.createGain();
  og.gain.setValueAtTime(EPS, t);
  og.gain.linearRampToValueAtTime(0.32 * g, t + GLIDE);
  og.gain.exponentialRampToValueAtTime(EPS, t + m.d);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + m.d + 0.02);
  // the knock: a 3 ms tongue impulse ringing in the mouth's hollow
  const src = ac.createBufferSource();
  src.buffer = V.noise;
  src.playbackRate.value = r;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = m.body * r * v.bright;
  bp.Q.value = m.q;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(EPS, t);
  ng.gain.linearRampToValueAtTime(m.click * g * 2.2, t + 0.0008);
  ng.gain.exponentialRampToValueAtTime(EPS, t + 0.003);
  src.connect(ng).connect(bp).connect(out);
  src.start(t, Math.random() * 1.5, 0.01);
}

/** The last mouth used, so the next pop never repeats it. */
let last = -1;
const mouth = () => {
  const n = nextMouth(last);
  last = n.i;
  return n.m;
};

export const RECIPES: Record<SoundName, (V: Voice) => void> = {
  pop: (V) => pop(V, mouth(), 1),
  pick: (V) => {
    // the claw catching him: two pops close together, the second smaller and a touch higher
    pop(V, mouth(), 1);
    const m = mouth();
    pop(V, { ...m, f: m.f * 1.12, body: m.body * 1.1 }, 0.6, 0.04);
  },
  ui: (V) => pop(V, mouth(), 0.7),
};
