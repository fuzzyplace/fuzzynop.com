import type { ReactNode } from 'react';

type Tone = 'paper' | 'ink';

/**
 * Small hex badge with a section index: machine label. A probe target for the character
 * (`data-poke="spin"`: he taps it and the hex shell spins; a winning probe spins it a full turn).
 */
export function HexBadge({ n, tone = 'paper' }: { n: string; tone?: Tone }) {
  const stroke = tone === 'paper' ? 'stroke-ink' : 'stroke-gray-300';
  const fill = tone === 'paper' ? 'fill-ink' : 'fill-gray-300';
  return (
    <svg width="40" height="35" viewBox="0 0 40 35" aria-hidden="true" className="flex-none" data-poke="spin" data-poke-reach="top" data-poke-win="">
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

/**
 * The one call to action (HANDOFF §3.5): the only filled control on the page.
 * Resolution: booking href → mailto fallback → (prod) neutral "Say hello" via LinkedIn,
 * (dev) a visible placeholder with a dev badge so the gap isn't forgotten.
 * `data-cta` marks it so the character can stand next to it. The `.cta-door` wrapper is a probe
 * target (`data-poke="rattle"`): he rattles it like a locked door; a winning probe cracks it open on
 * its hinge for a moment. The wrapper is layout-neutral (inline-flex around the one control).
 */
function Door({ children }: { children: ReactNode }) {
  return (
    <span className="cta-door" data-poke="rattle" data-poke-reach="side" data-poke-win="">
      {children}
    </span>
  );
}

export function Cta({ cta }: { cta: { label: string; href: string | null; fallback: string | null; neutral: { label: string; via: string; href: string } } }) {
  const target = cta.href ?? cta.fallback;
  if (target) {
    const external = !target.startsWith('mailto:');
    return (
      <Door>
        <a href={target} data-cta="" className="cta-btn type-label-large" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          <span className="cta-label">{cta.label}</span>
          {external && <span aria-hidden="true">↗</span>}
        </a>
      </Door>
    );
  }
  if (import.meta.env.DEV) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Door>
          <span role="link" aria-disabled="true" data-cta="" className="cta-btn cta-btn--placeholder type-label-large">
            <span className="cta-label">{cta.label}</span>
          </span>
        </Door>
        <span className="type-label-small border border-dashed border-gray-500 px-2 py-1 text-on-surface-variant">dev · booking link / email not set</span>
      </div>
    );
  }
  return (
    <Door>
      <a href={cta.neutral.href} target="_blank" rel="noopener noreferrer" data-cta="" className="cta-btn type-label-large">
        <span className="cta-label">{cta.neutral.label}</span>
        <span className="cta-via type-label-small">{cta.neutral.via}</span>
        <span aria-hidden="true">↗</span>
      </a>
    </Door>
  );
}

