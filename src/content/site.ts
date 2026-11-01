// Single source of copy. Every line must trace to docs/CONTENT.md (v2.4 lines: approved in the interview, docs/NARRATIVE.md).
// Understated. No name-dropping: no employers, conferences, clients, or titles.

// Own profiles only — URLs exactly as listed in docs/CONTENT.md "Allowed links". Link tree: src/content/links.ts.
const LINKEDIN = 'https://www.linkedin.com/in/joshuaaschwartz/';

export const site = {
  name: 'Josh Schwartz',
  handle: 'FuzzyNop',
  url: 'https://fuzzynop.com',
  description:
    'Josh Schwartz (FuzzyNop). Hacker, former executive, maker of interfaces, rituals, and small systems at the edge of code and consciousness.',
  footerEgg: '0x90 0x90 0x90 — nothing happened here',
  /**
   * The one call to action (HANDOFF §3.5). Mechanism TBD by Z (docs/DECISIONS.md).
   * href: booking link once chosen. fallback: `mailto:` once a public email exists.
   * Until either is set, production shows `neutral`; dev shows a placeholder with a badge.
   */
  cta: {
    label: 'Book time',
    href: null as string | null,
    fallback: null as string | null,
    neutral: { label: 'Say hello', via: 'LinkedIn', href: LINKEDIN },
  },
};

/** v2.4: the log replaces Before / Practice / Now. Labels are UI, not claims (open assumption). */
export const nav = [
  { id: 'exp-01', label: 'Log' },
  { id: 'exp-04', label: 'Now' },
  { id: 'links', label: 'Links' },
  { id: 'contact', label: 'Contact' },
] as const;

export const hero = {
  eyebrow: 'Josh Schwartz — FuzzyNop',
  /** v2.3 tagline, kept for `?hero=classic` comparison in previews. */
  tagline: ['Red Teamer,', 'Team Builder,', 'Professional Bogeyman'],
  /** v2.4 (docs/NARRATIVE.md): an open question, left with the cursor blinking. Z's own phrasing. */
  question: ['What would', 'happen if'],
  /** `?hero=rotate`: the three questions Z asks, cycled. */
  questions: [
    ['What would', 'happen if'],
    ['What could', 'be'],
    ['Why does it', 'happen that way'],
  ],
};

/**
 * v2.4 experiment log (docs/NARRATIVE.md). Titles, fragments and results approved by Z in the
 * 2026-11-01 interview; fragments are condensed from the approved copy, nothing invented.
 */
export type Experiment = { n: string; id: string; title: string; fragments: string[]; areas?: string[]; result: string[]; pending?: true };
export const experiments: Experiment[] = [
  {
    n: '01',
    id: 'exp-01',
    title: 'Break the story they trust.',
    fragments: ['Red teaming.', 'Hacker. Executive.'],
    result: ['They felt less safe.', 'They were safer.'],
  },
  {
    n: '02',
    id: 'exp-02',
    title: 'Build the people who break it.',
    fragments: ['Building and leading teams.', 'Leading at the top.'],
    result: ['The trust held.', 'The systems didn’t.'],
  },
  {
    n: '03',
    id: 'exp-03',
    title: 'Make something that feels safe.',
    fragments: ['Interfaces, rituals, small systems.', 'Art and community.'],
    result: ['Inconclusive.', 'Repeating.'],
  },
  {
    n: '04',
    id: 'exp-04',
    title: '?',
    fragments: [],
    areas: ['Consciousness', 'Wellness for hackers', 'AI safety', 'Cyborg psychology'],
    result: ['Pending'],
    pending: true, // result ends in a blinking cursor
  },
];
export const log = { eyebrow: 'Exp.', resultLabel: 'Result', untitled: 'Untitled' }; // untitled: screen-reader name for EXP. 04's '?'

/** UI labels (not claims). */
export const ui = { skip: 'Skip to content', mark: 'FZNP', markName: 'FuzzyNop', primaryNav: 'Primary' };

/** Appears once, only when the character fully trusts the visitor (docs/NARRATIVE.md). Approved by Z. */
export const trust = { hidden: ['Nothing here is secure.', 'He feels safe anyway.'] };

export const interlude = {
  question: 'What happens when humans and machines meet?',
  followUp: 'And how do we stay human in the process?',
};




/** Plate header for the circuit tree; the links themselves live in src/content/links.ts. */
export const hubPlate = {
  eyebrow: 'Links',
  title: 'Elsewhere.',
};

export const contact = {
  eyebrow: 'Contact',
  title: 'Say hello.',
};
