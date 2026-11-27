// Single source of copy. Every line must trace to docs/CONTENT.md (v2.4 lines: approved in the interview, docs/NARRATIVE.md).
// Understated. No name-dropping: no employers, conferences, clients, or titles.

// Own profiles only — URLs exactly as listed in docs/CONTENT.md "Allowed links". Link tree: src/content/links.ts.
const LINKEDIN = 'https://www.linkedin.com/in/joshuaaschwartz/';

export const site = {
  name: 'Josh Schwartz',
  handle: 'FuzzyNop',
  url: 'https://fuzzynop.com',
  description:
    'Josh Schwartz (FuzzyNop). Team Builder, Pink Teamer, Professional Bogeyman. Finding creative, empathetic security solutions for cyborgs.',
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
  // Work with us (2026-11-19). `short` shows where the header has no room for the full label.
  { id: 'work', label: 'Work with us', short: 'Work' },
] as const;

export const hero = {
  eyebrow: 'Josh Schwartz / FuzzyNop',
  tagline: ['Team Builder,', 'Pink Teamer,', 'Professional Bogeyman'],
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
  list: ['Pink teaming', 'AI safety', 'Offensive security strategy', 'Human-centered security'],
  coda: 'Also available for a full\u2011body robot transplant.', // non-breaking hyphen
};

export const contact: Chapter = {
  n: '04',
  id: 'contact',
  eyebrow: 'Contact',
  title: 'Say hello',
  body: ['If you’re working on any of this, or think I could help, get in touch.'],
};

/**
 * Work with us (2026-11-19): the plate under Contact and the brief form after it. Drafted from Z's
 * four starting concepts; no prices or numbers on the page (Z, 2026-11-27). Every line awaits Z's sign-off (docs/CONTENT.md).
 * `enabled: false` removes both plates and the nav item. Nothing else on the page depends on them.
 */
export const work = {
  enabled: true,
  chapter: {
    n: '05',
    id: 'work',
    eyebrow: 'Work with us',
    tone: 'ink',
    title: 'Bring us in',
    body: ['For bigger work I bring people I trust. We shape it around your team.'],
  } satisfies Chapter,
  offers: [
    { name: 'Operator training', line: 'Training for offensive security teams, built around your operators.' },
    { name: 'Method acting for keyboard warriors', line: 'Acting technique for social engineers. How to build a character and hold it under pressure, for authorized testing only.' },
    { name: 'Building a PinkCell', line: 'Standing up a pink team inside your organization. Who to hire, how it runs, what it tests first.' },
    { name: 'Pink Team strategy', line: 'For leaders deciding where pink teaming fits and what to do about it.' },
  ],
};

/**
 * The brief: collects interest, no payment. Posts to /api/lead on this site (a private file per
 * enquiry, the same way the Pink Team workshop site does it). If that fails, the visitor keeps
 * what they wrote: copy it and message on LinkedIn. Labels are UI.
 */
export const brief = {
  title: 'Tell us what you’re working on',
  lede: 'A few lines is enough. One of us will write back.',
  fields: {
    name: { label: 'Name', error: 'Add your name.' },
    email: { label: 'Work email', error: 'Add an email we can reply to.' },
    org: { label: 'Organization' },
    need: { label: 'What you need', other: 'Something else' },
    scale: { label: 'How big is it', options: ['A workshop or short engagement', 'A project over a few months', 'A long-term program', 'Not sure yet'] },
    notes: { label: 'What are you trying to do?' },
    trap: { label: 'Leave this empty' },
    choose: 'Choose one',
    required: 'required',
  },
  submit: 'Send the brief',
  sending: 'Sending',
  privacy: 'We only use this to reply to you.',
  done: { title: 'Got it', body: 'Thank you. One of us will be in touch.' },
  failed: {
    body: 'That didn’t send. Nothing is lost: copy your brief and message me on LinkedIn.',
    copy: 'Copy the brief',
    copied: 'Copied',
    link: { label: 'Message me', via: 'LinkedIn', href: LINKEDIN },
  },
};

/** Name of the circuit-tree nav (screen readers) and its small visible label. */
export const elsewhere = { label: 'Elsewhere' };

/** UI labels (not claims). */
export const ui = { skip: 'Skip to content', mark: 'FZNP', markName: 'FuzzyNop', primaryNav: 'Primary' };

/** Appears once, only when the character fully trusts the visitor (docs/NARRATIVE.md). Approved by Z. */
export const trust = { hidden: ['Nothing here is secure.', 'He feels safe anyway.'] };





/** Plate header for the circuit tree; the links themselves live in src/content/links.ts. */

