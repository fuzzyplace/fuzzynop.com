/**
 * The sound bus: the only part of the audio code in the main bundle. Hooks in the art engine call
 * `if (sfx.on) sfx.x(...)`; until sound is running, `on` is false and every method is a no-op, so a
 * hook costs one property read per frame. The engine (src/audio/engine.ts, its own chunk) swaps the
 * methods in and flips `on`. Arguments are positional (no object per frame).
 */
const nop = (..._: unknown[]) => {};

export const sfx = {
  on: false,
  /**
   * One drawn frame of the character: his mode, screen x, and his ink (true: running off into it,
   * false: gathering back out of it, undefined: not in ink). Cues come from the changes.
   */
  puppet: nop as (mode: string, x: number, ink?: boolean) => void,
  /** A plate's assembly clock moved from t0 to t1 (plan seconds) during playback (a sound per thing placed). */
  plate: nop as (plan: object, t0: number, t1: number) => void,
  /** One drawn frame of the hero: each tagline line's reveal (0..1) (a scratch as each line is finished). */
  written: nop as (q: readonly number[]) => void,
};
