# PLAY: a curious, prodding character (plan, not yet built)

Z (2026-11-02): "After the title renders, he runs up to and climbs the title text, maybe hanging off Bogeyman. The text interacts with him. He's more playful and messes with things on the page, because that's what a red teamer does: prodding, probing, curious. Keep all existing behaviours."

## 1. Hero intro: "the stunt"
- **Trigger:** Hero sets `data-written="1"` on the h1 when the arm finishes (~4.95 s). Runs once per session (sessionStorage `fz:stunt`), only if hero in view, he's on the ground and not held, and not reduced motion.
- **Perches from text:** measured once on layout via Range rects (one per line, one per letter of "Bogeyman"). Pure `glyphs.ts` derives shelves (line tops not covered by the line above; line 3 is longer than line 2, so the top of "Bogeyman" is free to stand on), letter tops, the hang point (top right of the final "n", so he never covers text), and `sag(x)` (letters dip ≤ 3 px under his feet).
- **Script** (pure `stunt.ts`, ≤ ~12 s): glance at the title → run along the ground → jump/climb onto the shelf (planRoute, claw boost fallback) → walk "Bogeyman" (letters sag) → flick the comma after "Red Teamer," (spins ~20°, settles) → crouch at the "n", swing down and hang (the "n" tilts ≤ 4° and swings with him) → poke the "a" (jiggles) → straighten the "n", drop, land.
- A soft fog spotlight follows him so the silhouette reads on the dark hero.
- **Machine:** new `stunt` mode; yields to a press or the page (letters spring back); glances at the pointer but isn't stopped by it.
- **A11y/perf:** h1 gets `aria-label` with the full tagline; only "Bogeyman" and the commas split into aria-hidden spans from first render (no CLS, LCP unchanged); letter transforms only while the stunt runs, cleared after; reduced motion = static, no stunt.

## 2. Prod and probe
Opt-in contract: `data-poke="jiggle|rattle|lift|spin|tug|twitch"` + `data-poke-reach="top|side|dangle"`. One-shot CSS keyframe responses owned by the target (transforms only, reduced motion off). The stage never clicks or focuses anything; skips targets the visitor is hovering/focusing.

| Probe | He does | Target responds | Min trust |
|---|---|---|---|
| Circuit node | taps the edge, then tugs | trace lights, node jiggles | tolerant |
| Hex badge | taps it like testing a key | hex shell spins 60° and back | tolerant |
| Plate corner | picks at the torn corner | paper corner lifts | tolerant |
| Peek under | lifts the edge, looks underneath | edge lifts 6 px | warm |
| CTA | rattles it like a door handle | button jolts twice ("locked") | warm |
| Print arm (parked) | pokes the tip | arm twitches away | warm |
| Title revisit | hangs off the "n" again | as in the intro | warm |

Caps (pure `probe.ts`): daring by trust band (shaken/wary 0, tolerant 0.6, warm 1.4); ≤ 1 probe per 2 finds; 90 s cooldown per target; CTA ≤ 2 per session. When warm, after a probe he glances back at the pointer ("did you see that").

## 3. Architecture
New pure modules with tests: `glyphs.ts`, `stunt.ts`, `probe.ts`. Changes: `puppet-machine.ts` (+stunt), `poses.ts` (+hang, cling, poke, rattle, flick, pick), `explore.ts` (+probe kind, trust weighting), `PuppeteerStage.tsx` (wiring; stunt driver in a `useStunt` helper), `Hero.tsx` (split spans, aria-label, data-written, clip-path reset), `ui.tsx` / `CircuitTree.tsx` / `PrintedPlate.tsx` (data-poke), `global.css` (poke keyframes). Everything stays in the lazy stage chunk; targets measured only on decisions; loop still sleeps.

## 4. Phases
- **P0 Contract (no visible change):** split spans, aria-label, data-written, poke CSS. Screenshot diff clean, CLS 0, screen readers read one heading, find-in-page finds "Bogeyman".
- **P1 Stunt:** plays once at 1440 and 375, never under the header, letters end at identity, reduced motion none, Lighthouse ≥ 95, loop sleeps after.
- **P2 Probe framework + cheap probes** (node tug, badge spin, corner lift); caps tested; never while target hovered/focused.
- **P3 Hands-on probes** (cling, dangle, CTA, peek, print arm, title revisit); trust gating checked in a browser.
- **P4 Tuning + docs.**

Risks: silhouette on dark between letters (spotlight), kerning across split spans (measure), CTA reachability, PuppeteerStage complexity.

## Questions for Z
1. Hang off the last "n" (never covers text) or the "y" descender (briefly covers the line below)?
2. Stunt once per session, or again whenever he trusts you and the hero is in view?
3. When he trusts you, can a probe "win" (e.g. the CTA opens a crack)?
4. Mobile: full stunt, or short version (hops onto the title and pokes the "B")?
5. Add a ledge on the footer so he can poke `0x90`, or leave footer and nav alone?
