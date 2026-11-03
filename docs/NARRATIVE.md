# Narrative — v2.4 direction (interview with Z, 2026-11-01)

Status: **direction approved, wording draft.** Lines marked *draft* need Z's sign-off before they move to "Approved copy" in `docs/CONTENT.md` and into `src/content/site.ts`.

## The idea (never stated on the page)
- **Security is a feeling.** Nothing is ever secure; "safe" is the story people tell themselves about whether they did enough. This crosses into emotional security.
- **Then:** Z's career was playing the bogeyman: breaking over-confident stories so organisations felt appropriately *unsafe* and started protecting what mattered. Shaping narratives, not only hardening systems.
- **Now:** the same skill pointed the other way, toward people (and people beside machines) feeling *actually* safe: consciousness, wellness for hackers, AI safety, cyborg psychology.
- **Self-description (Z):** "My career and life is a series of experiments at the boundaries of safety and security, where humans and machines meet. Always asking: what would happen if? What could be? Why does it happen that way?"

## Rules for the copy
- **Say less.** Things cheapen when explained. The visitor should *feel* the ideas through visual motif, interaction and story. No anecdotes told outright; no thesis statements.
- **Voice:** warmer and more personal than v2.3, but mysterious and professional. Provoke thought and emotion; never tasteless, never hype.
- Existing rules still hold: no name-dropping, nothing from "Never publish".
- Nothing from the current approved copy is dropped. Bio, practice, capabilities and "now" areas are **condensed into fragments** inside the experiments.

## Structure: an experiment log
| Where | Content | Status |
|---|---|---|
| Hero | `What would happen if_`: the arm writes it, the cursor is left blinking. Eyebrow stays "Josh Schwartz — FuzzyNop". | direction approved |
| EXP. 01 | **Break the story they trust.** Red teaming. Hacker. Executive. **Result:** they felt less safe. They were safer. | approved (preview chosen) |
| EXP. 02 | **Build the people who break it.** Building and leading teams. Leading at the top. **Result:** the trust held. The systems didn't. | approved (Z, round 4) |
| EXP. 03 | **Make something that feels safe.** Interfaces, rituals, small systems. Art and community. **Result:** inconclusive. Repeating. | approved (Z, round 4) |
| EXP. 04 | **?** Consciousness · Wellness for hackers · AI safety · Cyborg psychology. **Result:** pending_ | approved (preview chosen) |
| Interlude | The through-line question can stay as the ink plate, or become EXP. 04's hypothesis. | open |
| End | Circuit tree (below), then the footer egg. | approved |

## Security as a feeling, as interaction (approved: "yes + a hidden line")
The character starts wary of the cursor (backs off, swats). A calm, patient cursor slowly earns trust: he stops swatting, approaches, eventually sits beside it. Grabbing or chasing him spikes fear; he's shaken for a while and the trust recovers slowly. Never explained. The visitor plays the bogeyman until they choose not to.
- **Hidden line:** appears once, only when he fully trusts you: "Nothing here is secure. He feels safe anyway." (approved, Z round 4) It's the one place the arms/human-and-machine metaphor is acknowledged (the agreed easter egg).

## Collaboration: the circuit tree
Who should feel invited: offensive security people (red teamers, bug bounty hunters); security-industry people who need help moving products forward and creating a vibe; people who need help building a team; plus art & immersive work, hacker wellness, AI safety / cyborg psychology, security culture.

Shape: one root node (Z) sends out circuit-trace branches that end in hex nodes. Hover lights the path. The character can travel the traces later.
- **Branches:** **Work** (LinkedIn, book time / Calendly, …) and **Make** (music: SoundCloud, Spotify, Mixcloud; art; interactive projects). Socials and booking may also sit at the root.
- **Management:** repo now, dashboard later. One typed list (`src/content/links.ts`: `branch`, `label`, `href`, `status: live | soon | hidden`, `order`). Adding or retiring a link is one line and the tree lays itself out. The schema is kept JSON-serialisable so it can move to Vercel Edge Config (edit in the dashboard, no redeploy) without code changes.
- **URLs:** none supplied yet beyond the allowed list. Calendly, socials, art/projects and a public email are marked `soon` until Z provides them.

## Open for the next interview round
1. ~~Results for EXP. 02 / 03~~ and ~~hidden line~~: decided in round 4.
3. Interlude: keep as its own plate, or fold into EXP. 04?
4. Calendly / socials / art / email URLs.
5. Hero (Z: "need to see a prototype"): the preview build lets Z switch `?hero=fixed|rotate` and `?interlude=keep|fold`. Exact form of the open question (`What would happen if_` vs. rotating: what would happen if / what could be / why does it happen that way).

## Main story — LOCKED (Z, 2026-11-01): "A, with B as its heart"
**The experiment is you.** Z's life is a series of experiments at the edge of safety. The page shows the past runs; the live run is the visitor. What's always being tested is whether something *feels* safe (security is a feeling: B is the heart).
- **Protagonist:** the visitor. The ink figure is the subject they interact with; Z is the experimenter, in the margins.
- **Arc:** EXP. 01–03 past runs → EXP. 04 the current run (Running.) → the figure's trust is the experiment running on the visitor right now → EXP. 05 the next run, together (Pending_), with the ways to start it.
- **Leave feeling:** seen, and curious.
- **Never say** "you are the experiment". Restraint keeps it from becoming a gimmick.
- **Decided by the story:** fixed hero "What would / happen if_" (rotate/classic removed); interlude folded into EXP. 04 as its hypothesis; Links + Contact merged into EXP. 05 (title is a blank cursor `_`, CTA + circuit tree inside); "soon" links hidden in production; nav Log · Next; share text and OG image = "What would happen if_".
- **New lines derived from the story (Z to sign off):** EXP. 04 result "Running."; EXP. 05 title "_" (screen readers: "Next"), result "Pending_".


## Copy style — LOCKED (Z, 2026-11-01): quiet first person
Z's voice, plain sentences, understated — like his original approved paragraphs. No riddles, no lab-notebook framing in the copy. A newcomer should understand in 30 seconds who Z is, what he does, and how to reach him.

## Structure (follows from the style; supersedes the experiment-log layout)
The "experiment log" device (EXP. 0N, Result lines, `?`, `_`) is retired from the copy. The page is clear chapters; the *playful* layer lives in behaviour, not words: the hero question with its blinking cursor, the ink figure (explores, learns to trust a calm cursor, gets shaken when grabbed — security is a feeling), the once-only hidden line, the circuit tree, the 0x90 footer egg.
1. **Hero** — "What would / happen if_" + one line: "Red teamer, team builder, professional bogeyman. These days, working where humans and machines meet."
2. **01 Before — Hacker. Executive.** Approved paragraphs + NEW: "Most of the work was breaking the stories people told themselves about being safe. They felt less safe afterwards. They were safer."
3. **02 Practice — I create things.** Approved paragraph + "What I do" list.
4. **The question** (ink plate) — "The through-line of my whole career has been the same question:" + the two approved questions.
5. **03 Now — These days.** "I'm working at the intersection of" + the four areas.
6. **04 Contact — Say hello.** NEW: "If you break things for a living, need help building a team, or are making something where people and machines meet, I'd like to hear about it." + CTA ("Message me · LinkedIn" until Calendly/email exist) + "Elsewhere" circuit tree.

Lines marked NEW need Z's sign-off; everything else is approved copy or Z's tagline.


## Revision — Z, 2026-11-02 (supersedes the structure above)
Hero back to the tagline "Team Builder, / Red Teamer, / Professional Bogeyman" with "Finding creative, empathetic security solutions for cyborgs." Chapters are **01 Past / 02 Present / 03 Future** (+ 04 Contact). Past = tracking bad guys → playing the adversary → building teams and leading in security (no retirement/art). Present = hackers' heads, AI safety from the human side, minds as machines appear more human. Future = Practice + Now combined: opportunities to build teams or guide projects (red teaming, AI safety, consciousness exploration, wellness for security professionals and hackers), or inspiring projects at the forefront of cyborg psychology. Exact copy: docs/CONTENT.md.
