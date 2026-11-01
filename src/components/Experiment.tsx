import type { Experiment as Exp } from '../content/site';
import { log } from '../content/site';
import { PlateHeader } from './ui';

/**
 * One entry in the experiment log (docs/NARRATIVE.md): a terse title, a few fragments,
 * and a result line. `hypothesis` (interlude folded in) replaces the fragments on EXP. 04.
 */
export function Experiment({ exp, hypothesis }: { exp: Exp; hypothesis?: string[] }) {
  const pending = !!exp.pending;
  return (
    <>
      <PlateHeader n={exp.n} eyebrow={`${log.eyebrow} ${exp.n}`} title={exp.title} />
      {hypothesis ? (
        <div className="max-w-[28ch] space-y-3">
          {hypothesis.map((l) => (
            <p key={l} className="type-headline-medium text-on-paper">
              {l}
            </p>
          ))}
        </div>
      ) : (
        exp.fragments.length > 0 && (
          <div className="space-y-2">
            {exp.fragments.map((f) => (
              <p key={f} className="type-headline-medium text-on-paper-variant">
                {f}
              </p>
            ))}
          </div>
        )
      )}
      {exp.areas && (
        <ul className="mt-8 grid border-t border-ink/20 md:grid-cols-2">
          {exp.areas.map((a) => (
            <li key={a} className="flex items-center gap-4 border-b border-ink/20 py-5 md:odd:pr-6">
              <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="flex-none">
                <polygon points="3.5,0.5 10.5,0.5 13.5,6 10.5,11.5 3.5,11.5 0.5,6" className="fill-ink" />
              </svg>
              <span className="type-headline-small">{a}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-10 flex gap-6 border-t border-ink/20 pt-5">
        <dt className="type-label-medium pt-1 text-on-paper-variant">{log.resultLabel}</dt>
        <dd className="type-title-large text-on-paper">
          {exp.result.map((r, i) => (
            <span key={r} className="block">
              {r}
              {pending && i === exp.result.length - 1 && (
                <span className="caret" aria-hidden="true">
                  _
                </span>
              )}
            </span>
          ))}
        </dd>
      </dl>
    </>
  );
}
