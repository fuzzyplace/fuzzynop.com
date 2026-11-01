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

**Assembly (`PrintedPlate`, choreography in `assembly.ts`, v2.6).** Each content plate is a torn paper-cut (`cutout.ts`: face + two backing layers, offset drop shadow) that the arms put together as it comes into view. Nothing is clipped or wiped on.
- *Arms:* claw-tipped `MechArm`s hanging from the ceiling rail above the plate; each shoulder rides a post just outside its side of the plate, so only the arm itself crosses the copy. Two arms on plates ≥ 480px wide (desktop, tablets), one on phones.
- *The sheet:* the claws carry it in by its top corners (one corner on phones) from above on the arm side, tipped back and slightly turned, lifted (bigger, softer shadow via `--plate-lift`). It hovers a moment, drops, and flutters into its resting tilt (damped wobble, tiny bounce) while the backing layers fan out from under it with a little overshoot.
- *The words:* content is split into placeable units marked with `data-asm` (`words` = title, a word each; `lines` = running copy, a line each, grouped at run time; `place` = carried whole: badge row, CTA, link; `unit` = placed whole: list items, circuit nodes; `data-asm-cluster` = the circuit tree, one unit on phones). A `carry` unit is fetched from beyond the plate edge and held nearly all the way to its slot (never across words already placed in its row); a `deal` unit leaves the claw just beside its slot as the claw runs down the margin. Each drops in with a 1–2px settle and a last small rock. Reading order is kept; the two arms share the work.
- *Trigger and pace:* time-based, not scrubbed. Starts when the plate top reaches 88% of the viewport and plays ~1.6–2.5 s (phones ~1.7 s) on the plate's own clock, which runs up to 6× faster as the plate climbs past ~60% of the viewport, so it's together before you read it. A plate first seen above 45% of the viewport (60% when the page loads: deep links, reloads, scrolling back up) is shown assembled at once, as is one scrolled well off screen mid-run or focused by keyboard.
- *Text:* always real DOM text. Words are inline spans at rest (`.asm-w`, one text run for wrapping, selection, find in page) and inline-blocks only while the plate is assembled (same layout, measured ≤ 0.2px). Only opacity and the `translate`/`rotate`/`scale` properties animate, from offsets to their own layout slot, so there is no layout shift; all inline state is cleared once assembled.
- *Rest:* the plate-side arm parks above its top corner (off the text, the `twitch` target); the second arm lifts away and is removed. No orange anywhere in the assembly (claws, no hot tip).

**The hero arm** writes the tagline line by line on load, then retracts and idles, riding a ceiling rail.

**The character (`Character`, `Puppeteer`).** An original ink silhouette of Z: short sides, textured quiff, rectangular glasses (the only part that catches light, gray-300), short beard, blazer. A ceiling claw arm carries him by the collar between perches (`[data-perch]`, only once a plate is `[data-printed="1"]`). With no perch on screen he dangles from the claw. Swings like a pendulum while carried and squashes on landing. Left alone he's curious: fidgets (looks round, scratches his head, pushes his glasses up), wanders to things on the page (peeks over plate edges, taps the hung hex stones so they swing, crouches over ink, watches a print arm, stands beside headings — on the plate's edge, never over text) and sits on edges with his legs dangling. Turns are a quick pivot (head first, step across or a little hop), never a paper-thin squash. Pose math in `poses.ts`; choices in `explore.ts` / `idle.ts`.

**Reduced motion.** Plates are fully assembled at once; the plate arm is parked and nothing moves; no sway; the character perches without transit, doesn't wander or fidget, and turns instantly.

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
| `data-printed="0\|1"`, `data-printing="1"`, `data-arm="bx by tx ty"`, `data-asm-state="wait\|run"` | PrintedPlate root | `1` only once the plate is assembled and its arms have left (a perch from then on). While arms place things: `data-printing`; while the plate arm moves (incl. its swing back to park): `data-arm` (base + claw tip, px from the plate top-left). `data-asm-state` is the assembly phase (gone once assembled) |
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
