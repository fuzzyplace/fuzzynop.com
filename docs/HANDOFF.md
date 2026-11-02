# Handoff — fuzzynop.com v2.3 build

**For:** Claude Code (run on the Fable model if it's available to you: `/model`).
**From:** design + prototype session with Z, 2026-10-31.
**Status:** v2.2 prototype works and builds. Direction approved: "really good direction." This brief is the next build.

---

## Current state (v2.8, launch prep) — read this first (updated 2026-11-02)
Branch `claude/v2.8-launch` (on top of `claude/v2.3-living-stage-x605vc`). `npm run check` passes (248 tests). Vercel preview project: `fuzzynop-redesign-preview` (STDClub team; Vercel login required). **Launch is prepared, not performed: see [`docs/LAUNCH.md`](LAUNCH.md)** for the ordered cutover, DNS records, QA list and what's needed from Z. `main` still serves v1 on GitHub Pages, so merging into `main` is the cutover.

**The page now** (copy and order in `docs/CONTENT.md` → "How it maps to the site")
- Hero: the arm writes "Team Builder, / Red Teamer, / Professional Bogeyman", every letter its own span so he can play on it. Then Past (white), Present (black), the "Setting the vibe" pop-out (white), Future (black), Contact (white) with the CTA and the link tree. Footer `0x90 0x90 0x90 · nothing happened here`.
- **Pinned, scroll-driven assembly** (v2.7): each plate sticks while you scroll through a spacer, and claw arms carry the sheet in and place its words in step with the scroll, both ways, with weight (wind-up, press, squash, ink puff). Scrolling is never intercepted; reduced motion shows everything placed. Details and tuning guesses: `docs/DECISIONS.md` and DESIGN_SYSTEM "Art direction".
- **Link tree** from the original site (`src/content/links.ts`): Connect, on the FZNP root (LinkedIn, X, GitHub), Work (Talks archive, Interview, Podcast, In the news), Play (The Fuzzy Place, live set, the crew, SoundCloud, Spotify, Mixcloud). Email and Book time stay hidden in production until Z supplies them.

**The character is his own agent** (v2.5 to v2.7)
- The claw comes only when you press on him; otherwise he gets around himself (walk, jump, climb, fall) and **teleports** (ink out, ink in, a shake) when there's no route or on a whim.
- **Needs brain** (`desires.ts`): curiosity, mischief, company, show-off and rest rise over time and pick what he does next.
- **Trust and moods**: starts wary, a calm pointer earns trust, a grab shakes him; moods run from fearful to warm. The hidden line shows once per session at full trust.
- **Probes**: he inspects and pokes things on the page (badges spin, plate corners lift, circuit nodes tug, the CTA rattles, the footer 0x90 hops).
- **Title stunt**: once per page load he plays on the hero title (walk, poke, sit, flick, swing, hang).
- **Letter play**: plate titles are per-letter spans he can use; wired, not yet seen working at the pinned scroll positions.
- Dev builds expose `window.__puppet` (trust, fear, feel, force(activity), teleport, probe, stunt, decisions, desires, clawUses, nooks, surface, away).

**Launch prep done in v2.8**
- `index.html`: twitter title/description/image alt, `og:site_name`, `og:image:alt`, apple-touch-icon and manifest links.
- `public/`: `apple-touch-icon.png` (paper hex with FZNP on ink, 180x180, rendered from SVG), `site.webmanifest`, `404.html` (dark, the footer egg, a link home, noindex).
- `vercel.json`: strict CSP plus short caching for og/favicon/icons. Tested on 2026-11-02 against the production build under these headers (temp static server mirroring Vercel's headers and 404): full scroll at 1440 and 375, the character stage chunk loaded and he appeared, zero CSP violations, zero console or page errors, no horizontal scroll; unknown paths return 404 with the 404 page. Lighthouse locally: accessibility, best practices and SEO 100, same as before; performance 78 to 87 (container variance, unchanged by these edits).

**Waiting on Z**
- DNS provider access and a go-ahead date (LAUNCH.md).
- Calendly and a public email, if wanted at launch.
- Approve the drafted lines in `docs/CONTENT.md` (Contact block and CTA, the pop-out body line).
- Still open from before: tuning guesses in DECISIONS (pin length, needs rates, teleport pace), touch path and Safari/Firefox on real devices.

<details><summary>Earlier: v2.4 state (2026-11-01)</summary>

## Current state (v2.4) (updated 2026-11-01, end of cloud session)
Branch `claude/v2.3-living-stage-x605vc`. `npm run check` passes (117 tests). Vercel preview project: `fuzzynop-redesign-preview` (STDClub team; Vercel login required).

**Main story is LOCKED: "the experiment is you", with "security is a feeling" as its heart.** See `docs/NARRATIVE.md` → "Main story — LOCKED". Every further decision should follow from it.

**Done since the prototype**
- **Story applied:**
  - Fixed hero "What would / happen if_" (variants removed).
  - The interlude is now EXP. 04's hypothesis; EXP. 04's result is "Running."
  - EXP. 05 (title `_`, result "Pending_") holds the CTA and the circuit tree; Links and Contact plates removed.
  - "Soon" links are hidden in production.
  - Nav is Log · Next.
  - Share text and `public/og.png` read "What would happen if_".
- **Fonts:** Chakra Petch display, Share Tech Mono labels, Geist body (Z chose "D · cyberpunk HUD").
- **Design and copy review fixes:**
  - Focus ring on paper, solid nav strip, mobile nav, screen-reader names.
  - Dead v2.3 code removed; CONTENT.md records v2.4 copy.
- **Character polish:**
  - Headroom below the header everywhere; held clear of plate text when there's no perch.
  - Visits circuit-tree nodes; the duck works.
  - Trust verified in a browser; hidden-line placement fixed.
  - Plates now finish printing by mid-screen.

**Next up / waiting on Z**
- Sign off the story-derived lines: EXP. 04 "Running.", EXP. 05 title "_" (sr: "Next"), "Pending_".
- Page title order: "FuzzyNop — Josh Schwartz" vs "Josh Schwartz — FuzzyNop".
- Calendly / socials / art / email URLs (they show only in dev until real).
- CTA label inside EXP. 05 ("Say hello · LinkedIn" until Calendly exists).
- **Tuning (see DECISIONS):**
  - Print timing (he's held more mid-page).
  - Mid-plate sitting pose.
  - Duck rarity.
  - Trust pace.
- Not yet tested: touch path, Safari/Firefox (container queries), Lighthouse.

</details>

<details><summary>Earlier: v2.4 prototype notes</summary>

## Current state (v2.4 prototype) — 2026-11-01
Branch `claude/v2.3-living-stage-x605vc`. `npm run check` passes (111 tests). Preview deploys from this branch via the Vercel project `fuzzynop-redesign-preview`; Vercel login required.

**Done**
- **Character:** shared ticker and ref-based rendering, walk, claw state machine, ragdoll pickup and drop, swatting, and his own routes (walk / jump / climb / fall). Three hung hex stepping-stones in the hero.
- **Explorer:** a video-game turn (no paper-thin squash), idle fidgets, wandering to points of interest (stones, plate edges, splatters, printing arms, headings), sitting, and ducking.
- **Trust** (`src/art/trust.ts`): starts wary, a calm pointer earns trust, a grab leaves him shaken. A hidden line appears once per session at full trust.
- **Experiment log:** EXP. 01–04 replace Before / Practice / Now (`src/components/Experiment.tsx`, copy in `src/content/site.ts`). Links and Contact badges are now "↗" and "@".
- **Hero variants:** the default is the open question "What would / happen if_". `?hero=rotate` cycles three questions, `?hero=classic` shows the v2.3 tagline, and `?interlude=fold` moves the interlude into EXP. 04 (`src/content/variants.ts`).
- **Circuit tree:** replaces the hex link hub. Data lives in `src/content/links.ts`; adding or retiring a link is one line there.

**Unfinished / not verified**
- **Trust:** never seen in a browser. Not checked: how the tremble and cower look, whether sitting beside the pointer mid-plate covers text, where the hidden line lands near the top of the screen and at 375 px, the timer that wakes the stage, and the touch path. Grab/drop and a full scroll were smoke-tested with no runtime errors.
- **Header overlap:** the claw can still set him on a plate whose top is near the viewport top, so his head goes under the fixed header.
- **Duck:** the logic is in place but was never seen to trigger. Watching the printer only happens when a plate is left half-printed.
- **Circuit tree:** link nodes carry `data-poi="node"`, but Puppeteer only reads `data-poi="splat"`, so he doesn't visit them yet. Not tested in Safari or Firefox (it relies on container queries), on real touch devices, or with Lighthouse.
- **Small poses:** "read" and the weight shift are subtle at desktop scale.
- **Mobile:** the claw passes over the tagline while grabbing him (in transit, not parked).
- **Tuning:** all of it is a guess. Walk and explore pace, turn length, trust and fear rates, and how often the claw relocates him are logged in DECISIONS.

**Waiting on Z**
- **Hero:** fixed or rotate? Keep the interlude as its own plate or fold it into EXP. 04?
- **Labels:** nav (Log / Now / Links / Contact), the Links plate header ("Links" / "Elsewhere."), and the "↗" / "@" badges.
- **URLs:** Calendly, socials, art/projects, public email. They show as "soon" until supplied.
- **Mixcloud:** it's shown live, but CONTENT.md says "not currently used".

**Where decisions live:** `docs/NARRATIVE.md` (story, tone, approved v2.4 lines) and `docs/DECISIONS.md` (decision log and open assumptions).

</details>

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
