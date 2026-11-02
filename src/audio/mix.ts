/**
 * The mix, pure (tested in mix.test.ts): the sound catalogue, how each play varies, where it sits in
 * the stereo field, and the voice cap that keeps it from piling up. No Web Audio here.
 */

export type Layer = 'breath' | 'body' | 'machine' | 'ui';
export type Band = 'shaken' | 'wary' | 'tolerant' | 'warm';

/** layer, min seconds between two plays of the same sound, priority (3 wins a full pool) */
type Spec = { layer: Layer; gap: number; pri: 1 | 2 | 3; dur: number };

export const SOUNDS = {
  // breath: tied to the idle breathing loop
  inhale: { layer: 'breath', gap: 1.2, pri: 1, dur: 1.9 },
  exhale: { layer: 'breath', gap: 1.2, pri: 1, dur: 2.1 },
  // body: his feet, hands and ink
  step: { layer: 'body', gap: 0.07, pri: 1, dur: 0.08 },
  scuff: { layer: 'body', gap: 0.15, pri: 2, dur: 0.16 },
  land: { layer: 'body', gap: 0.2, pri: 3, dur: 0.24 },
  sit: { layer: 'body', gap: 0.4, pri: 2, dur: 0.3 },
  tap: { layer: 'body', gap: 0.08, pri: 2, dur: 0.06 },
  knock: { layer: 'body', gap: 0.15, pri: 2, dur: 0.2 },
  scratch: { layer: 'body', gap: 0.5, pri: 1, dur: 0.6 },
  rustle: { layer: 'body', gap: 0.25, pri: 1, dur: 0.3 },
  swish: { layer: 'body', gap: 0.12, pri: 2, dur: 0.16 },
  gasp: { layer: 'body', gap: 0.6, pri: 2, dur: 0.3 },
  sigh: { layer: 'body', gap: 1.5, pri: 1, dur: 1.2 },
  shake: { layer: 'body', gap: 0.6, pri: 2, dur: 0.5 },
  inkOut: { layer: 'body', gap: 0.5, pri: 3, dur: 0.7 },
  inkIn: { layer: 'body', gap: 0.5, pri: 3, dur: 0.75 },
  pat: { layer: 'body', gap: 0.5, pri: 2, dur: 0.22 },
  scrabble: { layer: 'body', gap: 0.4, pri: 1, dur: 0.4 },
  slide: { layer: 'body', gap: 0.3, pri: 2, dur: 0.35 },
  // machine: the spider-leg arms and the paper they place
  whirr: { layer: 'machine', gap: 0.28, pri: 1, dur: 0.34 },
  click: { layer: 'machine', gap: 0.06, pri: 2, dur: 0.03 },
  windup: { layer: 'machine', gap: 0.25, pri: 1, dur: 0.2 },
  press: { layer: 'machine', gap: 0.12, pri: 2, dur: 0.07 },
  slap: { layer: 'machine', gap: 0.4, pri: 3, dur: 0.22 },
  puff: { layer: 'machine', gap: 0.4, pri: 1, dur: 0.4 },
  settle: { layer: 'machine', gap: 0.1, pri: 1, dur: 0.04 },
  peel: { layer: 'machine', gap: 0.3, pri: 1, dur: 0.3 },
  creak: { layer: 'machine', gap: 0.8, pri: 2, dur: 0.6 },
  // ui
  ui: { layer: 'ui', gap: 0.04, pri: 3, dur: 0.05 },
} satisfies Record<string, Spec>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
export const spec = (n: SoundName): Spec => SOUNDS[n];

/** Layer levels under the master (linear). Breath sits lowest; it should be felt more than heard. */
export const LAYER_GAIN: Record<Layer, number> = { breath: 0.32, body: 0.8, machine: 0.55, ui: 0.6 };
/** Master level into the limiter. */
export const MASTER = 0.5;

export type Variation = {
  rate: number; // pitch multiplier
  gain: number; // linear multiplier
  delay: number; // s before it starts (timing looseness)
  bright: number; // filter cutoff multiplier
  shake: number; // 0..1 tremolo / stutter depth
  soft: number; // 0..1 slower attack, rounder
};

/** Per-mood colour: shaken plays shakier and tighter, warm plays softer and rounder. */
export const MOOD: Record<Band, { spread: number; gain: number; bright: number; shake: number; soft: number }> = {
  shaken: { spread: 2, gain: 0.85, bright: 1.1, shake: 1, soft: 0 },
  wary: { spread: 1.2, gain: 0.9, bright: 0.95, shake: 0.25, soft: 0.1 },
  tolerant: { spread: 1, gain: 1, bright: 1, shake: 0, soft: 0.3 },
  warm: { spread: 0.8, gain: 0.85, bright: 0.75, shake: 0, soft: 1 },
};

/** Base ranges for one play (before mood): ±1 semitone, about ±1.5 dB, up to 12 ms late, ±12% brightness. */
export const RANGE = { semis: 1, db: 1.5, delay: 0.012, bright: 0.12 };

export function variation(band: Band, rand: () => number = Math.random): Variation {
  const m = MOOD[band] ?? MOOD.tolerant;
  const r = (span: number) => (rand() * 2 - 1) * span;
  return {
    rate: 2 ** (r(RANGE.semis * m.spread) / 12),
    gain: 10 ** (r(RANGE.db) / 20) * m.gain,
    delay: rand() * RANGE.delay * m.spread,
    bright: (1 + r(RANGE.bright)) * m.bright,
    shake: m.shake,
    soft: m.soft,
  };
}

/** Stereo position for a screen x: gentle, never hard left or right. */
export const PAN_WIDTH = 0.6;
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
export const CAPS: Record<Layer, number> = { breath: 1, body: 4, machine: 4, ui: 2 };
export const MAX_VOICES = 8;

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
    const duck = 1 / Math.sqrt(1 + 0.35 * this.active.length);
    const id = this.next++;
    this.active.push({ id, name, layer: s.layer, pri: s.pri, end: now + dur });
    this.last.set(name, now);
    return { id, duck, evict };
  }
}
