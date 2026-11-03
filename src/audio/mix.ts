/**
 * The mix, pure (tested in mix.test.ts): the sound catalogue, how each play varies, where it sits in
 * the stereo field, and the voice cap that keeps it from piling up. No Web Audio here.
 *
 * One kind of sound: a soft, rounded mouth pop (a knock of the tongue, a lip pop), played whenever
 * the arms put something on the page, a double one when the claw picks him up, and one for the
 * toggle. No two pops are the same: each takes a different mouth shape from the last, jittered.
 */

export type Layer = 'pop' | 'ui';

/** layer, min seconds between two plays of the same sound, priority (2 wins a full pool), length s */
type Spec = { layer: Layer; gap: number; pri: 1 | 2; dur: number };

export const SOUNDS = {
  pop: { layer: 'pop', gap: 0.045, pri: 1, dur: 0.12 }, // something is placed on the page
  pick: { layer: 'pop', gap: 0.4, pri: 2, dur: 0.17 }, // the claw closes on him
  ui: { layer: 'ui', gap: 0.1, pri: 2, dur: 0.12 }, // sound turned on
} satisfies Record<string, Spec>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
export const spec = (n: SoundName): Spec => SOUNDS[n];

/** Layer levels under the master (linear). */
export const LAYER_GAIN: Record<Layer, number> = { pop: 0.6, ui: 0.45 };
/** Master level into the limiter. */
export const MASTER = 0.45;
/** How much of each pop goes to the room (a short, dark tail: the page has air around it). */
export const ROOM = { wet: 0.18, seconds: 0.8 };
/** Nothing below this reaches the speakers (low rumble is what reads as the wrong kind of noise). */
export const FLOOR_HZ = 150;

export type Variation = {
  rate: number; // pitch multiplier
  gain: number; // linear multiplier
  delay: number; // s before it starts (timing looseness)
  bright: number; // filter cutoff multiplier
};

/** Ranges for one play: ±2 semitones, about ±2 dB, up to 12 ms late, ±20% brightness. */
export const RANGE = { semis: 2, db: 2, delay: 0.012, bright: 0.2 };

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
 * A mouth shape for one pop. `f`: where the round tone settles (Hz); `drop`: it starts this many
 * times higher and falls to `f` in the first few ms (under 1: it rises a little, like a bubble),
 * so what you hear is mostly `f`; `body`/`q`: the
 * hollow the knock rings in; `d`: how long it lasts (s); `click`: how much tongue is in it.
 */
export type Mouth = { f: number; drop: number; body: number; q: number; d: number; click: number };

/** Five mouths, roughly an o, an oo, an ah, a bubble and a cluck. All low and round. */
export const MOUTHS: readonly Mouth[] = [
  { f: 300, drop: 1.45, body: 640, q: 8, d: 0.07, click: 0.5 },
  { f: 270, drop: 1.6, body: 520, q: 10, d: 0.08, click: 0.4 },
  { f: 360, drop: 1.35, body: 820, q: 7, d: 0.06, click: 0.6 },
  { f: 280, drop: 0.85, body: 600, q: 9, d: 0.07, click: 0.35 },
  { f: 330, drop: 1.7, body: 720, q: 11, d: 0.055, click: 0.7 },
];
/** Each mouth is nudged this much (±, as a share) on every play. */
export const MOUTH_JITTER = 0.14;

/** The next mouth: any but the last one, nudged. */
export function nextMouth(last: number, rand: () => number = Math.random): { i: number; m: Mouth } {
  const n = MOUTHS.length;
  const i = last >= 0 && last < n ? (last + 1 + Math.floor(rand() * (n - 1))) % n : Math.floor(rand() * n) % n;
  const j = (x: number) => x * (1 + (rand() * 2 - 1) * MOUTH_JITTER);
  const b = MOUTHS[i];
  return { i, m: { f: j(b.f), drop: 1 + (b.drop - 1) * j(1), body: j(b.body), q: j(b.q), d: j(b.d), click: j(b.click) } };
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
export const CAPS: Record<Layer, number> = { pop: 3, ui: 1 };
export const MAX_VOICES = 4;

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
