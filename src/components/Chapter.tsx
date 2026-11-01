import type { ReactNode } from 'react';
import { Words } from '../art/PrintedPlate';
import type { Chapter as Ch } from '../content/site';
import { tie, tieTitle } from '../content/typeset';
import { PlateHeader } from './ui';

/**
 * One chapter of the page, in Z's voice: header, a few plain paragraphs, an optional list
 * (hex bullets), then anything else the chapter carries (CTA, link tree).
 * Tone follows the plate: white cards (paper) and black cards (ink) alternate down the page.
 * All running copy goes through tie() so no line ends with a word or two dangling.
 * `data-asm` marks what the plate's arms place (PrintedPlate / assembly.ts): `lines` = running
 * copy, placed a line at a time; `unit` = placed whole (list items).
 */
export function Chapter({ ch, children }: { ch: Ch; children?: ReactNode }) {
  const ink = ch.tone === 'ink';
  const muted = ink ? 'text-on-surface-variant' : 'text-on-paper-variant';
  const rule = ink ? 'border-on-surface/20' : 'border-ink/20';
  return (
    <>
      <PlateHeader n={ch.n} eyebrow={ch.eyebrow} title={tieTitle(ch.title)} tone={ink ? 'ink' : 'paper'} />
      {ch.body.length > 0 && (
        <div className={`type-body-large max-w-[60ch] space-y-5 ${muted}`}>
          {ch.body.map((p) => (
            <p key={p} data-asm="lines">
              <Words text={tie(p)} />
            </p>
          ))}
        </div>
      )}
      {ch.lede && (
        <p className={`type-body-large max-w-[60ch] ${muted}`} data-asm="lines">
          <Words text={tie(ch.lede)} />
        </p>
      )}
      {ch.list && (
        <ul aria-label={ch.listLabel} className={`grid border-t md:grid-cols-2 ${rule} ${ch.body.length ? 'mt-10' : 'mt-6'}`}>
          {ch.list.map((a) => (
            <li key={a} className={`flex items-center gap-4 border-b py-5 md:odd:pr-6 ${rule}`} data-asm="unit">
              <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="flex-none">
                <polygon points="3.5,0.5 10.5,0.5 13.5,6 10.5,11.5 3.5,11.5 0.5,6" className={ink ? 'fill-gray-300' : 'fill-ink'} />
              </svg>
              <span className="type-title-large [text-wrap:balance]">{a}</span>
            </li>
          ))}
        </ul>
      )}
      {ch.coda && (
        <p className={`type-body-large mt-8 max-w-[60ch] ${muted}`} data-asm="lines">
          <Words text={tie(ch.coda)} />
        </p>
      )}
      {children}
    </>
  );
}
