// Single source of copy. Every line must trace to docs/CONTENT.md (v2.4 lines: approved in the interview, docs/NARRATIVE.md).
// Understated. No name-dropping: no employers, conferences, clients, or titles.

// Own profiles only — URLs exactly as listed in docs/CONTENT.md "Allowed links". Link tree: src/content/links.ts.
const LINKEDIN = 'https://www.linkedin.com/in/joshuaaschwartz/';

export const site = {
  name: 'Josh Schwartz',
  handle: 'FuzzyNop',
  url: 'https://fuzzynop.com',
  description:
    'Josh Schwartz (FuzzyNop). Team Builder, Red Teamer, Professional Bogeyman. Finding creative, empathetic security solutions for cyborgs.',
  footerEgg: '0x90 0x90 0x90 · nothing happened here',
  /**
   * The one call to action (HANDOFF §3.5). Mechanism TBD by Z (docs/DECISIONS.md).
   * href: booking link once chosen. fallback: `mailto:` once a public email exists.
   * Until either is set, production shows `neutral`; dev shows a placeholder with a badge.
   */
  cta: {
    label: 'Book time',
    href: null as string | null,
    fallback: null as string | null,
    neutral: { label: 'Message me', via: 'LinkedIn', href: LINKEDIN },
  },
};

/** v2.4: the log replaces Before / Practice / Now. Labels are UI, not claims (open assumption). */
export const nav = [
  { id: 'past', label: 'Past' },
  { id: 'present', label: 'Present' },
  { id: 'future', label: 'Future' },
  { id: 'contact', label: 'Contact' },
] as const;

export const hero = {
  eyebrow: 'Josh Schwartz / FuzzyNop',
  tagline: ['Team Builder,', 'Red Teamer,', 'Professional Bogeyman'],
  lede: 'Finding creative, empathetic security solutions for cyborgs.',
};

/**
 * Z's voice: plain, direct, first person. Written by hand, not generated.
 * Hard rules: no em or en dashes anywhere on the page; no stock phrasing (see docs/CONTENT.md).
 */
export type Chapter = { n: string; id: string; eyebrow: string; title: string; tone?: 'paper' | 'ink'; body: string[]; lede?: string; list?: string[]; coda?: string };

export const past: Chapter = {
  n: '01',
  id: 'past',
  eyebrow: 'Past',
  title: 'Hacker / Executive',
  body: [
    'I started out tracking bad guys. Then I switched sides and played the adversary for a living.',
    'Over time that grew into building teams and leading in the security space.',
  ],
};

export const present: Chapter = {
  n: '02',
  id: 'present',
  eyebrow: 'Present',
  tone: 'ink',
  title: 'The human side',
  body: [
    'Lately I’m working on how hackers take care of their own heads, what AI safety looks like from the human side, and what happens to our minds as machines and humans become indistinguishable.',
  ],
};

/**
 * The pop-out between Present and Future (Z, 2026-11-02): replaces the through-line question.
 * href: The Fuzzy Place (fuzzy.place, from Z's own site).
 */
export const vibe = {
  statement: 'Setting the vibe has never been more important.',
  body: 'I also produce events and spaces with The\u00a0Fuzzy\u00a0Place.', // the name never breaks across lines
  link: { label: 'See the events', href: 'https://fuzzy.place' as string | null, soon: 'link soon' },
};

export const future: Chapter = {
  n: '03',
  id: 'future',
  eyebrow: 'Future',
  tone: 'ink',
  title: 'What I’m looking for',
  body: [],
  lede: 'To make a real impact, building a team, a function or a project around:',
  list: ['Red teaming', 'AI safety', 'Consciousness and human flourishing', 'Mental health and wellness'],
  coda: 'Also available for a full\u2011body robot transplant.', // non-breaking hyphen
};

export const contact: Chapter = {
  n: '04',
  id: 'contact',
  eyebrow: 'Contact',
  title: 'Say hello',
  body: ['If you’re working on any of this, or think I could help, get in touch.'],
};

/** Name of the circuit-tree nav (screen readers) and its small visible label. */
export const elsewhere = { label: 'Elsewhere' };

/** UI labels (not claims). */
export const ui = { skip: 'Skip to content', mark: 'FZNP', markName: 'FuzzyNop', primaryNav: 'Primary' };

/** Appears once, only when the character fully trusts the visitor (docs/NARRATIVE.md). Approved by Z. */
export const trust = { hidden: ['Nothing here is secure.', 'He feels safe anyway.'] };





/** Plate header for the circuit tree; the links themselves live in src/content/links.ts. */

