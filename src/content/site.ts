// Single source of copy. Every line must trace to docs/CONTENT.md (v2.4 lines: approved in the interview, docs/NARRATIVE.md).
// Understated. No name-dropping: no employers, conferences, clients, or titles.

// Own profiles only — URLs exactly as listed in docs/CONTENT.md "Allowed links". Link tree: src/content/links.ts.
const LINKEDIN = 'https://www.linkedin.com/in/joshuaaschwartz/';

export const site = {
  name: 'Josh Schwartz',
  handle: 'FuzzyNop',
  url: 'https://fuzzynop.com',
  description:
    'Josh Schwartz (FuzzyNop). Red teamer, team builder, professional bogeyman. These days, working where humans and machines meet.',
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
    neutral: { label: 'Message me', via: 'LinkedIn', href: LINKEDIN },
  },
};

/** v2.4: the log replaces Before / Practice / Now. Labels are UI, not claims (open assumption). */
export const nav = [
  { id: 'before', label: 'Before' },
  { id: 'practice', label: 'Practice' },
  { id: 'now', label: 'Now' },
  { id: 'contact', label: 'Contact' },
] as const;

export const hero = {
  eyebrow: 'Josh Schwartz — FuzzyNop',
  /** Z's own question, left with the cursor blinking (docs/NARRATIVE.md). */
  question: ['What would', 'happen if'],
  /** Who, in one line: the v2.3 tagline + the approved "these days" line. */
  lede: 'Red teamer, team builder, professional bogeyman. These days, working where humans and machines meet.',
};

/**
 * The page, in Z's voice: quiet first person, plain sentences (copy style locked 2026-11-01).
 * Paragraphs are Z's approved copy (docs/CONTENT.md); lines marked NEW are drafted from the
 * 2026-11-01 interview and await Z's sign-off.
 */
export type Chapter = { n: string; id: string; eyebrow: string; title: string; body: string[]; lede?: string; list?: string[]; listLabel?: string };

export const before: Chapter = {
  n: '01',
  id: 'before',
  eyebrow: 'Before',
  title: 'Hacker. Executive.',
  body: [
    'I spent my career as a hacker and an executive. Red teaming, building teams, leading at the top.',
    // NEW (interview: security is a feeling; the bogeyman; EXP. 01 result approved in round 1)
    'Most of the work was breaking the stories people told themselves about being safe. They felt less safe afterwards. They were safer.',
    'I retired from that world, and what came after wasn’t a pivot so much as a return: to art, to community, to the questions underneath all of it.',
  ],
};

export const practice: Chapter = {
  n: '02',
  id: 'practice',
  eyebrow: 'Practice',
  title: 'I create things.',
  body: [
    'Not as a job title, but as a way of thinking. Interfaces, rituals, small systems that sit at the edge of code and consciousness.',
    'I lead projects and I lead people, and I care about both in the same way.',
  ],
  listLabel: 'What I do',
  list: ['Red teaming', 'Building and leading teams', 'Interfaces, rituals, small systems', 'Art and community'],
};

export const interlude = {
  lead: 'The through-line of my whole career has been the same question:',
  question: 'What happens when humans and machines meet?',
  followUp: 'And how do we stay human in the process?',
};

export const now: Chapter = {
  n: '03',
  id: 'now',
  eyebrow: 'Now',
  title: 'These days.',
  body: [],
  lede: 'I’m working at the intersection of',
  list: ['Consciousness', 'Wellness for hackers', 'AI safety', 'Cyborg psychology'],
};

export const contact: Chapter = {
  n: '04',
  id: 'contact',
  eyebrow: 'Contact',
  title: 'Say hello.',
  body: [
    // NEW (interview: who should feel invited)
    'If you break things for a living, need help building a team, or are making something where people and machines meet, I’d like to hear about it.',
  ],
};

/** Name of the circuit-tree nav (screen readers) and its small visible label. */
export const elsewhere = { label: 'Elsewhere' };

/** UI labels (not claims). */
export const ui = { skip: 'Skip to content', mark: 'FZNP', markName: 'FuzzyNop', primaryNav: 'Primary' };

/** Appears once, only when the character fully trusts the visitor (docs/NARRATIVE.md). Approved by Z. */
export const trust = { hidden: ['Nothing here is secure.', 'He feels safe anyway.'] };





/** Plate header for the circuit tree; the links themselves live in src/content/links.ts. */

