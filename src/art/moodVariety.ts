/**
 * Anti-repeat picks: weighted-random choices that avoid the last few things chosen, so the
 * character never does the same thing twice in a row (and rarely the same thing three times in
 * five). Pure: the caller keeps the `recent` list (most recent first) and passes a `rand`.
 *
 * Shared on purpose: fidgets, mood reactions, greetings and anything else that should feel
 * unrepeated can use it. `variety()` wraps the bookkeeping for callers that don't want to.
 */
export type Weights<T extends string> = Partial<Record<T, number>>;

/**
 * Pick one key of `weights` (weight > 0), never one of the last `avoid` in `recent`. If that rules
 * out everything, it relaxes: the oldest of the recent picks becomes allowed again first, so a
 * small pool rotates instead of repeating. Undefined only when no weight is positive.
 */
export function pickVaried<T extends string>(weights: Weights<T>, recent: readonly T[], rand: () => number, avoid = 2): T | undefined {
  const keys = (Object.keys(weights) as T[]).filter((k) => (weights[k] ?? 0) > 0);
  if (!keys.length) return undefined;
  for (let n = Math.min(avoid, recent.length); n >= 0; n--) {
    const banned = recent.slice(0, n);
    const pool = keys.filter((k) => !banned.includes(k));
    if (!pool.length) continue;
    const total = pool.reduce((t, k) => t + (weights[k] ?? 0), 0);
    let r = rand() * total;
    for (const k of pool) {
      r -= weights[k] ?? 0;
      if (r <= 0) return k;
    }
    return pool[pool.length - 1];
  }
  return keys[0];
}

/** `pick` at the front of `recent`, at most `max` long (most recent first). */
export const noteRecent = <T>(recent: readonly T[], pick: T, max = 3): T[] => [pick, ...recent.filter((r) => r !== pick)].slice(0, max);

/** Stateful convenience: remembers its own recent picks. */
export function variety<T extends string>(avoid = 2, keep = Math.max(3, avoid)) {
  let recent: T[] = [];
  return {
    pick(weights: Weights<T>, rand: () => number): T | undefined {
      const k = pickVaried(weights, recent, rand, avoid);
      if (k !== undefined) recent = noteRecent(recent, k, keep);
      return k;
    },
    get recent(): readonly T[] {
      return recent;
    },
  };
}
