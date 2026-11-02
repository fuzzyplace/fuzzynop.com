import { useEffect, useSyncExternalStore } from 'react';
import { armOnGesture, isOn, setSound, subscribe } from './control';
import { sound } from './copy';

/**
 * The sound toggle: a small icon button in the header, between the mark and the nav (it takes the
 * free space there, so nothing moves when it appears). Off unless the visitor turned it on.
 * `data-sfx-silent`: its own click isn't a ui click (turning on plays its own).
 */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribe, isOn, () => false);
  useEffect(() => armOnGesture(), []);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={sound.label}
      data-sfx-silent=""
      onClick={() =>
        void setSound(!on).then((e) => {
          if (e && !on) e.play('ui');
        })
      }
      className="sfx-toggle ml-2 mr-auto inline-flex min-h-11 min-w-11 items-center justify-center text-gray-300 transition-colors duration-[var(--md-sys-motion-duration-short4)] ease-standard hover:text-on-surface max-[359px]:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {on ? (
          <>
            <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
            <path d="M18 7a7 7 0 0 1 0 10" />
          </>
        ) : (
          <path d="M16 10l4 4M20 10l-4 4" />
        )}
      </svg>
    </button>
  );
}
