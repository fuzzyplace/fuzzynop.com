# Design system — FZNP / Cyborg Dark v2.2

Material 3 **structure** (color roles, type scale, shape, state layers, motion tokens), re-skinned for a dark cyborg aesthetic: elegant machine × human futurism. Black, white, and gray. Traffic-cone orange as a whisper — a subtle highlight, never a block.

Source of truth: `design/tokens.json` → mirrored in `src/styles/tokens.css` → exposed as Tailwind utilities.

## Art direction — ink, paper, machine (v2.2)
Reference mood: *Limbo* (fog-lit grayscale, black paper-cut silhouettes, depth through tone) crossed with the *Westworld* title sequence (machine arms constructing a body). Ours is original art — never copy either.

**Stage.** A fixed fog light (`.fog`, light at 70% / 36%) falls off to black at the edges. Film grain overlay (`.grain`). Everything else is a silhouette in front of it.

**Depth (three tones = 3D from flat shapes).**
| Layer | Fill | Filter | Parallax (`<Depth depth>`) |
|---|---|---|---|
| far | `silhouette-far` #2C2C2A | `#far` blur 3px | 0.6–0.8 |
| mid | `silhouette-mid` #111110 | `#ink` rough edge | 0.3–0.45 |
| near | `ink` #050505 | `#ink-heavy` | 0.1–0.25 (or negative = foreground) |

**Motifs (`src/art/Decor.tsx`).** Broken hex lattice (`HexLattice`), hanging jointed spider legs that sway (`SpiderLeg`), ink splatter with drips (`Splatter`), torn ground with grass and half-buried hex bolts (`Ground`).

**Machine arms (`MechArm`).** Spider-leg segments: tapered chitin shell, barbs, sinew line, gray rim light (the only 3D cue). Machined hex joints with bored centers. Sagging cables. Tools: `nozzle` (printer, mandibles either side) or `claw` (two talons).

**Assembly (`PrintedPlate`, choreography in `assembly.ts`, v2.7: pinned and scrubbed).** Each content plate is a torn paper-cut (`cutout.ts`: face + two backing layers, offset drop shadow) that the arms put together as you scroll through it. Nothing is clipped or wiped on.
- *Pacing:* each plate sits in a taller track (`.plate-track` with a `.plate-spacer` under it: 85svh at ≥ 840px, 55svh on phones) and sticks there with native `position: sticky` while you scroll through the spacer. Scrolling is never intercepted, capped or slowed. Scroll position picks a time on the assembly timeline (`scrollKeys` / `timeAtScroll`): the sheet comes in while the plate rises into place (it starts when the plate top is at 95% of the viewport and has landed just before the pin), the pieces are spread over the pin, and everything is in place a little before the pin releases. The shown time follows that target on a critically damped spring with a speed limit (`follow`: ω 5.5, at least 3.2 plan s/s, more for long plates so a full pass never needs more than ~3 s of catching up), so pieces glide with inertia under a jumpy wheel or a flick and never snap or overshoot. A plate that fits the viewport sticks a little above centre (at least 88px down); a taller plate sticks with its bottom 24px above the viewport's bottom and places its top pieces while it scrolls in (never before a slot's bottom is 75% up the viewport).
- *Stopping:* 160ms without scrolling and the time settles on the nearest rest beat in the direction you were going: an arm holding the next piece in the air above its slot, wound up (or the sheet held above its spot). Never a half-placed state.
- *Reversing:* every pose is a pure function of time, so scrolling back up plays it backwards: pieces lift out of their slots and are carried off, the sheet is lifted away. Scrolling down again rebuilds it.
- *Arms:* claw-tipped `MechArm`s hanging from the ceiling rail above the plate; each shoulder rides a post just outside its side of the plate, so only the arm itself crosses the copy. Two arms on plates ≥ 480px wide (desktop, tablets), one on phones.
- *The sheet:* the claws carry it in by its top corners (one corner on phones) from above on the arm side, tipped back and slightly turned, lifted (bigger, softer shadow via `--plate-lift`). It is held a beat above its spot with a small wind-up, let go, and lands with a soft slap: squashed a hair, its shadow pressed tighter than at rest for a moment, and a small ink puff (seeded ink drops pushed out from under its bottom and side edges, transforms and opacity only, ink tone, ~0.6 s). Then it flutters into its resting tilt while the backing layers fan out with a little overshoot.
- *The words:* content is split into placeable units marked with `data-asm` (`words` = title, a word each; `lines` = running copy, a line each, grouped at run time; `place` = carried whole: badge row, CTA, link; `unit` = placed whole: list items, circuit nodes; `data-asm-cluster` = the circuit tree, one unit on phones). Phones place bigger units (the title whole, two lines at a time). Every piece rides in a claw all the way: the claw arcs to the pickup and arrives with a little overshoot, closes, carries the piece to just above its slot (it rocks as the claw slows), winds up (rises a few px, tilts back), presses it down, lets go. The piece squashes and stretches as it lands (about its bottom edge, ≤ 7%); the claw springs up and away (follow-through) with a slight sway. A held piece casts a longer, softer text shadow (`--asm-lift`, only while assembling). Presses are at least a beat apart (0.46 s of plan time; quicker on the busy Contact plate) so each placement registers. Reading order is kept; the two arms share the work.
- *Text:* always real DOM text. Words are inline spans at rest (`.asm-w`, one text run for wrapping, selection, find in page) and inline-blocks only while the plate is being assembled (same layout). Only opacity and the `translate`/`rotate`/`scale` properties animate, from offsets to their own layout slot, so there is no layout shift; all inline state is cleared once assembled.
- *Keyboard and jumps:* focus inside a plate completes it at once. Nav links and hash changes skip the animation for 1.6 s (plates show where the scroll lands); a plate's `id` is a small anchor in its track placed so a jump lands just after the pin (assembled), or at the top of a tall plate. First sight (load, reload) and plates off screen also show their state without playing.
- *Rest:* the plate-side arm parks above its top corner (off the text, the `twitch` target); the second arm lifts away and is removed. No orange anywhere in the assembly (claws, no hot tip).

**The hero arm** writes the tagline line by line on load, then retracts and idles, riding a ceiling rail.

**The character (`Character`, `Puppeteer`).** An original ink silhouette of Z: short sides, textured quiff, rectangular glasses (the only part that catches light, gray-300), short beard, blazer. He is an independent agent on the page, an overlay of his own (v2.7): the scroll moves and assembles the page, he lives on it and does not follow the scroll. Surfaces are perches (`[data-perch]`, a plate only while `[data-printed="1"]` and not `[data-pinned="1"]`) and nooks inside assembled paper plates (`interior.ts`: margins, room beside short lines and list items, beside the circuit tree, after a title), where he is drawn smaller (`INSIDE` 0.7, further into the paper) and never covers text. He walks, runs, jumps, climbs and drops between surfaces (`navigate.ts`) and teleports (`teleport.ts`): his body slumps and runs off him in ink drops that fall and splat, a puddle dries, then drops rise and gather into him somewhere else and he shakes himself off. He teleports when there is no route, when he has been off screen a few seconds and wants company, when the plate under him comes apart or pins, to slip in and out of a plate, and now and then on a whim (at least 20 s apart). What he does is chosen by needs (`desires.ts`: curiosity, mischief, company, show-off, rest), shaped by trust, never the same thing twice in a row. The ceiling claw exists only for the visitor's press: it drops in, grabs his collar, follows the pointer (ragdoll), lets go on release, and goes back up out of sight. Letter play (`letterPlay.ts`): beside a title word (hero `data-glyph`, plate `data-plate-glyph`) he carries a letter a step, swaps two, nudges the word crooked (≤ 4°), stacks one or spins one, and always puts it right within 3 to 6 s. Fidgets (looks round, scratches his head, pushes his glasses up), wanders to things on the page (peeks over plate edges, taps the hung hex stones so they swing, crouches over ink, watches a print arm, stands beside headings — on the plate's edge, never over text) and sits on edges with his legs dangling. Turns are a quick pivot (head first, step across or a little hop), never a paper-thin squash. Pose math in `poses.ts`; choices in `explore.ts` / `idle.ts`.

**Reduced motion.** No pinning (no spacer, nothing sticks); plates are fully assembled at once; the plate arm is parked and nothing moves; no sway; the character stays put: no wandering, no teleport animation (if his surface leaves the screen he is simply placed on one in view after a few seconds), no letter play, and he turns instantly.

**Performance.** Arms (SVG + `#ink` filter) only move while a plate assembles; the shared ticker sleeps otherwise. At rest ≤ 1 visible arm per plate + hero + puppeteer (the second assembly arm is removed). Lazy additions only.

## Concept: organic × machine
Every screen balances two voices:

| Machine | Organic |
|---|---|
| Share Tech Mono labels, telemetry readouts (`// 01 — RECORD`, `0x90`) | Chakra Petch display type (cyberpunk HUD) |
| Hairline 64px grid, sharp corners (0–4px) | One soft element per view: serif italic, a dot, generous negative space |
| Hex / NOP motifs, coordinate stamps | Grain/noise overlay at ≤ 4% opacity |
| Precise, linear reveals | Emphasized-decelerate easing — things *settle*, not snap |

Rule of thumb: machine is the grid, organic is the gesture.

## Color
Black, white, gray. Orange is a highlight, used so sparingly you notice it the second time.

### Gray ramp (`text-gray-*`, `bg-gray-*`, `border-gray-*`)
`100 #F5F5F0` · `200 #E6E6E1` · `300 #C9C9C4` · `400 #A6A6A2` · `500 #8C8C88` · `600 #6E6E6A` · `700 #4A4A47` · `800 #333331` · `900 #222221`
Text on dark: use 100–500 only (600 and below fail AA for text — borders/decoration only).

### Roles
| Role | Value | Tailwind | Use |
|---|---|---|---|
| surface / background | `#0A0A0A` | `bg-surface` | page |
| surface-container-lowest | `#000000` | `bg-surface-lowest` | hero, contact, footer bands |
| surface-container-low → highest | `#0F0F0F` → `#222221` | `bg-surface-low` … `bg-surface-highest` | alternating bands, cards (elevation = tier, no shadows) |
| on-surface | gray-100 | `text-on-surface` | headlines, key text |
| on-surface-variant | gray-400 | `text-on-surface-variant` | body copy |
| secondary | gray-500 | `text-secondary` | eyebrows, nav, metadata, captions |
| secondary-container / on- | gray-800 / gray-200 | `bg-secondary-container` | chips, tags (gray, never orange) |
| primary / on-primary | gray-100 / `#0A0A0A` | `bg-primary text-on-primary` | rare filled control (white). Prefer text/outlined links. |
| outline | gray-600 | `border-outline` | interactive borders (≥ 3:1) |
| outline-variant | gray-900 | `border-outline-variant` | hairlines, section dividers |
| **accent (traffic cone)** | `#FF6A13` | `text-accent`, `bg-accent`, `decoration-accent` | **highlight only** — see rules |
| error | `#FF4D6D` | `text-error` | errors only |

### Orange rules (hard)
- ✅ The hero arm's nozzle hot tip + soft glow **while it writes the tagline only**. Focus ring (2px). Link-hover underline (1px). (v2.6: plates are assembled by claws with no orange; the old print line is gone.)
- ❌ No orange fills behind text. No orange buttons, chips, cards, or bands. No orange body text, headlines, or eyebrows. No orange selection highlight.
- Budget: ≤ ~1% of any viewport. At rest (nothing being written), the page has no orange at all.

**Contrast (verified, `npm run tokens:contrast`):** on-surface 18.1:1 · on-surface-variant 8.1:1 · secondary 5.9:1 · on-secondary-container 10.1:1 · accent 6.9:1 (glyph/line use) · outline 3.9:1 (UI).

## Typography
Fonts (Google Fonts, `display=swap`): **Chakra Petch** (display, cyberpunk HUD — Z 2026-11-01), **Geist** (machine sans), **Share Tech Mono** (telemetry).

| M3 role | Utility | Family | Notes |
|---|---|---|---|
| display-large/medium/small | `type-display-*` | Serif | fluid `clamp()`; hero + section titles; italics allowed |
| headline-large/medium | `type-headline-*` | Serif | sub-sections, card titles in editorial contexts |
| headline-small, title-* | `type-headline-small`, `type-title-*` | Sans 500 | UI headings, job titles |
| body-large/medium/small | `type-body-*` | Sans 400 | max line length ~68ch |
| label-large/medium/small | `type-label-*` | Mono, uppercase, tracked | eyebrows, metadata, tags, nav, buttons |

Pattern — section header:
```
<p class="type-label-medium text-secondary">02 — Practice</p>
<h2 class="type-display-small">I create things.</h2>
```

## Shape
Machine-sharp by default: `rounded-none`/`rounded-xs` for cards, buttons, inputs. `rounded-full` only for organic accents (status dots, avatar, pills/tags). Avoid `rounded-lg+` except for media.

## Elevation
Dark UI → elevation is a lighter surface tier + 1px `outline-variant` border. No drop shadows. No glows.

## Space & layout
4px base; scale 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192. Container `.shell` = 1200px max, 16px gutter mobile / 32px ≥ 840px. Section padding: `py-24 lg:py-32`. 12-col grid ≥ 840px; single column below.

M3 window classes → breakpoints: compact <600 · medium `md:` 600 · expanded `lg:` 840 · large `xl:` 1200 · extra-large `2xl:` 1600.

## Motion
M3 tokens (`--md-sys-motion-*`, Tailwind `ease-standard`, `ease-emphasized-in`):
- Enter: `emphasized-decelerate`, 400–500ms, translateY 16–24px + fade. Stagger children 60ms.
- Exit / dismiss: `emphasized-accelerate`, 200ms.
- Hover / state: `standard`, 200ms.
- `prefers-reduced-motion`: durations collapse to 0 in tokens.css; in `motion` components use `useReducedMotion()` → fade only.
- Mobile: no 3D / parallax; 2D fade-up only (lesson from v1).

## Components (`src/components/ui.tsx`)
| Component | M3 analogue | Spec |
|---|---|---|
| `SectionHeader` | — | `type-label-medium text-secondary` eyebrow (`01 — Before`) + `type-display-small` title. |
| `Prose` | — | `type-body-large text-on-surface-variant`, max 60ch, 24px paragraph gap. |
| `ExternalLink` | Text button | `type-label-large`, gray → white on hover, 1px orange underline on hover, trailing ↗ in gray. |
| Lists | List | hairline-separated rows (`border-outline-variant`), mono index in `text-secondary`. |
| `Section` | — | top hairline, `py-24 lg:py-36`, bands alternate `surface` / `surface-low` / `surface-lowest`. |
| Buttons (if ever needed) | Outlined / Text | outlined gray or text only. Filled = white (`bg-primary`), max one per page. Never orange. |

States per M3: hover 8% state layer or gray→white text shift; focus = orange ring; disabled 38% opacity.

## Character contracts (v2.5)
How the page lets the ink character play with it. The page side owns the markup and the physical responses; the stage (`src/art/PuppeteerStage.tsx`) only measures and calls `src/art/targets.ts`. Nothing here changes the page at rest; under `prefers-reduced-motion: reduce` every write is a no-op and no response plays.

| Attribute | Where | Meaning |
|---|---|---|
| `data-glyph="<line>:<index>"` | each letter of the hero tagline (aria-hidden spans; the h1 has `aria-label` with the full tagline) | a letter the character can move. Plain inline at rest; `data-glyph-block` (inline-block, kerning restored from `glyphs.ts` KERN) while it moves, `data-glyph-live` while driven per frame |
| `data-written="1"` | hero h1 | the arm has written the tagline and withdrawn; line clips are cleared. The stunt may start |
| `data-printed="0\|1"`, `data-pinned="1"`, `data-printing="1"`, `data-arm="bx by tx ty"`, `data-asm-state="wait\|run"` | PrintedPlate root (`.plate-pin`, the sticky element carrying `data-perch`) | `printed`: `1` only while the plate is fully assembled, its arms have left and it isn't pinned (its document position is fixed); it goes back to `0` as soon as the visitor scrolls back into the pin, and stays `0` while the plate comes apart and is rebuilt (v2.7: assembly is reversible). `pinned`: the plate is stuck (sticky) and moves in document space with the scroll. While arms place things: `data-printing`; while the plate arm moves (incl. its swing back to park): `data-arm` (base + claw tip, px from the plate top-left). `data-asm-state` is the assembly phase (gone once assembled). The plate's `id` (nav anchor) is on a small `.plate-target` span in its track, not on this element |
| `data-plate-glyph="<plateId>:<index>"` | each letter of a plate title (`PlateHeader` h2, via `TitleGlyphs`; index = position in the title string, spaces counted) | a letter kept for future letter play (separate namespace from the hero's `data-glyph`). Plain inline spans inside the title's `.asm-w` word spans, aria-hidden; the h2 carries the full title as `aria-label`, so its accessible name, kerning and find in page are unchanged. Nothing drives them yet |
| `data-poke="spin\|lift\|peek\|tug\|rattle\|twitch\|tap"` | hex badges (spin), plate top corners (lift), plate top edge (peek), parked print arm tip (twitch), circuit nodes (tug), CTA door (rattle), footer `0x90` (tap) | a probe target and the response it owns (CSS keyframes in `global.css`, transforms only) |
| `data-poke-reach="top\|side\|dangle"` | every target | how he gets at it: from above, from beside, or hanging |
| `data-poke-win` | hex badge (full turn), CTA (door swings open on its hinge, shuts) | it has a bigger "win" response (full trust only) |
| `data-poke-dir` | plate corner anchors | fixed side (-1 left, +1 right) for that corner |
| `data-poke-host` | plate root | its parts answer through it; a hovered/focused host blocks pokes on its parts |
| `data-poked="a\|b"` + `data-poked-kind` + `--poke-dir` | set by `poke()` | toggling a/b restarts the keyframes; `--poke-dir` is the side he's on |

`targets.ts` API:
- `queryTargets(root?) → PokeTarget[]` (doc px rects; skips unprinted plates and an arm that isn't parked) · `isEngaged(el)` · `poke(el, kind?, dir?) → boolean` · `pokeWin(el, dir?) → boolean`. Never clicks or focuses; refuses while the visitor hovers or focuses the target.
- Letters: `glyphEl(key)`, `setGlyph(keyOrEl, pose)`, `setGlyphs(poses)`, `resetGlyphs()` (spring home with `--md-sys-motion-easing-spring`), `pokeGlyph(key, 'jiggle'|'flick', dir)`, `poseCss(pose)`.
- Title terrain: `titleEl()`, `isTitleWritten()`, `measureTitle()`, `titleMap(body, extra?)` (→ `glyphs.ts` `mapTitle`: shelves, letter tops, hang points, safe stand spots, `sag()` ≤ 3px).
- Pure planners: `stunt.ts` (`siteFor`, `stuntProgram(seed, site, {mobile})`, `beatAt`, `lettersAt`), `probe.ts` (`chooseProbe(targets, state, rand)`).

New target: add `data-poke` + `data-poke-reach` to the element, write its `…-a` / `…-b` keyframes inside the `prefers-reduced-motion: no-preference` block, keep it invisible at rest (no transformed boxes inside a plate at rest: they change how the plate rasterizes), and check a pixel diff.

## Iconography & imagery
- Line icons, 1.5px stroke, square caps — Lucide-style or custom SVG. No filled icon sets.
- Photography: high-contrast B&W, grain ok. No orange overlays.
- Signature motifs: hairline grid, `rule-accent`, the NOP sled (`0x90`) as a footer whisper.

## Voice in UI
Understated. No hype, no buzzwords, no "passionate about" lists, no name-dropping. Labels terse and machine-like; headlines human. Let the work speak. One quiet easter egg (`0x90` footer, console line) is enough.
