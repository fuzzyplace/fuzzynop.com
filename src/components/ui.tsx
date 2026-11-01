import type { ReactNode } from 'react';
import type { Link } from '../content/site';

type Tone = 'paper' | 'ink';

/** External link: muted → full ink/white on hover, 1px orange underline (the only orange in text). */
export function ExternalLink({ href, children, tone = 'ink' }: { href: string; children: ReactNode; tone?: Tone }) {
  const color = tone === 'paper' ? 'text-on-paper-variant hover:text-on-paper' : 'text-on-surface-variant hover:text-on-surface';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`type-label-large inline-flex items-center gap-2 decoration-accent decoration-1 underline-offset-8 transition-colors duration-200 ease-standard hover:underline ${color}`}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

/** Small hex badge with a section index — machine label. */
export function HexBadge({ n, tone = 'paper' }: { n: string; tone?: Tone }) {
  const stroke = tone === 'paper' ? 'stroke-ink' : 'stroke-gray-300';
  const fill = tone === 'paper' ? 'fill-ink' : 'fill-gray-300';
  return (
    <svg width="40" height="35" viewBox="0 0 40 35" aria-hidden="true" className="flex-none">
      <polygon points="10,1 30,1 39,17.5 30,34 10,34 1,17.5" fill="none" className={stroke} strokeWidth="1.5" />
      <text x="20" y="22" textAnchor="middle" className={`${fill} font-mono`} fontSize="11" letterSpacing="1">
        {n}
      </text>
    </svg>
  );
}

export function PlateHeader({ n, eyebrow, title, tone = 'paper' }: { n: string; eyebrow: string; title: ReactNode; tone?: Tone }) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3">
        <HexBadge n={n} tone={tone} />
        <p className={`type-label-medium ${tone === 'paper' ? 'text-on-paper-variant' : 'text-secondary'}`}>{eyebrow}</p>
      </div>
      <h2 className="type-display-small mt-5">{title}</h2>
    </header>
  );
}

export function Prose({ paragraphs, tone = 'paper' }: { paragraphs: string[]; tone?: Tone }) {
  return (
    <div className={`type-body-large max-w-[60ch] space-y-5 ${tone === 'paper' ? 'text-on-paper-variant' : 'text-on-surface-variant'}`}>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

/**
 * The one call to action (HANDOFF §3.5): the only filled control on the page.
 * Resolution: booking href → mailto fallback → (prod) neutral "Say hello" via LinkedIn,
 * (dev) a visible placeholder with a dev badge so the gap isn't forgotten.
 * `data-cta` marks it so the character can stand next to it.
 */
export function Cta({ cta }: { cta: { label: string; href: string | null; fallback: string | null; neutral: { label: string; via: string; href: string } } }) {
  const target = cta.href ?? cta.fallback;
  if (target) {
    const external = !target.startsWith('mailto:');
    return (
      <a href={target} data-cta="" className="cta-btn type-label-large" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        <span className="cta-label">{cta.label}</span>
        {external && <span aria-hidden="true">↗</span>}
      </a>
    );
  }
  if (import.meta.env.DEV) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <span role="link" aria-disabled="true" data-cta="" className="cta-btn cta-btn--placeholder type-label-large">
          <span className="cta-label">{cta.label}</span>
        </span>
        <span className="type-label-small border border-dashed border-gray-500 px-2 py-1 text-on-surface-variant">dev · booking link / email not set</span>
      </div>
    );
  }
  return (
    <a href={cta.neutral.href} target="_blank" rel="noopener noreferrer" data-cta="" className="cta-btn type-label-large">
      <span className="cta-label">{cta.neutral.label}</span>
      <span className="type-label-small text-on-paper-variant">{cta.neutral.via}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function LinkRow({ links, tone = 'paper' }: { links: Link[]; tone?: Tone }) {
  return (
    <ul className="flex flex-wrap gap-x-10 gap-y-4">
      {links.map((l) => (
        <li key={l.href}>
          <ExternalLink href={l.href} tone={tone}>
            {l.label}
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}
