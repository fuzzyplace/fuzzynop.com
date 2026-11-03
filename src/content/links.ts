// Circuit tree links (docs/NARRATIVE.md "Collaboration: the circuit tree").
// To add a link: append one object below; to retire one: set status 'hidden'. The tree re-lays itself out.
//
// Plain JSON-serialisable data on purpose (no functions, no Dates, no imports) so the whole
// `circuit` object can later move to Vercel Edge Config unchanged.
// URLs: ONLY those listed in docs/CONTENT.md "Allowed links" (the test checks). Never invent one; unknown = href null + status 'soon'.

export type Branch = 'work' | 'make' | 'root';
export type LinkStatus = 'live' | 'soon' | 'hidden';

export type CircuitLink = {
  id: string; // stable, unique
  branch: Branch; // 'root' hangs straight off the root node
  label: string;
  href: string | null; // null until Z supplies one (must be null unless live)
  status: LinkStatus; // live = clickable · soon = hollow, not focusable · hidden = not rendered
  order: number; // sort within its branch (ascending)
  kind?: string; // free-form tag, not shown
};

export type CircuitData = {
  root: { label: string };
  branches: Record<Exclude<Branch, 'root'>, { label: string; order: number }>;
  statusLabel: { soon: string; soonSr: string };
  links: CircuitLink[];
};

export const circuit: CircuitData = {
  root: { label: 'FZNP' },
  // Branch labels: Work (Z, 2026-11-01); "Play" replaced "Make" (Z, 2026-11-02). Keys stay internal.
  branches: {
    work: { label: 'Work', order: 1 },
    make: { label: 'Play', order: 2 },
  },
  statusLabel: { soon: 'soon', soonSr: ', not yet available' },
  // Links pulled from the original site (legacy/v1) and Z's static redesign branches, organised by Z
  // 2026-11-02. Labels stay neutral: no outlet, employer or conference names on the page.
  links: [
    // root: where to find him
    { id: 'linkedin', branch: 'root', label: 'LinkedIn', href: 'https://www.linkedin.com/in/joshuaaschwartz/', status: 'live', order: 1, kind: 'social' },
    { id: 'x', branch: 'root', label: 'X', href: 'https://x.com/FuzzyNop', status: 'live', order: 2, kind: 'social' },
    { id: 'github', branch: 'root', label: 'GitHub', href: 'https://github.com/fuzzyplace', status: 'live', order: 3, kind: 'social' },
    { id: 'email', branch: 'root', label: 'Email', href: null, status: 'soon', order: 4, kind: 'contact' },
    // work: security
    { id: 'talks', branch: 'work', label: 'Talks', href: 'https://infocondb.org/presenter/josh-schwartz-fuzzynop', status: 'live', order: 1, kind: 'talks' },
    { id: 'interview', branch: 'work', label: 'Interview', href: 'https://www.pcmag.com/opinions/the-head-of-verizon-medias-red-team-has-one-simple-security-tip', status: 'live', order: 2, kind: 'press' },
    { id: 'podcast', branch: 'work', label: 'Podcast', href: 'https://securityconversations.com/episode/josh-schwartz-on-red-teaming-and-proactive-security-engineering/', status: 'live', order: 3, kind: 'press' },
    { id: 'news', branch: 'work', label: 'In the news', href: 'https://www.ksat.com/news/2019/03/14/some-hackers-use-their-skills-for-good-help-with-cybersecurity/', status: 'live', order: 4, kind: 'press' },
    { id: 'book', branch: 'work', label: 'Book time', href: null, status: 'soon', order: 5, kind: 'booking' },
    // play: art and sound
    { id: 'fuzzy-place', branch: 'make', label: 'The Fuzzy Place', href: 'https://fuzzy.place', status: 'live', order: 1, kind: 'art' },
    { id: 'live-set', branch: 'make', label: 'Live set', href: 'https://www.youtube.com/watch?v=E_Jd_RxyoEc', status: 'live', order: 2, kind: 'sound' },
    { id: 'crew', branch: 'make', label: 'The crew', href: 'https://www.skool.com/the-fuzzy-place', status: 'live', order: 3, kind: 'community' },
    { id: 'soundcloud', branch: 'make', label: 'SoundCloud', href: 'https://soundcloud.com/fuzzynop', status: 'live', order: 4, kind: 'sound' },
    { id: 'spotify', branch: 'make', label: 'Spotify', href: 'https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM', status: 'live', order: 5, kind: 'sound' },
    { id: 'mixcloud', branch: 'make', label: 'Mixcloud', href: 'https://www.mixcloud.com/FZZY/', status: 'live', order: 6, kind: 'sound' },
  ],
};

/** What renders: in production only links that exist ("an experiment log only lists what exists"); dev shows everything. */
export const published: CircuitData = import.meta.env.DEV ? circuit : { ...circuit, links: circuit.links.filter((l) => l.status === 'live') };
