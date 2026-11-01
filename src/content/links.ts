// Circuit tree links (docs/NARRATIVE.md "Collaboration: the circuit tree").
// To add a link: append one object below; to retire one: set status 'hidden'. The tree re-lays itself out.
//
// Plain JSON-serialisable data on purpose (no functions, no Dates, no imports) so the whole
// `circuit` object can later move to Vercel Edge Config unchanged.
// URLs: ONLY those listed in docs/CONTENT.md "Allowed links". Never invent one; unknown = href null + status 'soon'.

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
  // Branch labels approved by Z (2026-11-01 interview).
  branches: {
    work: { label: 'Work', order: 1 },
    make: { label: 'Make', order: 2 },
  },
  statusLabel: { soon: 'soon', soonSr: ', not yet available' },
  links: [
    { id: 'socials', branch: 'root', label: 'Socials', href: null, status: 'soon', order: 1 },
    { id: 'email', branch: 'root', label: 'Email', href: null, status: 'soon', order: 2 },
    { id: 'linkedin', branch: 'work', label: 'LinkedIn', href: 'https://www.linkedin.com/in/joshuaaschwartz/', status: 'live', order: 1, kind: 'social' },
    { id: 'book', branch: 'work', label: 'Book time', href: null, status: 'soon', order: 2, kind: 'booking' },
    { id: 'soundcloud', branch: 'make', label: 'SoundCloud', href: 'https://soundcloud.com/fuzzynop', status: 'live', order: 1, kind: 'sound' },
    { id: 'spotify', branch: 'make', label: 'Spotify', href: 'https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM', status: 'live', order: 2, kind: 'sound' },
    { id: 'mixcloud', branch: 'make', label: 'Mixcloud', href: 'https://www.mixcloud.com/FZZY/', status: 'live', order: 3, kind: 'sound' },
    { id: 'art', branch: 'make', label: 'Art', href: null, status: 'soon', order: 4, kind: 'art' },
    { id: 'interactive', branch: 'make', label: 'Interactive projects', href: null, status: 'soon', order: 5, kind: 'projects' },
  ],
};
