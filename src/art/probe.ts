/**
 * Prod and probe: which page target the character tries next, like a red teamer testing the
 * locks. Pure: the stage gathers targets (targets.ts `queryTargets`, plus when it last poked each),
 * its trust band and recent history; this picks one probe or nothing.
 *
 * Daring grows with trust: shaken never probes; wary only looks; tolerant makes small pokes
 * (spin, tug, lift, tap); warm gets hands-on (rattle, peek, twitch) and glances back at the visitor
 * afterwards ("did you see that"). At full trust a probe on a target with a win response sometimes
 * wins (the CTA cracks open, the badge spins a full turn).
 *
 * Caps: at most one probe per 2 explore finds, a cooldown per target, the CTA at most twice a
 * session, never the same kind as one of the last 3 probes.
 */
import type { Rect } from './glyphs';
import type { Pt } from './geometry';

export type ProbeKind = 'spin' | 'lift' | 'peek' | 'tug' | 'rattle' | 'twitch' | 'tap';
export type ProbeReach = 'top' | 'side' | 'dangle';
export type Band = 'shaken' | 'wary' | 'tolerant' | 'warm';
/** look: he goes and inspects it, no touch. poke: a small touch. handsOn: grabs, rattles, lifts. */
export type ProbeAction = 'look' | 'poke' | 'handsOn';

/** `bias` (default 1) scales its appeal: the stage lowers it near the visitor's pointer, 0 rules it out. */
export type ProbeTarget = { id: string; kind: ProbeKind; rect: Rect; reach: ProbeReach; winnable?: boolean; lastPoked?: number | null; bias?: number };
export type ProbeState = {
  now: number; // s
  band: Band;
  full: boolean; // trust is full (trust.ts FULL)
  findsSinceProbe: number; // explore finds since the last probe (or since load)
  recentKinds: ProbeKind[]; // most recent last
  ctaProbes: number; // rattles of the CTA this session
  from?: Pt; // where he is (document px): nearer targets are likelier
};
export type ProbeChoice = { target: ProbeTarget; action: ProbeAction; win: boolean; glanceBack: boolean };

export const SMALL: readonly ProbeKind[] = ['spin', 'tug', 'lift', 'tap'];
export const HANDS_ON: readonly ProbeKind[] = ['rattle', 'peek', 'twitch'];
export const DARING: Record<Band, number> = { shaken: 0, wary: 0.3, tolerant: 0.6, warm: 1.4 };
export const FINDS_PER_PROBE = 2;
export const COOLDOWN = 75; // s per target (60-90 s band, Z to tune)
export const CTA_MAX = 2; // per session
export const WIN_CHANCE = 0.15; // full trust only
export const RECENT = 3; // kinds that can't repeat
const BASE: Record<ProbeKind, number> = { spin: 1.2, tug: 1.2, lift: 1, tap: 0.6, rattle: 1, peek: 0.9, twitch: 0.8 };

const centre = (r: Rect): Pt => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/** What he does to a target of `kind` at this band, or null if it's beyond his daring. */
export function actionFor(kind: ProbeKind, band: Band): ProbeAction | null {
  if (band === 'shaken') return null;
  if (band === 'wary') return 'look';
  if (SMALL.includes(kind)) return 'poke';
  return band === 'warm' ? 'handsOn' : null;
}

/** The next probe, or null (caps, cooldowns or nothing within his daring). `rand` in [0, 1). */
export function chooseProbe(targets: readonly ProbeTarget[], st: ProbeState, rand: () => number = Math.random): ProbeChoice | null {
  const daring = DARING[st.band];
  if (daring <= 0 || st.findsSinceProbe < FINDS_PER_PROBE) return null;
  const recent = st.recentKinds.slice(-RECENT);
  const options = targets.flatMap((t) => {
    const action = actionFor(t.kind, st.band);
    if (!action) return [];
    if (t.lastPoked != null && st.now - t.lastPoked < COOLDOWN) return [];
    if (t.kind === 'rattle' && action !== 'look' && st.ctaProbes >= CTA_MAX) return [];
    if (action !== 'look' && recent.includes(t.kind)) return [];
    const d = st.from ? Math.hypot(centre(t.rect).x - st.from.x, centre(t.rect).y - st.from.y) : 0;
    const weight = (BASE[t.kind] * daring * (action === 'handsOn' ? 0.8 : 1) * Math.max(0, t.bias ?? 1)) / (1 + d / 600);
    return weight > 0 ? [{ t, action, weight }] : [];
  });
  if (!options.length) return null;
  let x = rand() * options.reduce((a, o) => a + o.weight, 0);
  const o = options.find((q) => (x -= q.weight) < 0) ?? options[options.length - 1];
  const win = o.action !== 'look' && st.full && !!o.t.winnable && rand() < WIN_CHANCE;
  return { target: o.t, action: o.action, win, glanceBack: st.band === 'warm' && o.action !== 'look' };
}
