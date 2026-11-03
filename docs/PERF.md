# Performance log

Harness: `npm run build && npx vite preview --port 4173 & node scripts/perf.mjs` — headless Chromium (software raster), CPU throttled ×4 to stand in for a mid laptop, median of 3 runs.
- **idle** = hero after the tagline is written (arm swaying, character perched), 5 s.
- **scroll** = steady mouse-wheel scroll top → bottom (plates printing, character carried).
- busy / script / layout / style = main-thread ms per second. fps / p95 from rAF intervals.

## v2.3 phase 1 — shared ticker + ref-based rendering (no visual change)

| scenario | script ms/s before → after | busy ms/s before → after | fps before → after |
|---|---|---|---|
| desktop idle | 102.6 → **17.5** (−83%) | 176 → 78 | 32 → 33 |
| desktop scroll | 121.1 → **47.9** (−60%) | 272 → 173 | 57 → 57 |
| mobile idle | 129.4 → **9.5** (−93%) | 224 → 61 | 60 → 60 |
| mobile scroll | 102.9 → **32.2** (−69%) | 233 → 121 | 60 → 60 |

No long tasks (> 50 ms) before or after. Before = v2.2 (`4b28876`), measured back to back with after.

**What changed:** Hero and Puppeteer no longer `setState` every frame (Hero was re-reconciling every decor layer 60×/s, Puppeteer ran `getBoundingClientRect` on every perch every frame); plates no longer re-render on every scroll tick. One rAF loop (`src/art/ticker.ts`) runs only while something is awake, sleeps when settled, pauses on hidden tabs. Arms and the character render a static skeleton once and are posed through refs.

**Why desktop idle is still ~33 fps:** the main thread is ~8% busy; the limit is rasterisation. Diagnostic (`--css` overrides, not shipped):

| variant | desktop idle fps | desktop scroll fps |
|---|---|---|
| as built | 33 | 57 |
| `#ink` filter off on moving arms | **60** | 60 |
| `#ink` filter off on the hero arm only | **60** | 60 |
| grain overlay off | 37 | 58 |
| plate drop-shadow off | 33 | 58 |

The hero arm's `#ink` displacement filter is the whole cost: its filter region spans the full-width ceiling rail, so the turbulence + displacement is re-rasterised over ~1.5 MP every frame while the arm sways. Fixing it changes pixels, so it's left for a visual phase (see DECISIONS). Software raster exaggerates this; a real GPU will be faster, but the ratio holds.

**No-visual-change check:** reduced-motion full-page screenshots (deterministic) differ from v2.2 by 174 px (desktop) / 50 px (mobile) at ≤ 13/255, all on the ceiling claw arm, the same order as v2.2 vs itself (6 / 23 px) — v2.2's carriage is still easing by sub-pixels when captured. `node scripts/pixdiff.mjs a.png b.png`.

## v2.3 — arm `#ink` filter split (rail on its own layer)

| scenario | fps before → after | p95 ms before → after | frames > 20 ms before → after |
|---|---|---|---|
| desktop idle | 33.2 → **59.8** | 33.4 → 16.8 | 78% → 0% |
| desktop scroll | 56.8 → **59.4** | 33.3 → 16.8 | 5% → 1% |
| mobile idle | 59.8 → 59.8 | 16.8 → 16.8 | 0% → 0% |
| mobile scroll | 60.1 → 60.1 | 16.8 → 16.8 | 0% → 0% |

Before = `6a87dd6` (preview :4181), after = this branch (:4180), back to back, CPU ×4, median of 3. busy ms/s rises at idle (80 → 126) only because twice as many frames are drawn. A second after-run while another agent was loading the CPU read idle 60.0 / scroll 55.9 (mobile idle busy also jumped 78 → 125 in that run, i.e. contention) — re-run when the machine is quiet if scroll looks low.

**What changed (`src/art/MechArm.tsx` only):** the arm root `<g>` is no longer filtered. The rail + nuts get their own `filter="url(#ink)"` group (a thin full-width strip), and everything that moves (cables, carriage, segments, joints, tool, glow) gets a second `#ink` group whose region is the arm's own bbox instead of rail-width × arm-height. Same filter, same primitives, same user-space coordinates. Applies to the hero arm, every plate gantry arm, and (no rail, so only a wrapper) the Puppeteer claw.

**Visual:** no perceptible change. Reduced-motion full-page diff: desktop 8 054 px changed, max 33/255, all on the hero arm's edges (sub-pixel resampling of the same noise as the filter region's pixel origin moved); mobile 1 px. Crops: `screenshots/filter-crop-{before,after}-desktop-reduced.png`. The "boiling" while moving is kept: a test page confirmed Chromium samples `feTurbulence` in user space independent of the filter region, so moving parts still re-sample the noise each frame exactly as before.

Not done (not needed for the target): PrintedPlate's two gantry posts still share one filtered group spanning the plate width; splitting them (thin `<rect>`s, not zero-width `<line>`s) is the next lever if scroll ever dips.
