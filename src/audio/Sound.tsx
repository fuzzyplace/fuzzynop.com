import { useEffect, useState, type ComponentType } from 'react';
import { SoundToggle } from './SoundToggle';

/**
 * Sound, deferred like the character stage: the toggle is its own chunk, fetched once the page has
 * painted and the main thread is idle; the engine is another, fetched only when sound is turned on.
 * Until then nothing renders here. `?sfx=board` (anywhere but fuzzynop.com) adds the dev sound board.
 */
const board = () => /(?:^|[?&])sfx=board(?:&|$)/.test(location.search) && !/(^|\.)fuzzynop\.com$/.test(location.hostname);

export function Sound() {
  // v2.14: the toggle is part of the page (tiny); only the engine and the dev board load lazily
  const [Board, setBoard] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    if (board()) import('./Board').then((m) => live && setBoard(() => m.Board));
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <SoundToggle />
      {Board && <Board />}
    </>
  );
}
