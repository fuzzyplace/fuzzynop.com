import { useState } from 'react';
import { createPortal } from 'react-dom';
import { setSound } from './control';
import { SOUND_NAMES, spec, type Layer, type SoundName } from './mix';

/**
 * Dev sound board (`?sfx=board`, never on fuzzynop.com): plays every sound on demand, panned
 * anywhere, so Z can audition them on a preview. Not part of the page; English labels here
 * are dev tooling, not site copy.
 */
const LAYERS: Layer[] = ['place', 'body', 'ui'];

export function Board() {
  const [pan, setPan] = useState(0);
  const [open, setOpen] = useState(true);
  const [bed, setBed] = useState(true);
  const play = async (name: SoundName) => {
    const e = await setSound(true);
    e?.play(name, { pan });
  };
  const all = async () => {
    for (const n of SOUND_NAMES) {
      await play(n);
      await new Promise((r) => setTimeout(r, Math.max(450, spec(n).dur * 1000 + 250)));
    }
  };
  return createPortal(
    <div className="type-label-small fixed bottom-4 left-4 z-50 max-h-[70vh] w-72 overflow-auto border border-gray-700 bg-surface p-3 text-on-surface">
      <div className="flex items-center justify-between gap-2">
        <span>sfx board (dev)</span>
        <button type="button" className="min-h-11 px-2 text-gray-300 hover:text-on-surface" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && (
        <>
          <label className="mt-2 flex items-center justify-between gap-2">
            pan {pan.toFixed(1)}
            <input className="accent-gray-300" type="range" min={-1} max={1} step={0.1} value={pan} onChange={(e) => setPan(Number(e.target.value))} />
          </label>
          <button type="button" className="mt-2 min-h-11 w-full border border-gray-700 px-2 hover:text-on-surface" onClick={() => void all()}>
            play all, in order
          </button>
          {LAYERS.map((l) => (
            <div key={l} className="mt-3">
              <div className="text-gray-400">{l}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {SOUND_NAMES.filter((n) => spec(n).layer === l).map((n) => (
                  <button key={n} type="button" className="min-h-11 border border-gray-700 px-2 hover:text-on-surface" onClick={() => void play(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="mt-3 min-h-11 w-full border border-gray-700 px-2 hover:text-on-surface"
            aria-pressed={bed}
            onClick={async () => {
              const e = await setSound(true);
              e?.setBed(!bed);
              setBed(!bed);
            }}
          >
            bed (fog) {bed ? 'on' : 'off'}
          </button>
          <button type="button" className="mt-2 min-h-11 w-full border border-gray-700 px-2 hover:text-on-surface" onClick={() => void setSound(false)}>
            sound off
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
