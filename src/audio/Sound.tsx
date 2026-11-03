import { useEffect, useState, type ComponentType } from 'react';
import { whenIdle } from '../art/ticker';

/**
 * Sound, deferred like the character stage: the toggle is its own chunk, fetched once the page has
 * painted and the main thread is idle; the engine is another, fetched only when sound is turned on.
 * Until then nothing renders here. `?sfx=board` (anywhere but fuzzynop.com) adds the dev sound board.
 */
const board = () => /(?:^|[?&])sfx=board(?:&|$)/.test(location.search) && !/(^|\.)fuzzynop\.com$/.test(location.hostname);

export function Sound() {
  const [Toggle, setToggle] = useState<ComponentType | null>(null);
  const [Board, setBoard] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    const off = whenIdle(() => {
      import('./SoundToggle').then((m) => live && setToggle(() => m.SoundToggle));
      if (board()) import('./Board').then((m) => live && setBoard(() => m.Board));
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return (
    <>
      {Toggle && <Toggle />}
      {Board && <Board />}
    </>
  );
}
