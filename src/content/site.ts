// Single source of copy + links. Every line must trace to docs/CONTENT.md.
// Understated. No name-dropping: no employers, conferences, clients, or titles.

export type Link = { label: string; href: string };

export const site = {
  name: 'Josh Schwartz',
  handle: 'FuzzyNop',
  url: 'https://fuzzynop.com',
  description:
    'Josh Schwartz (FuzzyNop). Hacker, former executive, maker of interfaces, rituals, and small systems at the edge of code and consciousness.',
  footerEgg: '0x90 0x90 0x90 — nothing happened here',
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

export const contact = {
  eyebrow: 'Contact',
  title: 'Say hello.',
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/joshuaaschwartz/' },
    { label: 'Sound', href: 'https://soundcloud.com/fuzzynop' },
  ] as Link[],
};
