import { useImperativeHandle, useState, type Ref } from 'react';
import { trust } from '../content/site';

/**
 * The hidden line: once a session, the first time the character fully trusts the visitor, a small
 * ink slip appears above him, holds a few seconds and fades (docs/NARRATIVE.md). Never explained.
 *
 * The Puppeteer calls `show(x, y)` (viewport px of the slip's bottom centre) once; that's the only
 * state change. The live region is always mounted so screen readers announce the line when it
 * fills. Reduced motion: no fade, it's simply there for a while, then gone.
 */
export type TrustLineHandle = { show: (x: number, y: number) => void };

const KEY = 'fz:trust-line';
/** Already shown this session (sessionStorage can throw: private mode, blocked storage). */
export function trustLineSeen() {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    // no storage: the in-memory guard in the Puppeteer still keeps it to once per page load
  }
}

export function TrustLine({ ref }: { ref?: Ref<TrustLineHandle> }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [done, setDone] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      show(x, y) {
        if (trustLineSeen()) return;
        markSeen();
        setAt({ x, y });
      },
    }),
    [],
  );

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed left-0 top-0 z-30">
      {at && !done && (
        <p
          className="trust-line plate-ink absolute w-max -translate-x-1/2 -translate-y-full px-3 py-2 type-body-small text-gray-300"
          style={{ left: at.x, top: at.y }}
          onAnimationEnd={() => setDone(true)}
        >
          {trust.hidden.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
