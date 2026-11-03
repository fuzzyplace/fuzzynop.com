# Sound (v2.10)

One sound, in many shapes: a soft, rounded mouth pop, low and wide (a tongue knock, a lip pop), every time the arms put something on the page. Each pop is a sine that falls into a low note within its first 6 ms (so what you hear is the note: measured offline, sheets sit around 250 Hz, titles 280, body lines 310, never above 450) plus a 3 ms tongue impulse ringing in a resonant "mouth" (a bandpass between about 450 Hz and 1 kHz), gone within a tenth of a second, with a little dark room behind it. There are five mouth shapes (roughly an o, an oo, an ah, a bubble that rises, a cluck); a pop never uses the same one as the last, every shape is nudged ±14% each time, and each play also varies ±2 semitones, ±2 dB, up to 12 ms late and ±20% in tone. So no two are alike. A highpass floor at 150 Hz keeps out the low rumble the first version had. All synthesised with Web Audio; no samples, no assets, no CSP change.

## Rules as built
- **On by default.** Browsers allow no sound before a gesture, so it starts on the visitor's first press, tap or key (pointer, touch end or key; it keeps listening until the context is actually running, which iOS needs). Nothing plays before that, and the AudioContext isn't created before that.
- **The toggle** is a small icon button in the header (between the mark and the nav): `aria-pressed`, accessible name "Sound" (placeholder, needs Z), visible focus ring, 44px target, tokens only. Hidden below 360px wide (no room in the header); sound still follows the stored choice there.
- **Turning it off is remembered** in `localStorage` (`fz:sound` = `0`, guarded with try/catch). Off means no AudioContext and the engine chunk is never fetched.
- **Reduced motion:** off by default; on only if the visitor turns it on (then remembered).
- **Hidden tab:** the context suspends on `visibilitychange`, resumes when visible (if on).
- **Lazy:** `src/audio/Sound.tsx` (main bundle) mounts the toggle chunk when idle after first paint; the engine is its own chunk (3.6 kB), loaded on the first gesture. Main bundle about +0.8 kB over `release/v2`.
- **One ticker:** the two hooks run inside existing ticker steps and are one property read (`sfx.on`) when off. No React state per frame.

## Mix
Voices → layer gain (pop 0.6, ui 0.45) → master 0.45 → dry + room (generated 0.8 s dark tail, 18% wet) → highpass floor 150 Hz → limiter (-20 dB, 14:1) → speakers. At most 4 voices at once (3 pops, 1 ui); the same sound never twice within its gap (pop 45 ms, pick 400 ms; a pop that comes too soon waits up to 150 ms for its gap rather than being skipped); a full pool drops a pop for a pick; a newcomer is ducked by `1/sqrt(1 + 0.5 × voices playing)`. Pan follows the piece or the character, never past ±0.5.

## Every sound and its trigger
| Sound | Trigger |
|---|---|
| pop | anything the arms put on the page as you scroll: the sheet landing (lowest), each title, the CTA and the badge row (round and full), each body line (smaller, a little higher). 58 pieces across the page plus 5 sheets. Forwards only: scrolling back up is silent. At most 3 per frame of a fast scroll; a jump (nav link) pops once. |
| pop | each line of the hero tagline as the arm finishes writing it (only if sound is already running: it's written before most people press anything). |
| pick | the claw closes on him after you press him: two pops close together, the second smaller and higher. Letting go is silent. |
| ui | the toggle turning sound on (so you know it worked). |

Silent on purpose: his footsteps, breathing, actions, moods, teleports, letter play, the probes and pokes, the arms moving through the air, link clicks.

## Where it hooks in
All sound code is in `src/audio/`. Existing files have one-line calls marked `// ---- sfx hook ----`:
- `PuppeteerStage.tsx`: `draw()` passes his mode and screen x (`pickCue`).
- `PrintedPlate.tsx`: the scroll clock, during playback only (`plateCues`; `assembly.ts` untouched).
- `Hero.tsx`: `draw()` passes each tagline line's reveal (`writtenCue`).
- `App.tsx`: mounts `<Sound />` in the header.

## Try it
- Any page: press anywhere (sound starts), scroll the plates in, press and hold him. Reload and press straight away to hear the tagline lines.
- Audition: add `?sfx=board` to a local or preview URL (not fuzzynop.com). Plays each sound, panned anywhere.
- Dev builds: `window.__sfx` has `log` (what played and when) and `count`.

## Needs Z
- Loudness (`LAYER_GAIN`, `MASTER` in `mix.ts`), how much room (`ROOM`), and the five mouth shapes (`MOUTHS`: note, fall, hollow, length, how much tongue).
- The toggle's accessible name ("Sound" is a placeholder), and placement below 360px wide (hidden there now).
- Whether on by default is final (browsers still hold it until the first gesture).
