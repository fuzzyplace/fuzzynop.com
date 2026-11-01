/**
 * Prototype switches for Z's review (docs/NARRATIVE.md). Not copy — read once from the URL.
 *   ?hero=fixed (default) | rotate | classic     ?interlude=keep (default) | fold
 */
export type HeroVariant = 'fixed' | 'rotate' | 'classic';
export type InterludeVariant = 'keep' | 'fold';

const param = (k: string) => {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
};
const h = typeof window === 'undefined' ? null : param('hero');
const i = typeof window === 'undefined' ? null : param('interlude');

export const variants = {
  hero: (h === 'rotate' || h === 'classic' ? h : 'fixed') as HeroVariant,
  interlude: (i === 'fold' ? 'fold' : 'keep') as InterludeVariant,
};
