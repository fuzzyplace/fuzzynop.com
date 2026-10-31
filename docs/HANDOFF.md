# Handoff — fuzzynop.com v2.3 build

**For:** Claude Code (run on the Fable model if it's available to you: `/model`).
**From:** design + prototype session with Z, 2026-10-31.
**Status:** v2.2 prototype works and builds. Direction approved: "really good direction." This brief is the next build.

---

## 0. Before anything
1. `mv _claude .claude` (Claude config staged there; it couldn't be written remotely). Restart Claude Code so `/check`, `/new-section`, `/design-review`, `/content-audit`, `/ship` and the two subagents load.
2. Delete `src/sections/.README.old` (stray file).
3. `git switch -c claude/v2.3-living-stage`. Nothing from the redesign is committed yet — first commit = current state ("v2.2 prototype"), then build on top.
4. `npm install && npm run check && npm run dev`.

## 1. Read first (in order)
1. `CLAUDE.md` — rules (tokens only, orange budget, no name-dropping, privacy, a11y, perf).
2. `docs/DESIGN_SYSTEM.md` → **Art direction** section (stage, depth tones, motifs, arms, printing, character).
3. `docs/CONTENT.md` — approved copy in Z's words + never-publish list.
4. `docs/DECISIONS.md` — what's decided and open.
5. `design/references/README.md` + look at the images (mood, likeness, progress screenshots).
6. Code: `src/art/` (MechArm IK, PrintedPlate, Puppeteer, Character, Decor, ArtDefs), `src/sections/Hero.tsx`, `src/App.tsx`.

## 2. What exists (v2.2)
- Fog-lit stage, film grain, three-depth ink silhouettes with parallax (hex lattice, swaying spider legs, splatter, grassy ground).
- Hero: ceiling-rail arm writes "Red Teamer, / Team Builder, / Professional Bogeyman" on load, then parks and sways.
- Content plates (paper-white or ink-black cut-outs) are 3D-printed bottom-up by a gantry arm as you scroll.
- The character (Z's silhouette: quiff, rectangular glasses, beard, blazer) is carried by a ceiling claw between printed plates (`[data-perch]`), dangles when nothing is on screen.
- Orange only as the nozzle hot tip + print line while printing (plus focus ring / hover underline).
- Reduced motion: everything pre-printed, arms parked, no transit.

## 3. What to build (v2.3) — Z's feedback

### 3.1 The character is alive: follows the mouse
- He **walks slowly toward the cursor's x position** along whatever surface he's standing on (plate top edge or hero ground). Speed ~50–70 px/s, eases in/out, stops within ~20 px, turns to face the direction of travel.
- Needs a **walk cycle**: legs alternate, slight body bob, arms swing a little. Add a `walk` phase to `Pose` in `Character.tsx`. Idle: subtle breathing; occasionally looks toward the cursor (head tilt).
- Constrained to the current perch's width. He never walks through text or off into the void on his own.
- Touch devices: follow the last tap position on the stage; otherwise idle.
- Reduced motion: no walking; he just turns to face the cursor.
- Pointer tracking goes in a ref (no React state per `pointermove`).

### 3.2 The arms handle him: pick up, drag, reset
The arms are characters too: a bit possessive, a bit playful. The claw arm (Puppeteer) intervenes:
- **Edge reset:** if he walks to the edge of a perch, the claw grabs him by the collar and **sets him back** near the middle, a small "no".
- **Idle relocation:** after 8–15 s (randomised) without big pointer movement, an arm picks him up and **drags him somewhere else**: another visible perch, a short dangle tour, or a drag *along* the surface (feet scraping, legs trailing).
- **Scroll:** carried to the active plate (existing behaviour, keep).
- **Optional (nice):** if the user presses on him, the claw takes him first. Users don't drag him directly; the machine does.
- Physics: pendulum swing while carried (exists), a little squash on landing (exists), feet scrape on drags.
- Refactor `Puppeteer` into an explicit **state machine**: `idle → walking → grabbed → carried | dragged → landing → idle`, plus `dangling` when there's no perch. One place for transitions; log them in dev.

### 3.3 Cut-outs are more dynamic
The current `.plate-cut` polygon is too plain. Make each plate feel hand-cut and layered:
- **Procedural torn-paper edges** per plate: a seeded jagged outline (irregular tears, notches, a hex "bite" or two), generated from the plate's measured size as an SVG `clipPath`. Different per plate, stable across renders (seeded by plate id).
- **Layered paper:** 2–3 stacked offset layers (paper / gray / ink) peeking out behind, like a cut-out collage. Slight per-plate rotation (±0.5–1.5°).
- **Alive:** a gentle settle when printing completes; on hover/focus, a slight lift toward the viewer (shadow grows, a tiny tilt). Reduced motion: static.
- Keep the text safe area: padding must clear the deepest tear.

### 3.4 Hexagons get pieced together → link hub
Hexes become **placeholders for links** to Z's places and sources.
- Each hex **assembles from shards** (e.g. 6 triangles or irregular fragments) as it scrolls in: the arm or the gantry places pieces, or they snap together. A honeycomb cluster forms piece by piece.
- Each hex = one link. Data in `src/content/site.ts`:
  ```ts
  export const hub: { label: string; href: string | null; kind: 'social' | 'work' | 'source' | 'sound' }[]
  ```
  `href: null` = placeholder → rendered as a hex with its label, `aria-disabled="true"`, not focusable, with a dashed or hollow look. Z will fill these in. Start with what's allowed in `docs/CONTENT.md` (LinkedIn, SoundCloud, Spotify, Mixcloud) + 4–6 null placeholders.
- Hover/focus: the hex lifts, rotates ~30°, the label sharpens; a 1px orange edge on focus only.
- Accessible: rendered as a real `<ul>` of links; the honeycomb is presentation only.
- The existing four "Practice" capability hexes should use the same pieced-together component (non-link variant).

### 3.5 One call to action
The whole page funnels to **one CTA: contact Z / book time**. The mechanism is undecided (email vs booking link).
- `site.cta = { label: 'Book time', href: null, fallback: 'mailto:…' }`, TBD by Z. Until set, render the CTA with a clear placeholder state (dev badge) and keep it out of production builds or show a neutral "Say hello" with LinkedIn.
- It is the **only filled control on the page**: paper-white on ink (not orange). It lives on the last plate; the gantry prints it last; the character ends up standing next to it and gestures toward it.
- Remove any competing CTAs. The hub hexes are secondary.

## 4. Keep (non-negotiable)
- Tokens only; mirror any new token in `design/tokens.json` + `tokens.css`; `npm run tokens:contrast` passes.
- **Orange:** nozzle hot tip/print line while printing, focus ring, hover underline. Never a fill, never behind text. At rest the page has no orange.
- **Copy:** only "Approved copy" in `docs/CONTENT.md`. Understated, no hype, **no name-dropping** (employers, conferences, orgs, titles).
- **Privacy:** never-publish list in `docs/CONTENT.md`.
- **A11y:** WCAG AA; all content in the DOM regardless of animation; full keyboard path; `prefers-reduced-motion` honoured everywhere; decorative SVG `aria-hidden`.
- **Original art only.** References are mood; never trace or embed them.

## 5. Engineering notes
- **Perf is now the main risk.** Today several components `setState` every frame. Move to **one shared rAF ticker** (`src/art/ticker.ts`) that pauses when the tab is hidden or nothing is animating, and update arm/character SVG via refs (`setAttribute` / motion values) instead of React re-renders. Target: 60 fps on a mid laptop, no long tasks > 50 ms, Lighthouse perf ≥ 90 (≥ 95 stretch).
- The `#ink` displacement filter on moving SVG is costly. Measure it; consider ink-edge only on the static decor and a cheaper edge on moving arms, or pre-rasterised arm segments.
- Perch geometry: cache rects; recompute on scroll/resize via `ResizeObserver` and passive scroll, not every frame.
- Keep pure geometry in `geometry.ts` testable; add a few unit tests (IK reach clamp, perch selection, state transitions) with Vitest.
- Mobile: fewer decor layers, thinner arms, no hover states; the character still works (taps).

## 6. Plan (checkpoint each phase: `npm run check`, screenshots desktop + 390px + reduced motion, commit)
1. **Ticker + refs refactor** (no visual change). Prove perf.
2. **Character walk + mouse follow** (3.1).
3. **Puppeteer state machine** + edge reset + idle relocation + drag (3.2).
4. **Dynamic cut-outs** (3.3).
5. **Pieced-together hex component** → Practice hexes + link hub (3.4).
6. **Single CTA** plate + character ending (3.5).
7. `/design-review` + `/content-audit`; fix; `/ship` to a Vercel preview (`docs/DEPLOY_VERCEL.md`).

Use `node scripts/screenshot.mjs` (scrolls with `mouse.wheel`; `window.scrollTo` won't fire reveals because of smooth scroll). For mouse-follow, script a pointer path with Playwright `page.mouse.move` and capture frames.

## 7. Acceptance
- [ ] Character walks toward the cursor smoothly with a readable walk cycle; never leaves his surface on his own.
- [ ] Arms reset him at edges, relocate him on idle, carry him on scroll; transitions feel deliberate, not glitchy.
- [ ] Every plate has a distinct hand-torn, layered cut-out; settles on print; lifts on hover/focus.
- [ ] Hexes assemble from pieces; the hub renders links + placeholders accessibly.
- [ ] Exactly one CTA, clearly the destination.
- [ ] Orange audit passes (none at rest). Contrast passes. Keyboard path complete. Reduced motion clean.
- [ ] 60 fps scroll on desktop; no horizontal scroll at 375px; Lighthouse ≥ 90.
- [ ] `docs/DECISIONS.md` updated with what you decided + anything Z needs to answer.

## 8. Open questions for Z (don't block; assume, log in DECISIONS)
1. CTA mechanism: email or booking link (which service / URL)? Default assumption: booking link placeholder + mailto fallback hidden in prod.
2. Hub links: which destinations and sources go in the hexes?
3. Beanie variant as an easter egg (e.g. Konami code)?
4. Public contact email.
5. DNS provider for the Vercel cutover.

Z reviews in batches: make the best reasonable assumption, keep building, list assumptions for him.

---

## Kickoff prompt (paste into Claude Code)
> Read `docs/HANDOFF.md` and do section 0, then follow the plan in section 6 phase by phase. Start with phase 1 (shared ticker + ref-based rendering, no visual change) and show me before/after perf numbers. Checkpoint after each phase with `npm run check`, desktop/mobile/reduced-motion screenshots, and a commit on `claude/v2.3-living-stage`. Don't block on open questions; assume and log them in `docs/DECISIONS.md`.
