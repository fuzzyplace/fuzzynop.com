# PLAY: the character, an agent of his own (v2.7, built)

Z (2026-11-02): "He should be an independent agent on the page, a character of his own, not tied to anything in particular. The scroll moves and assembles the page; his behaviour is independent and organic, and he feels alive. Don't script him too much. He's an extra thing, an overlay on the page, like Clippy. Rules: the claw never picks him up unless the user clicks on him; that is the only time. He can teleport, vanish and reappear in different places, so he can get to other areas. He can go on top of the boxes. He can go inside. He can arrange the letters."

## As built (v2.7)
- **The claw, only on a press.** Press (or tap and hold) on him: the claw drops in from the rail, grabs his collar, follows the pointer (he hangs as a ragdoll); let go and he falls onto the surface below (or the nearest), lands, and the claw goes back up out of sight. No other claw use exists: the scroll carry, edge reset, idle relocation, probe heists, stunt boost, lost hold and footer rescue are gone (`puppet-machine.ts` only takes a `press` plan; `hold.ts` deleted).
- **Teleport** (`teleport.ts`, drawn by `Character` `Pose.ink`): out about 0.7 s (the body slumps and runs off in drops that fall and splat, a puddle), a short beat, in about 0.75 s (drops rise and gather), then a shake. Used for: arriving on load; no route on foot; off screen a few seconds and wanting company; the plate under him coming apart or pinning (`data-printed` back to `0`, `data-pinned`); getting into and out of a plate; a whim at most every 20 s. Where to: `chooseDest`, a surface or nook on screen about 220 px from your pointer (never under it), not where he just was. Off screen when he leaves: he just turns up.
- **Getting about.** Walk, run, jump, climb, drop (`navigate.ts`). Scrolling does not move him: he stays, leaves the screen, and after 1.4 to 4.2 s (sooner the more he wants company) comes along: a run of up to 2.8 s if there is a route, else ink. A plate coming apart under him: a hop off if there's a short route, else ink.
- **Inside plates** (`interior.ts`): each assembled paper plate's interior (its face minus every text line, control and badge, 6 px padding) gives up to 8 nooks where his whole body fits at 0.7 size. Floors: the top of a block of text, a line's baseline, the plate's inner bottom. He reads or peeks at the words beside him, looks about, walks his nook, lies down for a nap. Ink plates have none (his silhouette would vanish).
- **Letter play** (`letterPlay.ts`): beside a title word (a plate title's last word from the nook after it, `data-plate-glyph`; the hero tagline from a shelf on the longer line below, `data-glyph`): carry (lifts the end letter over his head, a step away, back), swap (last two letters), nudge (the word crooked by up to 4°), stack (end letter onto the one before), spin (a full turn). 3 to 6 s, always ends at rest; cut short, the letters spring home (CSS). One word at a time, never body copy, transforms only (screen readers read the h1 / h2 `aria-label`), nothing under reduced motion.
- **His needs** (`desires.ts`): curiosity (explore, inside), mischief (probe, letters), company (visit you, greet, sit by you; climbs fast while he's off screen), show-off (the title stunt, a vanishing act), rest (sit, nap, watch). Each rises over time by mood and what the pointer is doing; doing something eases what it served. The choice is weighted, never the last thing again (nor the one before when there's anything else). Shaken: only fidget, watch, sit. The title stunt is no longer on load: it's an option he likes when he's on the hero ground, tolerant or warm (60 s apart).
- **Kept:** trust and moods (wary, tolerant, warm, shaken), turning points, flinch, pats, greeting (now on arrival after his own run or teleport), swatting, fidgets, sitting, ducking a moving arm, probes (reached on foot, or by ink onto the surface / inside the plate beside the target), stunt moves, the hidden line, pickup / ragdoll / drop. His own whims stop only when the pointer comes within 220 px of him.
- **Dev hooks** (`window.__puppet`, dev only): `desires`, `decisions`, `clawUses`, `nooks`, `letters`, `surface`, `away`, `force(activity, { trick })`, `teleport('inside' | 'outside')`, plus the existing `play`, `visit`, `probe`, `stunt`, `trust`, `events`.

## v2.8: fitted to the pinned assembly (as built)
- **Standing on pinned plates.** `PrintedPlate` now sets `data-assembled="1"` whenever the plate is whole and its arms have gone, pinned or not (`data-printed` keeps its old meaning: whole, arms gone, not pinned). It goes back to `0` the moment the scroll asks the plate to come apart (the scroll target drops below the end), a frame before anything moves. The stage treats any `data-assembled="1"` plate as standable: its top edge (if all of him fits under the header) and, for paper plates, its nooks.
- **Moving surfaces.** Each surface on a sticky plate remembers the plate's sticky geometry (stick px, natural top, end of track). Every frame its document top is `clamp(scrollY + stick, lo, hi)`, pure arithmetic, no layout read; so while a plate is pinned he stays put on screen as the page scrolls, and when the pin ends he rides off with it. His ink when he teleports off a pinned plate rides it too.
- **Coming apart.** Scrolling back up into a pin: `data-assembled` drops, his surface is gone, he hops off if there's a short route, else runs off into ink. If there's nowhere on screen to go he still inks out visibly (no blink), then waits out of sight and comes back the moment something is whole on screen (a plate coming together shortens his wait to 0.5-1.1 s).
- **Hero letter play.** The tagline's lines overlap too much to stand between them, so he plays from the top row instead: standing on a short letter (an x-height top), beside a taller letter of the same word ("Buil|d" from the "e", the "d" from the "e r" of "Builder,"), he plays with the part of the word on that side; the letters under his feet stay put. Spots keep his whole silhouette, reaching arm included, off the eyebrow and lede (their text lines, not their blocks), and a carried or stacked letter stays under the header. The stunt's terrain is unchanged.
- **Never under the header.** When the scroll takes the surface he's on (or walking along) up under the fixed header, he leaves at once: by ink straight to somewhere on screen, with no slow ink-out (most of him is already hidden), or out of sight until there's somewhere. He no longer waits there for the usual "come along" delay. A surface wholly above the top of the view still counts as off screen and uses that delay.
- **Destination gone mid-teleport.** If the spot he is gathering at goes away after he's passed through the gap (a pinned plate taken apart, its nook with it), he goes back into the gap and gathers at the best spot still on screen, or waits out of sight. (Before, this threw every frame and left him stuck in ink.)
- **Probes** still skip pinned plates (they plan in document px); he can stand on them.
- **Dev:** `__puppet.places` (how many places on screen he could be now), `surface` also shows `assembled` and its screen `top`.
- **Known limit:** while the only plate on screen is being assembled (the middle of every pin) there is nowhere he may stand, so he waits off screen. Measured in a steady read-through (a third of a screen, then a 2 s pause, longer stops on whole plates) and 3-minute idles: see DECISIONS.

## Earlier plan (v2.5, kept for reference)

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
