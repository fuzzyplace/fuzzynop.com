/**
 * The mix, pure (tested in mix.test.ts): the sound catalogue, how each play varies, where it sits in
 * the stereo field, and the voice cap that keeps it from piling up. No Web Audio here.
 *
 * The palette is dark, quiet and organic: a barely-there breath of fog under everything (the bed),
 * soft felt and paper as the arms build the page, a low creak when the claw takes him, breathy ink
 * when he runs off and gathers again, a nib on the tagline. Nothing bright, nothing musical, and no
 * two plays alike.
 */

export type Layer = 'place' | 'body' | 'ui';

/**
 * layer; min seconds between two plays of the same sound; priority (2 wins a full pool); length s;
 * room: how much of it goes to the shared room (0: dry); level: its trim (linear), set by ear and
 * by measurement (docs/SOUND.md has the numbers).
 */
type Spec = { layer: Layer; gap: number; pri: 1 | 2; dur: number; room: number; level: number };

export const SOUNDS = {
  sheet: { layer: 'place', gap: 0.12, pri: 2, dur: 0.3, room: 0.5, level: 0.26 }, // a plate's sheet lands: felt thud
  tick: { layer: 'place', gap: 0.045, pri: 1, dur: 0.06, room: 0.25, level: 0.54 }, // a piece is placed: paper, ink, wood
  scratch: { layer: 'place', gap: 0.2, pri: 1, dur: 0.3, room: 0.2, level: 0.29 }, // a tagline line is written
  clamp: { layer: 'body', gap: 0.4, pri: 2, dur: 0.34, room: 0.35, level: 0.25 }, // the claw closes on him
  release: { layer: 'body', gap: 0.3, pri: 2, dur: 0.2, room: 0.35, level: 0.45 }, // the claw lets him go
  inkOut: { layer: 'body', gap: 0.4, pri: 2, dur: 0.6, room: 0.4, level: 0.4 }, // he runs off into ink
  inkIn: { layer: 'body', gap: 0.4, pri: 2, dur: 0.6, room: 0.4, level: 0.45 }, // he gathers himself out of it
  land: { layer: 'body', gap: 0.25, pri: 1, dur: 0.16, room: 0.3, level: 0.33 }, // he lands after a fall
  stunt: { layer: 'body', gap: 0.6, pri: 1, dur: 0.24, room: 0.3, level: 0.62 }, // a stunt starts
  ui: { layer: 'ui', gap: 0.1, pri: 2, dur: 0.9, room: 0.3, level: 0.35 }, // sound turned on
  hover: { layer: 'ui', gap: 0.09, pri: 1, dur: 0.02, room: 0, level: 0.75 }, // a circuit tree link is hovered or focused
} satisfies Record<string, Spec>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
export const spec = (n: SoundName): Spec => SOUNDS[n];

/** Layer levels under the master (linear). */
export const LAYER_GAIN: Record<Layer, number> = { place: 0.5, body: 0.5, ui: 0.4 };
/** Master level into the limiter. v2.14: up from 0.3, which was inaudible on laptop and phone speakers. */
export const MASTER = 0.7;
/** The shared room: a long, dark, soft tail (generated, no file). `wet`: its return level. */
export const ROOM = { wet: 0.5, seconds: 1.6, dark: 0.1 };
/** Nothing below this reaches the speakers (subsonic only: the thuds live just above it). */
export const FLOOR_HZ = 45;
/** Nothing above this either: the whole mix is lowpassed here, so it stays dark. */
export const CEILING_HZ = 3500;
/**
 * v2.14: small speakers (laptops, phones) barely reproduce anything under ~300 Hz, where the thuds
 * live: the thuds carry a knock in the band they do play (synth.ts), and the mix gets a gentle lift there.
 */
export const SMALL_SPEAKERS = { lift: { hz: 1100, db: 4, q: 0.8 } };
/** Make-up gain into the limiter (v2.14): peaks land around -14 to -18 dBFS; the limiter (-9 dB) keeps any pile-up in check. */
export const OUTPUT = 2.6;
/** Limiter: a safety net only; at these levels it should rarely touch anything. */
export const LIMIT = { threshold: -9, ratio: 12 };

/**
 * The bed: fog breathing. `level`: its gain (linear) once faded in; `fade`: seconds to fade in;
 * `duck`: what it drops to (share) while another sound plays; `back`: seconds to come back.
 * `air`: the low rumble band's cutoff, `lfo`: its slow drift (Hz); `breath`: the swell (Hz, depth);
 * `drone`: two low sines a hair apart (they beat slowly), and how loud they are next to the air.
 */
export const BED = {
  level: 0.03,
  fade: 4,
  duck: 0.6,
  back: 1.2,
  air: { cut: 300, swing: 110, lfo: 0.061 },
  hiss: { f: 760, q: 0.8, gain: 0.18, lfo: 0.037 },
  breath: { hz: 0.087, depth: 0.35 },
  drone: { f: 82, beat: 0.31, gain: 0.05 },
};

export type Variation = {
  rate: number; // pitch multiplier
  gain: number; // linear multiplier
  delay: number; // s before it starts (timing looseness)
  bright: number; // filter cutoff multiplier
};

/** Ranges for one play: ±1.5 semitones, about ±2 dB, up to 12 ms late, ±18% in filter brightness. */
export const RANGE = { semis: 1.5, db: 2, delay: 0.012, bright: 0.18 };

export function variation(rand: () => number = Math.random): Variation {
  const r = (span: number) => (rand() * 2 - 1) * span;
  return {
    rate: 2 ** (r(RANGE.semis) / 12),
    gain: 10 ** (r(RANGE.db) / 20),
    delay: rand() * RANGE.delay,
    bright: 1 + r(RANGE.bright),
  };
}

/**
 * The grain of one placed piece. `f`/`q`: the band its little burst of noise rings in (Hz); `len`:
 * how long the burst lasts (s); `knock`: a tiny damped low tone under it (Hz) and `wood`: how much of
 * it there is (0..1); `lp`: a lowpass on the whole thing (Hz).
 */
export type Grain = { f: number; q: number; len: number; knock: number; wood: number; lp: number };

/** Five materials: paper, ink, wood, card, felt. All small, low and muted. */
export const GRAINS: readonly Grain[] = [
  { f: 900, q: 1.2, len: 0.014, knock: 230, wood: 0.25, lp: 1700 }, // paper
  { f: 620, q: 2.2, len: 0.02, knock: 180, wood: 0.35, lp: 1300 }, // ink: a soft wet dab
  { f: 760, q: 3.5, len: 0.01, knock: 290, wood: 0.7, lp: 1500 }, // wood
  { f: 1050, q: 1.6, len: 0.012, knock: 260, wood: 0.45, lp: 1900 }, // card
  { f: 520, q: 1, len: 0.024, knock: 160, wood: 0.3, lp: 1100 }, // felt
];
/** Each grain is nudged this much (±, as a share) on every play. */
export const GRAIN_JITTER = 0.15;

/** The next shape from a table: any but the last one, every field nudged by ±jitter. */
export function nextShape<T extends Record<string, number>>(
  table: readonly T[],
  last: number,
  jitter: number,
  rand: () => number = Math.random,
): { i: number; s: T } {
  const n = table.length;
  const i = n > 1 && last >= 0 && last < n ? (last + 1 + Math.floor(rand() * (n - 1))) % n : Math.floor(rand() * n) % n;
  const b = table[i];
  const s = {} as Record<string, number>;
  for (const k of Object.keys(b)) s[k] = b[k] * (1 + (rand() * 2 - 1) * jitter);
  return { i, s: s as T };
}

/** Stereo position for a screen x: gentle, never hard left or right. */
export const PAN_WIDTH = 0.5;
export function panFor(x: number, w: number): number {
  if (!(w > 0) || !Number.isFinite(x)) return 0;
  const p = (x / w) * 2 - 1;
  return Math.max(-1, Math.min(1, p)) * PAN_WIDTH;
}

/**
 * The voice cap. At most `max` voices at once (and a cap per layer); the same sound never twice
 * within its gap (one that comes too soon waits for it, up to `wait` s, rather than being lost); a full pool only takes something more important, and drops the least important.
 * Each admitted voice comes with a duck: the busier the pool, the quieter the newcomer.
 */
export const CAPS: Record<Layer, number> = { place: 3, body: 2, ui: 1 };
export const MAX_VOICES = 5;

type Active = { id: number; name: SoundName; layer: Layer; pri: number; end: number };
/** `at`: when it plays (later than asked if it was held back to keep its gap). */
export type Admit = { id: number; at: number; duck: number; evict: number | null } | null;

export class VoicePool {
  private active: Active[] = [];
  private last = new Map<SoundName, number>();
  private next = 1;
  constructor(
    readonly max = MAX_VOICES,
    readonly caps: Record<Layer, number> = CAPS,
  ) {}

  get size() {
    return this.active.length;
  }
  count(layer: Layer) {
    return this.active.filter((a) => a.layer === layer).length;
  }
  private prune(now: number) {
    this.active = this.active.filter((a) => a.end > now);
  }

  admit(name: SoundName, now: number, dur = spec(name).dur, wait = 0): Admit {
    const s = spec(name);
    this.prune(now);
    const last = this.last.get(name);
    if (last !== undefined && now - last < s.gap) {
      // `last` can be ahead of now (a staggered cue scheduled for later): wait for the gap if it's short
      const held = last + s.gap;
      if (held - now > wait) return null;
      now = held;
    }
    let evict: number | null = null;
    const full = this.active.length >= this.max || this.count(s.layer) >= this.caps[s.layer];
    if (full) {
      // the least important voice in the way (same layer if the layer is what's full)
      const pool = this.count(s.layer) >= this.caps[s.layer] ? this.active.filter((a) => a.layer === s.layer) : this.active;
      const weakest = pool.reduce<Active | null>((w, a) => (!w || a.pri < w.pri || (a.pri === w.pri && a.end < w.end) ? a : w), null);
      if (!weakest || weakest.pri >= s.pri) return null;
      evict = weakest.id;
      this.active = this.active.filter((a) => a.id !== weakest.id);
    }
    const duck = 1 / Math.sqrt(1 + 0.5 * this.active.length);
    const id = this.next++;
    this.active.push({ id, name, layer: s.layer, pri: s.pri, end: now + dur });
    this.last.set(name, now);
    return { id, at: now, duck, evict };
  }
}
