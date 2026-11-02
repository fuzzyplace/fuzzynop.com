/**
 * The sound bus: the only part of the audio code in the main bundle. Hooks in the art engine call
 * `if (sfx.on) sfx.x(...)`; until the visitor turns sound on, `on` is false and every method is a
 * no-op, so a hook costs one property read per frame. The engine (src/audio/engine.ts, its own
 * chunk, loaded only when sound is turned on) swaps the methods in and flips `on`.
 * Arguments are positional (no object per frame).
 */
const nop = (..._: unknown[]) => {};

export type PuppetPose = {
  action?: string;
  phase?: number;
  walk?: number;
  ink?: { k: number; out: boolean };
  stunt?: { kind: string; k: number };
};

export const sfx = {
  on: false,
  /** A named moment from the character's dev event log (`note()` in PuppeteerStage). */
  note: nop as (k: string) => void,
  /** One drawn frame of the character: mode, screen position, out of sight, mood band, patting, the pose drawn. */
  puppet: nop as (mode: string, x: number, y: number, hidden: boolean, band: string, patting: boolean, pose: PuppetPose) => void,
  /** A plate's assembly clock moved from t0 to t1 (plan seconds) during playback. */
  plate: nop as (plan: object, t0: number, t1: number) => void,
  /** A mech arm was posed: its root element (identity) and claw / nozzle tip (its own px). */
  arm: nop as (key: object, x: number, y: number) => void,
  /** A probe target answered (targets.ts): its kind, and whether it was the bigger "win". */
  poke: nop as (kind: string, win: boolean) => void,
};
