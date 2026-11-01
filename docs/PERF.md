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
