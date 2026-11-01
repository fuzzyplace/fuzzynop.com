// Single source of copy + links. Every line must trace to docs/CONTENT.md.
// Understated. No name-dropping: no employers, conferences, clients, or titles.

export type Link = { label: string; href: string };

// Own profiles only — URLs exactly as listed in docs/CONTENT.md "Allowed links".
const LINKEDIN = 'https://www.linkedin.com/in/joshuaaschwartz/';
const SOUNDCLOUD = 'https://soundcloud.com/fuzzynop';
const SPOTIFY = 'https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM';
const MIXCLOUD = 'https://www.mixcloud.com/FZZY/';

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

export const nav = [
  { id: 'before', label: 'Before' },
  { id: 'practice', label: 'Practice' },
  { id: 'now', label: 'Now' },
  { id: 'contact', label: 'Contact' },
] as const;

export const hero = {
  eyebrow: 'Josh Schwartz — FuzzyNop',
  tagline: ['Red Teamer,', 'Team Builder,', 'Professional Bogeyman'],
};

export const interlude = {
  question: 'What happens when humans and machines meet?',
  followUp: 'And how do we stay human in the process?',
};

export const before = {
  eyebrow: 'Before',
  title: 'Hacker. Executive.',
  body: [
    'I spent my career as a hacker and an executive. Red teaming, building teams, leading at the top.',
    'I retired from that world, and what came after wasn’t a pivot so much as a return: to art, to community, to the questions underneath all of it.',
  ],
};

export const practice = {
  eyebrow: 'Practice',
  title: 'I create things.',
  body: [
    'Not as a job title, but as a way of thinking. Interfaces, rituals, small systems that sit at the edge of code and consciousness.',
    'I lead projects and I lead people, and I care about both in the same way.',
  ],
  capabilities: [
    'Red teaming',
    'Building and leading teams',
    'Interfaces, rituals, small systems',
    'Art and community',
  ],
};

export const now = {
  eyebrow: 'Now',
  title: 'These days',
  lede: 'Working at the intersection of',
  areas: ['Consciousness', 'Wellness for hackers', 'AI safety', 'Cyborg psychology'],
};

/**
 * Link hub (HANDOFF §3.4). Each entry is one pieced-together hex.
 * href: null = placeholder for Z to fill (rendered hollow, aria-disabled, not focusable).
 * Never invent a URL here — only ones listed in docs/CONTENT.md.
 */
export type HubItem = { label: string; href: string | null; kind: 'social' | 'work' | 'source' | 'sound' };

export const hubPlate = {
  eyebrow: 'Links',
  title: 'Elsewhere.',
};

export const hub: HubItem[] = [
  { label: 'LinkedIn', href: LINKEDIN, kind: 'social' },
  { label: 'SoundCloud', href: SOUNDCLOUD, kind: 'sound' },
  { label: 'Spotify', href: SPOTIFY, kind: 'sound' },
  { label: 'Mixcloud', href: MIXCLOUD, kind: 'sound' },
  { label: 'Notes', href: null, kind: 'work' },
  { label: 'Projects', href: null, kind: 'work' },
  { label: 'Sources', href: null, kind: 'source' },
  { label: 'Archive', href: null, kind: 'source' },
];

export const contact = {
  eyebrow: 'Contact',
  title: 'Say hello.',
};
