# Decisions & open assumptions

## Decisions
**2026-10-31 — v2.3: arm ink filter split (Claude)**
1. `MechArm` filters the static rail and the moving arm as two separate `#ink` groups. Desktop idle 33 → 60 fps, scroll 57 → 59 (see `docs/PERF.md`). No change to the filter itself.
2. Chosen over baking roughness into geometry or dropping octaves because it keeps the approved look pixel-for-pixel in practice (edge-only sub-pixel diffs) and keeps the moving "boil".
3. Next lever if needed: split PrintedPlate's gantry posts into their own filtered groups.

**2026-10-31 — v2.3 phase 1: ticker + refs (Claude)**
1. **One shared rAF ticker** (`src/art/ticker.ts`). Loops return `false` to sleep; scroll, layout (body ResizeObserver + `notifyLayout()`), and `data-printed` mutations wake them. A throwing loop drops out without freezing the stage.
2. **Ref-based rendering:** `MechArm` / `Character` render once and are posed via `ref.current.set(...)`; attribute writes go through a change-skipping `setAttr`. No React render per frame anywhere.
3. **Plate print progress** no longer uses motion's `useScroll`; same offsets (`start 0.95` → `end 0.7`) computed from cached geometry. motion still drives the `Depth` parallax (already ref-based, no React renders) — kept rather than reimplemented.
4. **Measured:** the hero arm's `#ink` filter caps desktop idle at ~33 fps (60 without it). Not changed in phase 1 (no visual change). Proposal for a later phase: draw the static ceiling rail in its own filtered layer and give moving arm segments a cheaper edge (pre-baked rough path, or the filter at a smaller region). See `docs/PERF.md`.
5. Tooling: `scripts/perf.mjs` (benchmark, `--css` diagnostics), `scripts/pixdiff.mjs`, screenshots now desktop / 390 px / reduced motion, Vitest in `npm run check`.

**2026-10-31 — v2.3 direction (Z, voice) → see `docs/HANDOFF.md`**
1. Character walks slowly toward the mouse; arms pick him up, drag him around, and reset him.
2. Cut-outs become more dynamic (procedural torn, layered paper).
3. Hexagons assemble from pieces and become link placeholders (destinations + sources).
4. Page funnels to ONE call to action: contact / book time (mechanism TBD).
5. Build handed to Claude Code (Fable model if available).

**2026-10-31 — v2.2 (Z: Limbo + machine arms + character)**
1. **Hero tagline:** "Red Teamer, Team Builder, Professional Bogeyman" (Z). The humans/machines question moves to an ink interlude plate.
2. **Art direction:** Limbo-like fog + paper-cut ink silhouettes, biomechanical spider-leg arms, hexagons, ink splatter. Black/white/gray balance is now high contrast: white paper plates and black ink plates on fog.
3. **Scroll = construction:** each plate is 3D-printed bottom-up by a gantry-mounted arm as you scroll; the hero arm writes the tagline on load.
4. **Character:** an original silhouette of Z (quiff, rectangular glasses, beard, blazer), carried between plates by a ceiling claw.
5. **Orange:** only the nozzle hot-tip and print line while printing (plus focus/hover). At rest, no orange on the page.
6. **Layout:** offset, overlapping plates on a single stage instead of stacked horizontal bands.
7. Reference images (Westworld titles, Limbo) are mood only — no assets copied.

**2026-10-31 — v2.1 (Z feedback)**
1. **Palette is black, white, gray.** Full gray ramp added (`gray-100`…`gray-900`). M3 `primary` is now white; `secondary` is gray.
2. **Orange is a whisper.** Moved to its own `accent` role: focus ring, 1px link underline on hover, `rule-accent` hairline segment, 6px `dot-accent`. No orange fills, buttons, chips, eyebrows, or text.
3. **No name-dropping.** Employers, titles, talks, conferences, publications, partner orgs removed. Site speaks generally, in Z's own words (`docs/CONTENT.md`).
4. **Structure:** Hero (the question) → 01 Before → 02 Practice → 03 Now → 04 Contact. Removed Record, Talks, Make, Network sections.
5. **Tone:** understated. No hype, no buzzwords, no "passionate about" lists.

**2026-10-31 — v2.0**
1. **Stack:** Vite + React 19 + TS + Tailwind v4 + motion. Static output for Vercel. Three.js only if a section earns it (lazy).
2. **M3 as structure, not skin.** Role names, type scale, shape, state layers, motion tokens. No `@material/web` components.
3. **Fonts:** Instrument Serif (organic display) + Geist / Geist Mono (machine).
4. **v1 preserved** in `legacy/v1/` as reference; not built or deployed.

## Open assumptions — Z to confirm
- [x] ~~Phase 1 kept the `#ink` rough edge on the moving hero arm even though it costs ~half the frame rate on desktop. OK to swap in a cheaper edge on moving arms?~~ Resolved without a visual change: rail split onto its own filter layer → 60 fps with the same edge (2026-10-31).
- [ ] Character likeness — quiff/glasses/beard read right? Beanie variant as an easter egg?
- [ ] Want the character to *do* anything at the contact plate (wave, sit)?
- [ ] Contact links: LinkedIn + SoundCloud labeled "Sound". Add/remove?
- [ ] Public contact email.
- [ ] Should "the work" appear at all later (images/projects, unnamed)? Default: not in v2.1.
- [ ] Headshot? Default: none — fits the understated direction.
- [ ] New OG image (current `og.png` is v1 art).
- [ ] DNS provider for fuzzynop.com (needed for Vercel cutover).
