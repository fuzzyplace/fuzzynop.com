# Sound (v2.10)

Subtle, muted, organic sound for the page: his breathing, sticky paper footsteps, taps and pokes, ink fizz, the servo whirr and joint clicks of the spider-leg arms, paper slapping down, crisp quiet ui clicks. All synthesised with Web Audio (filtered noise bursts, short tones, soft envelopes); no samples, no assets, no CSP change. Every play varies (pitch about ±1 semitone, about ±1.5 dB, up to 12 ms late, ±12% brightness), so nothing repeats exactly.

## Rules as built
- **Off by default.** A small icon button in the header (between the mark and the nav) turns it on. `aria-pressed`, accessible name "Sound" (placeholder, needs Z), visible focus ring, 44px target, tokens only (gray-300, on-surface on hover). Hidden below 360px wide (no room in the header).
- **The choice is remembered** in `localStorage` (`fz:sound`, guarded with try/catch). With sound left on, the AudioContext is created on the visitor's first press or key after a reload, never before (browsers block it anyway).
- **No AudioContext until the visitor asks.** With sound off it's never created and the engine chunk is never fetched.
- **Reduced motion:** starts off even if stored on; if turned on, no breathing loop (and the character is still, so almost nothing plays).
- **Hidden tab:** the context suspends on `visibilitychange`, resumes when visible (if on). There's no web API for a muted tab, so a tab muted in the browser just plays into the mute.
- **Lazy:** `src/audio/Sound.tsx` (main bundle) mounts the toggle chunk when idle after first paint; the engine is its own chunk, loaded on the first turn-on. Main bundle +0.82 kB raw (+0.33 kB gzip): `index` 293.91 to 294.73 kB.
- **One ticker:** the hooks run inside existing ticker steps and are one property read (`sfx.on`) when off. The breath runs on a `setTimeout` in step with the CSS breath, never a ticker loop; no React state per frame.

## Mix
Voices → per-layer gain (breath 0.32, body 0.8, machine 0.55, ui 0.6) → master 0.5 → limiter (DynamicsCompressor, -20 dB, 14:1, 3 ms attack) → speakers. Voice cap: 8 at once, per layer breath 1 / body 4 / machine 4 / ui 2; the same sound never twice within its gap; a full pool only takes something more important and drops the least important; a newcomer is ducked by `1/sqrt(1 + 0.35 × voices playing)`. Pan follows the on-screen x (character, ui click, an arm's SVG), never past ±0.6.

**Mood colours it** (`MOOD` in `mix.ts`, from his trust band): shaken plays with twice the pitch spread and a 14-20 Hz tremble in the level; wary a little tighter; warm softer (slower attacks, darker filters, a touch quieter).

## Every sound and its trigger
| Sound | Layer | Trigger |
|---|---|---|
| inhale / exhale | breath | idle or sitting, still, on screen, page visible, not reduced motion; timed to `.char-breathe` (4.4 s: rise = inhale, settle = exhale) |
| step | body | each footfall (gait phase 0 and 0.5) while walking, exploring, hopping or in the stunt, gait ≥ 0.25, not in the air; louder as the gait is fuller |
| scuff | body | jump starts; hop |
| scrabble | body | climb starts; stunt "cling" |
| land | body | landing (`land` follow-through) |
| sit | body | sits down |
| tap | body | tap action, glasses push (pitched up, quiet), stunt poke, badge / node probes |
| knock | body | footer `0x90` tap, CTA rattle |
| scratch | body | scratches his head |
| rustle | body | weight shift, crouch, wave, reach; claw lets go |
| swish | body | swat, duck |
| gasp | body | flinch, cower |
| sigh | body | lies down for a nap; turning point into warm |
| shake | body | shakes himself off after re-forming |
| inkOut / inkIn | body | teleport: runs off into drops / gathers again |
| pat | body | a pat starts |
| slide | body | letter play (carry, swap, nudge, spin; stack adds a tap), node tug |
| whirr | machine | an arm's tip moving fast (> 420 px/s for 80 ms, again every 0.3 s while it keeps going); the claw coming down for a press; badge win spin; print arm twitch |
| click | machine | an arm stopping (joint), the claw gripping / letting go, a piece picked up, arms parking, a piece lifted back out (scroll up) |
| windup | machine | arms holding the sheet above its spot; each piece wound up before the press |
| press | machine | each piece pressed into place |
| slap / puff | machine | the sheet lands, its ink puff |
| settle | machine | a big piece settles; badge spin; letter jiggle / flick |
| peel | machine | plate corner lift, peek under; the sheet lifted off (scroll back up) |
| creak | machine | the CTA door swings open (win) |
| ui | ui | any link or button click (nav, CTA, link tree, the toggle turning on) |

Scrubbing the scroll fast plays at most four assembly cues per frame (30 ms apart); a nav jump (no playback) is silent; a jump in plan time over 1.5 s plays only its last moment.

## Where it hooks in
All sound code is in `src/audio/`. Existing files have one-line calls marked `// ---- sfx hook ----`:
- `PuppeteerStage.tsx`: `note()` (named moments, before its dev-only return) and `draw()` (each drawn frame: mode, position, out of sight, mood band, patting, the pose). Everything about his body is derived by diffing frames (`events.ts` `frameCues`).
- `PrintedPlate.tsx`: the scroll clock, during playback only (`plateCues`; `assembly.ts` untouched).
- `MechArm.tsx`: `set()` (tip speed per arm, `ArmTracker`).
- `targets.ts`: `fire()` (every probe response) and `pokeGlyph()`.
- `App.tsx`: mounts `<Sound />` in the header.

## Try it
- Any page: the speaker button in the header, then play with him (press and drag him, wait for him to settle and breathe, scroll the plates in and back out, poke around).
- Audition everything: add `?sfx=board` to a local or preview URL (not fuzzynop.com). The board plays each sound, in any mood, panned anywhere, and "play all, in order". Turning sound on from the board turns the page's sound on too.
- Dev builds: `window.__sfx` has `log` (what played and when), `count`, `band`, `snap`.

## Needs Z
- The toggle's accessible name ("Sound" is a placeholder).
- Loudness, and which sounds to keep. Nothing here has been listened to yet (the build session has no way to hear it).
- Placement below 360px wide (hidden there now).
