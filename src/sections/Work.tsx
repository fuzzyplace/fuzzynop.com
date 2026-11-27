import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Depth, HexLattice, Splatter } from '../art/Decor';
import { PrintedPlate, Words } from '../art/PrintedPlate';
import { Chapter } from '../components/Chapter';
import { brief, work } from '../content/site';
import { tie, tieTitle } from '../content/typeset';

/*
 * Work with us (2026-11-19): two plates under Contact. The ink one says what we take on; the paper
 * one is the brief, a short form that collects interest (no payment). It posts to /api/lead on this
 * site. If that fails for any reason the visitor keeps what they wrote: the brief is shown as text
 * to copy, next to the LinkedIn link the Contact plate already uses.
 * The submit is outlined on purpose: the one filled control on the page stays the Contact CTA.
 */

type Values = { name: string; email: string; org: string; need: string; scale: string; notes: string; website: string };
type Status = 'idle' | 'sending' | 'done' | 'failed';
const EMPTY: Values = { name: '', email: '', org: '', need: '', scale: '', notes: '', website: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const f = brief.fields;
const needs = [...work.offers.map((o) => o.name), f.need.other];

/** The brief as plain text, for the copy fallback. */
export const briefText = (v: Values) =>
  [
    [f.name.label, v.name],
    [f.email.label, v.email],
    [f.org.label, v.org],
    [f.need.label, v.need],
    [f.scale.label, v.scale],
    [f.notes.label, v.notes],
  ]
    .filter(([, val]) => val.trim())
    .map(([label, val]) => `${label}${label.endsWith('?') ? '' : ':'} ${val.trim()}`)
    .join('\n');

function Brief({ titleId }: { titleId: string }) {
  const id = useId();
  const [v, setV] = useState<Values>(EMPTY);
  const [bad, setBad] = useState<{ name?: boolean; email?: boolean }>({});
  const [status, setStatus] = useState<Status>('idle');
  const [copied, setCopied] = useState(false);
  const nameEl = useRef<HTMLInputElement>(null);
  const emailEl = useRef<HTMLInputElement>(null);
  const after = useRef<HTMLDivElement>(null);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    if (k === 'name' || k === 'email') setBad((b) => (b[k] ? { ...b, [k]: false } : b));
  };
  // once the result is on the page, move focus to it (screen readers hear it; keyboard users land on it)
  useEffect(() => {
    if (status === 'done' || status === 'failed') after.current?.focus({ preventScroll: status === 'done' });
  }, [status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    const errs = { name: !v.name.trim(), email: !EMAIL.test(v.email.trim()) };
    setBad(errs);
    if (errs.name) return nameEl.current?.focus();
    if (errs.email) return emailEl.current?.focus();
    setStatus('sending');
    try {
      const res = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const out = (await res.json()) as { ok?: boolean };
      setStatus(res.ok && out.ok ? 'done' : 'failed');
    } catch {
      setStatus('failed');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefText(v));
      setCopied(true);
    } catch {
      setCopied(false); // the text is on screen and selectable either way
    }
  };

  if (status === 'done') {
    return (
      <div ref={after} tabIndex={-1} role="status" className="result mt-8">
        <p className="type-title-large text-on-paper">{brief.done.title}</p>
        <p className="type-body-large mt-2 text-on-paper-variant">{brief.done.body}</p>
      </div>
    );
  }

  const sending = status === 'sending';
  return (
    <form className="brief mt-8 grid gap-6 md:grid-cols-2" aria-labelledby={titleId} noValidate onSubmit={submit}>
      <div className="field" data-asm="unit">
        <label htmlFor={`${id}-name`} className="type-label-medium text-on-paper-variant">{f.name.label} <span className="normal-case">({f.required})</span></label>
        <input ref={nameEl} id={`${id}-name`} className="field-input" type="text" autoComplete="name" maxLength={120} required value={v.name} onChange={set('name')} aria-invalid={bad.name || undefined} aria-describedby={bad.name ? `${id}-name-err` : undefined} />
        {bad.name && <p id={`${id}-name-err`} className="field-error type-body-small">{f.name.error}</p>}
      </div>
      <div className="field" data-asm="unit">
        <label htmlFor={`${id}-email`} className="type-label-medium text-on-paper-variant">{f.email.label} <span className="normal-case">({f.required})</span></label>
        <input ref={emailEl} id={`${id}-email`} className="field-input" type="email" autoComplete="email" maxLength={200} required value={v.email} onChange={set('email')} aria-invalid={bad.email || undefined} aria-describedby={bad.email ? `${id}-email-err` : undefined} />
        {bad.email && <p id={`${id}-email-err`} className="field-error type-body-small">{f.email.error}</p>}
      </div>
      <div className="field md:col-span-2" data-asm="unit">
        <label htmlFor={`${id}-org`} className="type-label-medium text-on-paper-variant">{f.org.label}</label>
        <input id={`${id}-org`} className="field-input" type="text" autoComplete="organization" maxLength={160} value={v.org} onChange={set('org')} />
      </div>
      <div className="field" data-asm="unit">
        <label htmlFor={`${id}-need`} className="type-label-medium text-on-paper-variant">{f.need.label}</label>
        <select id={`${id}-need`} className="field-input" value={v.need} onChange={set('need')}>
          <option value="">{f.choose}</option>
          {needs.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="field" data-asm="unit">
        <label htmlFor={`${id}-scale`} className="type-label-medium text-on-paper-variant">{f.scale.label}</label>
        <select id={`${id}-scale`} className="field-input" value={v.scale} onChange={set('scale')}>
          <option value="">{f.choose}</option>
          {f.scale.options.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2" data-asm="unit">
        <label htmlFor={`${id}-notes`} className="type-label-medium text-on-paper-variant">
          {f.notes.label}
        </label>
        <textarea id={`${id}-notes`} className="field-input" rows={4} maxLength={2000} value={v.notes} onChange={set('notes')} />
      </div>
      {/* honeypot: off screen, out of the tab order and the accessibility tree */}
      <div className="field-trap" aria-hidden="true">
        <label htmlFor={`${id}-website`}>{f.trap.label}</label>
        <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:col-span-2" data-asm="place">
        <button type="submit" className="btn-outline type-label-large" disabled={sending}>
          <span className="btn-label">{sending ? brief.sending : brief.submit}</span>
        </button>
        <p className="type-body-small text-on-paper-variant">{brief.privacy}</p>
      </div>
      {status === 'failed' && (
        <div ref={after} tabIndex={-1} role="alert" className="result grid gap-4 md:col-span-2">
          <p className="type-body-large text-on-paper">{brief.failed.body}</p>
          <pre className="field-input type-body-small whitespace-pre-wrap break-words">{briefText(v)}</pre>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="button" className="btn-outline type-label-large" onClick={copy}>
              <span className="btn-label">{copied ? brief.failed.copied : brief.failed.copy}</span>
            </button>
            <a href={brief.failed.link.href} target="_blank" rel="noopener noreferrer" className="vibe-link type-label-large inline-flex min-h-11 items-center gap-2 text-on-paper">
              <span className="vibe-link-label">{brief.failed.link.label}</span>
              <span className="type-label-small text-on-paper-variant">{brief.failed.link.via}</span>
              <span aria-hidden="true" className="text-on-paper-variant">↗</span>
            </a>
          </div>
        </div>
      )}
    </form>
  );
}

export function Work() {
  const titleId = useId();
  return (
    <>
      {/* ---- 05 Work with us: what we take on (black card) ---- */}
      <div className="plate-slot relative grid lg:grid-cols-12">
        <Depth depth={0.6} className="-right-48 -top-28">
          <HexLattice cols={7} rows={7} r={42} tone="far" seed={81} />
        </Depth>
        <PrintedPlate id={work.chapter.id} side="right" tone="ink" className="mx-6 lg:col-span-8 lg:mx-0">
          <Chapter ch={work.chapter}>
            <ul className="mt-10 border-t border-on-surface/20">
              {work.offers.map((o) => (
                <li key={o.name} className="border-b border-on-surface/20 py-5" data-asm="unit">
                  <h3 className="type-title-large text-on-surface">{o.name}</h3>
                  <p className="type-body-medium mt-1 max-w-[58ch] text-on-surface-variant">{tie(o.line)}</p>
                </li>
              ))}
            </ul>
          </Chapter>
        </PrintedPlate>
      </div>

      {/* ---- The brief: collect interest (white card) ---- */}
      <div className="plate-slot relative grid lg:grid-cols-12">
        <Depth depth={0.2} className="-left-10 top-16 hidden lg:block">
          <Splatter size={160} seed={93} />
        </Depth>
        <PrintedPlate side="left" className="mx-6 lg:col-span-8 lg:col-start-5 lg:mx-0">
          <h2 id={titleId} className="type-display-small text-on-paper" data-asm="words" aria-label={brief.title}>
            <Words text={tieTitle(brief.title)} />
          </h2>
          <p className="type-body-large mt-5 max-w-[52ch] text-on-paper-variant" data-asm="lines">
            <Words text={tie(brief.lede)} />
          </p>
          <Brief titleId={titleId} />
        </PrintedPlate>
      </div>
    </>
  );
}
