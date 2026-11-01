import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { trust } from '../content/site';

/**
 * The hidden line: once a session, the first time the character fully trusts the visitor, a small
 * ink slip appears above him, holds a few seconds and fades (docs/NARRATIVE.md). Never explained.
 *
 * The Puppeteer calls `show(spot)` once with where he is (viewport px); that's the only state change.
 * The slip measures itself and goes above his head if all of it fits below the fixed header (plus a
 * margin), otherwise beside his head on the roomier side; always inside the viewport, never over
 * him. It sits above his feet, i.e. above the top edge of the plate he stands on, so never on its
 * text. The live region is always mounted so screen readers announce the line when it fills.
 * Reduced motion: no fade, it's simply there for a while, then gone.
 */
export type Spot = {
  x: number; // his centre
  head: number; // top of his head
  feet: number; // his feet (the surface he stands on)
  gap: number; // px kept between him and the slip
  half: number; // px: half his width
  top: number; // px: the lowest the slip's top may be (header + margin)
};
export type TrustLineHandle = { show: (spot: Spot) => void };
const EDGE = 16; // px kept from the viewport's sides

/** Where the slip goes (its top-left), given its size and the viewport. Pure. */
export function placeSlip(sp: Spot, w: number, h: number, vw: number) {
  const fitX = (x: number) => Math.min(Math.max(x, EDGE), Math.max(EDGE, vw - EDGE - w));
  if (sp.head - sp.gap - h >= sp.top) return { left: fitX(sp.x - w / 2), top: sp.head - sp.gap - h };
  // no room above: beside his head, on the side with more room, bottom no lower than his feet
  const right = vw - (sp.x + sp.half) >= sp.x - sp.half;
  const left = right ? sp.x + sp.half + sp.gap : sp.x - sp.half - sp.gap - w;
  const top = Math.max(sp.top, Math.min(sp.head, sp.feet - h - sp.gap));
  return { left: fitX(left), top };
}

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
  const [at, setAt] = useState<Spot | null>(null);
  const [done, setDone] = useState(false);
  const slip = useRef<HTMLParagraphElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      show(spot) {
        if (trustLineSeen()) return;
        markSeen();
        setAt(spot);
      },
    }),
    [],
  );

  // measured once, before paint: no flash in the wrong place
  useLayoutEffect(() => {
    const el = slip.current;
    if (!el || !at) return;
    const { left, top } = placeSlip(at, el.offsetWidth, el.offsetHeight, document.documentElement.clientWidth);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [at]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed left-0 top-0 z-30">
      {at && !done && (
        <p
          ref={slip}
          className="trust-line plate-ink absolute w-max max-w-[calc(100vw-2rem)] px-3 py-2 type-body-small text-gray-300"
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
