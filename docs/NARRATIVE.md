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
| EXP. 02 | **Build the people who break it.** Building and leading teams. Leading at the top. **Result:** *draft* | title draft |
| EXP. 03 | **Make something that feels safe.** Interfaces, rituals, small systems. Art and community. **Result:** *draft* | title draft |
| EXP. 04 | **?** Consciousness · Wellness for hackers · AI safety · Cyborg psychology. **Result:** pending_ | approved (preview chosen) |
| Interlude | The through-line question can stay as the ink plate, or become EXP. 04's hypothesis. | open |
| End | Circuit tree (below), then the footer egg. | approved |

## Security as a feeling, as interaction (approved: "yes + a hidden line")
The character starts wary of the cursor (backs off, swats). A calm, patient cursor slowly earns trust: he stops swatting, approaches, eventually sits beside it. Grabbing or chasing him spikes fear; he's shaken for a while and the trust recovers slowly. Never explained. The visitor plays the bogeyman until they choose not to.
- **Hidden line:** appears once, only when he fully trusts you. Wording *draft*, to agree with Z. It's the one place the arms/human-and-machine metaphor is acknowledged (the agreed easter egg).

## Collaboration: the circuit tree
Who should feel invited: offensive security people (red teamers, bug bounty hunters); security-industry people who need help moving products forward and creating a vibe; people who need help building a team; plus art & immersive work, hacker wellness, AI safety / cyborg psychology, security culture.

Shape: one root node (Z) sends out circuit-trace branches that end in hex nodes. Hover lights the path. The character can travel the traces later.
- **Branches:** **Work** (LinkedIn, book time / Calendly, …) and **Make** (music: SoundCloud, Spotify, Mixcloud; art; interactive projects). Socials and booking may also sit at the root.
- **Management:** repo now, dashboard later. One typed list (`src/content/links.ts`: `branch`, `label`, `href`, `status: live | soon | hidden`, `order`). Adding or retiring a link is one line and the tree lays itself out. The schema is kept JSON-serialisable so it can move to Vercel Edge Config (edit in the dashboard, no redeploy) without code changes.
- **URLs:** none supplied yet beyond the allowed list. Calendly, socials, art/projects and a public email are marked `soon` until Z provides them.

## Open for the next interview round
1. Results for EXP. 02 and EXP. 03.
2. Hidden trust line wording.
3. Interlude: keep as its own plate, or fold into EXP. 04?
4. Calendly / socials / art / email URLs.
5. Hero: exact form of the open question (`What would happen if_` vs. rotating: what would happen if / what could be / why does it happen that way).
