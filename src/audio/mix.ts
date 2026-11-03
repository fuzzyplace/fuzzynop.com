/**
 * The mix, pure (tested in mix.test.ts): the sound catalogue, how each play varies, where it sits in
 * the stereo field, and the voice cap that keeps it sparse. No Web Audio here.
 *
 * The palette is deliberately small: a tick when a piece of the page is placed, a catch when the
 * claw picks him up, and the toggle's own click. Nothing else he or the arms do makes a sound.
 */

export type Layer = 'tick' | 'ui';

/** layer, min seconds between two plays of the same sound, priority (2 wins a full pool), length s */
type Spec = { layer: Layer; gap: number; pri: 1 | 2; dur: number };

export const SOUNDS = {
  tick: { layer: 'tick', gap: 0.09, pri: 1, dur: 0.03 }, // a piece lands on its plate
  pick: { layer: 'tick', gap: 0.4, pri: 2, dur: 0.05 }, // the claw closes on him
  ui: { layer: 'ui', gap: 0.1, pri: 2, dur: 0.03 }, // sound turned on
} satisfies Record<string, Spec>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
export const spec = (n: SoundName): Spec => SOUNDS[n];

/** Layer levels under the master (linear). */
export const LAYER_GAIN: Record<Layer, number> = { tick: 0.5, ui: 0.4 };
/** Master level into the limiter. */
export const MASTER = 0.4;
/** How much of each tick goes to the room (a short, dark tail: the page has air around it). */
export const ROOM = { wet: 0.22, seconds: 0.9 };

export type Variation = {
  rate: number; // pitch multiplier
  gain: number; // linear multiplier
  delay: number; // s before it starts (timing looseness)
  bright: number; // filter cutoff multiplier
};

/** Ranges for one play: ±0.6 semitone, about ±1.5 dB, up to 8 ms late, ±10% brightness. */
export const RANGE = { semis: 0.6, db: 1.5, delay: 0.008, bright: 0.1 };

export function variation(rand: () => number = Math.random): Variation {
  const r = (span: number) => (rand() * 2 - 1) * span;
  return {
    rate: 2 ** (r(RANGE.semis) / 12),
    gain: 10 ** (r(RANGE.db) / 20),
    delay: rand() * RANGE.delay,
    bright: 1 + r(RANGE.bright),
  };
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
 * within its gap; a full pool only takes something more important, and drops the least important.
 * Each admitted voice comes with a duck: the busier the pool, the quieter the newcomer.
 */
export const CAPS: Record<Layer, number> = { tick: 2, ui: 1 };
export const MAX_VOICES = 3;

type Active = { id: number; name: SoundName; layer: Layer; pri: number; end: number };
export type Admit = { id: number; duck: number; evict: number | null } | null;

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

  admit(name: SoundName, now: number, dur = spec(name).dur): Admit {
    const s = spec(name);
    this.prune(now);
    const last = this.last.get(name);
    if (last !== undefined && now - last < s.gap) return null;
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
    return { id, duck, evict };
  }
}
