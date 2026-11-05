> **v2.14 update (2026-11-05):** the toggle renders with the page and shows muted until sound is really playing; levels raised for small speakers (see docs/DECISIONS.md, v2.14). Older level numbers below are pre-v2.14.

# Sound (v2.11)

Dark, organic, quiet. A barely-there breath of fog under the page, soft felt and paper as the arms build it, a low creak when the claw takes him, breathy ink when he runs off and gathers himself again, a nib on the tagline. Everything is synthesised with Web Audio (filtered noise and a few low sines): no samples, no assets, no CSP change. The whole mix is lowpassed at 2.8 kHz and sits far below typical UI sounds (loudest single peak about -26 dBFS; the bed about -50 dBFS RMS).

## Palette
| Sound | Trigger | Character |
|---|---|---|
| bed | sound starts (first gesture, or the toggle) | fog breathing: deep brown noise under a slowly drifting lowpass (~300 Hz, 16 s cycle), a faint band of air around 760 Hz on its own 27 s cycle, two low sines at 82 and 82.3 Hz beating slowly, all swelling on an 11 s breath. Fades in over 4 s, dips to 60% under every other sound (except the hover tick) and comes back over about a second. Suspends with the tab. |
| sheet | a plate's sheet lands | a dull felt thud (a sine dropping into ~78 Hz, a puff of noise lowpassed at ~520 Hz) with the most room on it: a dark tail. |
| tick | each piece the arms place (titles, CTA, badge row, each body line) | a small muted tick: a 10 to 25 ms burst of noise in a low band (520 Hz to 1.05 kHz) with a tiny damped knock under it. Five grains (paper, ink, wood, card, felt), never the same one twice in a row, each nudged ±15%. Titles and the CTA sit lower and fuller than body lines. |
| scratch | each hero tagline line as the arm finishes it (only if sound is already running) | a nib dragged across paper: a narrow band of noise around 950 Hz, stuttering at 17 to 32 Hz, about a quarter second. |
| clamp | the claw closes on him (mode becomes `carried`) | a slow servo creak (a gliding low sawtooth rung through a narrow band around 640 Hz, a motor hum under it), then a soft clamp thud. |
| release | the claw lets him go (`carried` → anything) | a soft breath out (lowpass falling 1.2 kHz → 280 Hz) and a faint knock. |
| inkOut | he runs off into ink (teleport, ink-out phase; also the title stunt's run-off) | a breathy swell rising through the band (300 Hz → 1 kHz) with a quick liquid wobble, then drained away. Panned to him. |
| inkIn | he starts gathering himself out of ink | the same breath falling (1 kHz → 330 Hz), closing on a tiny wet tick. Panned to where he reappears. |
| land | he lands after a fall (`falling` → anything but `teleport`) | a small soft thud. |
| stunt | a stunt starts | a tiny low flourish: a short swish up over a low glide. |
| ui | the toggle turning sound on | one soft low tone (196 Hz with a faint octave), 0.85 s. |
| hover | a circuit tree link (`[data-poi="node"]`) is hovered or focused | a faint dry tick, no room. Only when entering a new link; at most one per 90 ms. |

Silent on purpose: his footsteps, breathing, actions, moods, letter play, the probes and pokes, the arms moving through the air, link clicks, scrolling back up.

## Measured (offline, through the real graph)
Rendered in Chromium with an OfflineAudioContext through `graph.ts` (the same chain the engine uses), 6 random variations each at full cue gain. Peak and loudest 50 ms RMS in dBFS; spectral centroid (magnitude-weighted) in Hz; share of energy above 3 kHz.

| Sound | Peak (max) | RMS 50 ms (max) | Centroid (avg / max) | > 3 kHz |
|---|---|---|---|---|
| sheet | -25.6 | -33.0 | 201 / 221 | 0% |
| tick | -25.8 to -30.1 | -42.5 | 680 / 1120 | 0% |
| scratch | -31.7 | -44.4 | 1278 / 1412 | 0.1% |
| clamp | -26.4 | -36.1 | 420 / 462 | 0% |
| release | -30.7 | -41.4 | 797 / 889 | 0% |
| inkOut | -29.4 | -40.2 | 945 / 973 | 0% |
| inkIn | -29.5 | -40.6 | 805 / 894 | 0% |
| land | -29.7 | -39.1 | 273 / 303 | 0% |
| stunt | -32.1 | -40.3 | 1049 / 1107 | 0.1% |
| ui | -28.1 | -32.5 | 216 / 220 | 0% |
| hover | -39.0 | -59.4 | 1099 / 1226 | 0.1% |
| bed (6 to 24 s) | -36.4 | -45.0 (long-term -49.9) | 440 | 0% |
| busy moment (bed + sheet + 3 ticks + clamp + scratch) | -22.5 | -29.9 | 690 | 0% |

For scale: typical OS and app UI sounds peak around -12 to -6 dBFS.

## Rules as built
- **On by default.** Browsers allow no sound before a gesture, so it starts on the visitor's first press, tap or key (pointer, touch end or key; it keeps listening until the context is actually running, which iOS needs). Nothing plays before that, and the AudioContext isn't created before that.
- **The toggle** is a small icon button in the header (between the mark and the nav): `aria-pressed`, accessible name "Sound" (placeholder, needs Z), visible focus ring, 44px target, tokens only. Hidden below 360px wide (no room in the header); sound still follows the stored choice there.
- **Turning it off is remembered** in `localStorage` (`fz:sound` = `0`, guarded with try/catch). Off means no AudioContext and the engine chunk is never fetched. Turning it off mid-visit stops the bed, removes the hover listeners and suspends the context.
- **Reduced motion:** off by default; on only if the visitor turns it on (then remembered).
- **Hidden tab:** the context suspends on `visibilitychange` (bed included), resumes when visible (if on).
- **Lazy:** `src/audio/Sound.tsx` (main bundle) mounts the toggle chunk when idle after first paint; the engine is its own chunk (10.5 kB, 4.0 kB gzip), loaded on the first gesture.
- **One ticker:** the three hooks run inside existing ticker steps and are one property read (`sfx.on`) when off. No React state per frame. The bed is audio-graph only (no per-frame JS).

## Mix
Voices → pan → layer gain (place 0.5, body 0.5, ui 0.4) → master 0.3; each voice also sends (per sound, 0 to 0.5) into one shared room (a generated 1.6 s dark tail, returned at 0.5) → master. Then a lowpass ceiling at 2.8 kHz, a 45 Hz subsonic floor, and a limiter at -24 dB as a safety net (at these levels it rarely touches anything). The bed goes straight into the master. Each sound has its own trim (`level` in `SOUNDS`), set from the measurements above.

At most 5 voices at once (place 3, body 2, ui 1); the same sound never twice within its gap (tick 45 ms, hover 90 ms, sheet 120 ms, claw and ink 300 to 400 ms; a tick that comes too soon waits up to 150 ms for its gap rather than being skipped); a full layer drops its least important voice for a more important one (the claw and ink win over a landing; a sheet wins over a tick); a newcomer is ducked by `1/sqrt(1 + 0.5 × voices playing)`. Every play varies ±1.5 semitones, about ±2 dB, up to 12 ms late and ±18% in filter brightness. Plate cues: forwards only, at most 3 per frame of a fast scroll, a jump (nav link) sounds once. Pan follows the piece or the character, never past ±0.5.

## Where it hooks in
All sound code is in `src/audio/` (`bus.ts` hooks, `control.ts` on/off, `engine.ts`, `graph.ts` the signal path, `mix.ts` catalogue and voice pool, `synth.ts` recipes and bed, `events.ts` pure cue logic). Existing files have one-line calls marked `// ---- sfx hook ----`:
- `PuppeteerStage.tsx`: `draw()` passes his mode, screen x and his ink (`true` running off, `false` gathering): `puppetCues`, `inkCue`.
- `PrintedPlate.tsx`: the scroll clock, during playback only (`plateCues`; `assembly.ts` untouched).
- `Hero.tsx`: `draw()` passes each tagline line's reveal (`writtenCue`).
- `App.tsx`: mounts `<Sound />` in the header.
- The circuit tree's links need no hook: the engine listens for `pointerover` and `focusin` on the document while sound is on.

## Try it
- Any page: press anywhere (sound starts, the bed fades in), scroll the plates in, press and hold him, let go, hover the circuit tree. Reload and press straight away to hear the tagline lines.
- Audition: add `?sfx=board` to a local or preview URL (not fuzzynop.com). Plays every sound, panned anywhere, and turns the bed on or off.
- Dev builds: `window.__sfx` has `log` (what played and when) and `count`.

## Needs Z
- Loudness overall (`MASTER`, `LAYER_GAIN`), each sound's trim (`level` in `SOUNDS`), the bed's level (`BED.level`) and how much it dips (`BED.duck`), and how much room (`ROOM`, per-sound `room`).
- Whether the bed should be on at all, or only after a while on the page.
- The toggle's accessible name ("Sound" is a placeholder), and placement below 360px wide (hidden there now).
- Whether on by default is final (browsers still hold it until the first gesture).
