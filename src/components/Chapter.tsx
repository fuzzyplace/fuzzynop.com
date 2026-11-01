import type { ReactNode } from 'react';
import type { Chapter as Ch } from '../content/site';
import { PlateHeader } from './ui';

/**
 * One chapter of the page, in Z's voice: header, a few plain paragraphs, an optional list
 * (hex bullets), then anything else the chapter carries (CTA, link tree).
 */
export function Chapter({ ch, children }: { ch: Ch; children?: ReactNode }) {
  return (
    <>
      <PlateHeader n={ch.n} eyebrow={ch.eyebrow} title={ch.title} />
      {ch.body.length > 0 && (
        <div className="type-body-large max-w-[60ch] space-y-5 text-on-paper-variant">
          {ch.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
      {ch.lede && <p className="type-body-large text-on-paper-variant">{ch.lede}</p>}
      {ch.list && (
        <ul aria-label={ch.listLabel} className={`grid border-t border-ink/20 md:grid-cols-2 ${ch.body.length ? 'mt-10' : 'mt-6'}`}>
          {ch.list.map((a) => (
            <li key={a} className="flex items-center gap-4 border-b border-ink/20 py-5 md:odd:pr-6">
              <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="flex-none">
                <polygon points="3.5,0.5 10.5,0.5 13.5,6 10.5,11.5 3.5,11.5 0.5,6" className="fill-ink" />
              </svg>
              <span className="type-title-large">{a}</span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </>
  );
}
