# Sound (v2.10)

Minimal and atmospheric: a quiet tick when a key piece of the page (a title, the CTA, the badges) is placed, a small catch when the claw picks him up, and nothing else. Every sound is a few milliseconds of high, filtered noise with a tiny pitched ping under it, sent into a short dark room tail so the page has some air around it. Nothing sits below about 2 kHz (the first pass had low thumps and noise bursts that read as the wrong kind of noise; they're gone). All synthesised with Web Audio; no samples, no assets, no CSP change. Every play varies a little (about ±0.6 semitone, ±1.5 dB, up to 8 ms late, ±10% brightness).

## Rules as built
- **On by default.** Browsers allow no sound before a gesture, so it starts on the visitor's first press, tap or key (pointer, touch end or key; it keeps listening until the context is actually running, which iOS needs). Nothing plays before that, and the AudioContext isn't created before that.
- **The toggle** is a small icon button in the header (between the mark and the nav): `aria-pressed`, accessible name "Sound" (placeholder, needs Z), visible focus ring, 44px target, tokens only. Hidden below 360px wide (no room in the header); sound still follows the stored choice there.
- **Turning it off is remembered** in `localStorage` (`fz:sound` = `0`, guarded with try/catch). Off means no AudioContext and the engine chunk is never fetched.
- **Reduced motion:** off by default; on only if the visitor turns it on (then remembered).
- **Hidden tab:** the context suspends on `visibilitychange`, resumes when visible (if on).
- **Lazy:** `src/audio/Sound.tsx` (main bundle) mounts the toggle chunk when idle after first paint; the engine is its own chunk (3.6 kB), loaded on the first gesture. Main bundle about +0.8 kB over `release/v2`.
- **One ticker:** the two hooks run inside existing ticker steps and are one property read (`sfx.on`) when off. No React state per frame.

## Mix
Voices → layer gain (tick 0.5, ui 0.4) → master 0.4 → dry + room (generated 0.9 s dark tail, 22% wet) → limiter (-20 dB, 14:1) → speakers. At most 3 voices at once (2 ticks, 1 ui); the same sound never twice within its gap (tick 90 ms, pick 400 ms); a full pool drops a tick for a pick; a newcomer is ducked by `1/sqrt(1 + 0.5 × voices playing)`. Pan follows the piece or the character, never past ±0.5.

## Every sound and its trigger
| Sound | Trigger |
|---|---|
| tick | a key piece of a plate lands in its slot as you scroll: the carried ones (titles, the CTA, the badge row), 14 across the page. Body lines are placed in silence (44 of them; ticking each made the plates chatter). Forwards only: scrolling back up is silent. At most 2 per frame of a fast scroll; a jump (nav link) ticks once. |
| pick | the claw closes on him after you press him (grabbed → carried). Letting go is silent. |
| ui | the toggle turning sound on (so you know it worked). |

Silent on purpose: his footsteps, breathing, actions, moods, teleports, letter play, the probes and pokes, the arms moving, the sheet landing, link clicks, the hero tagline (it's written before anyone has pressed anything, so it couldn't play anyway).

## Where it hooks in
All sound code is in `src/audio/`. Existing files have one-line calls marked `// ---- sfx hook ----`:
- `PuppeteerStage.tsx`: `draw()` passes his mode and screen x (`pickCue`).
- `PrintedPlate.tsx`: the scroll clock, during playback only (`plateCues`; `assembly.ts` untouched).
- `App.tsx`: mounts `<Sound />` in the header.

## Try it
- Any page: press anywhere (sound starts), scroll the plates in, press and hold him.
- Audition: add `?sfx=board` to a local or preview URL (not fuzzynop.com). Plays each sound, panned anywhere.
- Dev builds: `window.__sfx` has `log` (what played and when) and `count`.

## Needs Z
- Loudness of the ticks (`LAYER_GAIN`, `MASTER` in `mix.ts`), and how much room (`ROOM`).
- The toggle's accessible name ("Sound" is a placeholder), and placement below 360px wide (hidden there now).
- Whether on by default is final (browsers still hold it until the first gesture).
