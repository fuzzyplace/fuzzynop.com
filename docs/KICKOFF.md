# Kickoff prompt — new session (paste everything below the line)

---

You're picking up **fuzzynop.com**, a portfolio for Josh Schwartz ("Z"). It has two goals:
1. Get the site to a **done state Z is happy with**, and make it a better, more delightful experience along the way.
2. Turn what we build into a **reusable design system + Claude skill** so others can make their own "living stage" sites.

Branch: `release/v2` (canonical; PR `release/v2` → `main` is the launch). Commit small, push often, and run `npm run check` before every commit.

## 0. Orient (≤ 15 min, then report back in 10 lines)
Read in this order:
1. `CLAUDE.md`
2. `docs/HANDOFF.md` → "Current state"
3. `docs/NARRATIVE.md`
4. `docs/CONTENT.md`
5. `docs/DECISIONS.md` → open assumptions
6. `docs/DESIGN_SYSTEM.md`

Skim `src/art/` (character engine) and `src/content/` (all copy and links).

Then tell me:
- what exists
- what's broken or unverified
- every open decision, grouped by the layer it belongs to (see §1)

## 1. How we decide things (this matters most)
Last time the site's visuals were finished long before its story and copy style were settled. I was then asked to approve lines one card at a time, and the result didn't make sense. Decide **top-down, one layer at a time**, and never ask about a lower layer until the one above is locked:

1. **Intent:** who it's for, and what they should feel and do at the end.
2. **Story:** the arc, scroll top to bottom.
3. **Copy style:** voice, sentence shape, framing devices.
4. **Structure:** sections, and what each one is for.
5. **Lines:** the actual words.
6. **Visual and interaction polish.**

Write each locked layer into `docs/NARRATIVE.md` under "LOCKED". Everything below it must trace back to it. If a later idea contradicts a locked layer, say so and ask before changing anything.

Current status:
- **Intent and story:** "A, with B as its heart" (the experiment is you; security is a feeling) is locked in NARRATIVE.md, but I'm not happy with how it reads. Re-interview me on story **after** copy style.
- **Copy style:** not locked. Start here.

## 2. How to interview me
- **One question at a time**, in plain chat text. No multi-question dialogs; they kept getting dismissed or lost context.
- **Before each question:** say what it decides and what it affects on the page.
- **Show, don't describe.** Give 3–4 options, each written out on *real* page content: the same 3 moments (opening, one chapter, the ending), rendered as a quick artifact or screenshot in context.
- **Give a recommendation and why.** I'll pick, mix, or push back.
- **After I answer,** restate what's now locked in one line, then ask the next question.
- **If I say "your call",** decide, log it in DECISIONS, and move on.
- **Rules that always apply:** no name-dropping (employers, clients, titles, conferences); privacy rules in CONTENT.md. Draft copy is fine; publishing unapproved copy is not.

## 3. How to show me work
- Every round ends with a **Vercel preview URL**:
  - project `fuzzynop-redesign-preview`, team STDClub
  - deploy via the Vercel MCP `create_deployment` with `gitSource` (org `fuzzyplace`, repo `fuzzynop.com`, this branch, exact sha)
  - previews require Vercel login
- **Also include:** before/after screenshots of what changed (desktop 1440, mobile 375, reduced motion).
- **For a choice:** build the options behind a `?variant=` switch in one preview, so I compare them in context. Delete the losers once I pick.
- **Keep status reports short:** done / needs my eye / waiting on me. List each question once, in one batch at the end.

## 4. Environment notes (cloud container)
- Playwright: launch with `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. The repo scripts' bare `launch()` fails here.
- Temp scripts: put them in `scripts/_*.tmp.mjs` and delete them before committing.
- Never `pkill -f` a pattern that matches your own command.
- **Delegating:**
  - Use worktree agents only for clearly separable work.
  - Give each agent explicit file ownership; for example, the character engine (`src/art/*`) and the page/copy files (`src/App.tsx`, `src/components/*`, `src/content/*`) go to different agents.
  - Merge often.
  - Require each agent to verify in a real browser, not just `npm run check`.
- I review on the Vercel preview, not localhost.

## 5. Definition of done (site)
- **Every line** traces to LOCKED story and style plus approved copy in CONTENT.md. A newcomer can tell in 30 seconds who Z is, what he does, and how to reach him.
- **Quality:**
  - Lighthouse ≥ 95 in all categories
  - WCAG 2.1 AA
  - no horizontal scroll at 375px
  - reduced motion respected
  - works in Safari, Firefox and on touch
- **Character:** never covers text, never under the header, feels alive (explores, trusts, reacts), and the loop sleeps when idle.
- **Links and CTA:** real links only; "soon" items are hidden in production. A working CTA (Calendly or email once I provide them).
- **Launch:** OG image and meta match the story, the domain is cut over to Vercel (`docs/DEPLOY_VERCEL.md`), and analytics are on.

## 6. Make it better (pitch these, don't just build them)
After each locked layer, suggest 2–3 delightful features that serve the story. For example:
- the fog thins as you near the end
- the figure follows you to the last plate
- the printer arm "logs" each result as you arrive
- a sound toggle
- a terminal easter egg

Each pitch gets one line: what it does, why it fits, and its cost (performance or accessibility). I approve before you build.

## 7. Second track: reusable design system + skill (don't let it block the site)
Treat fuzzynop.com as the **reference implementation** and design for extraction now.
- **Keep boundaries clean.**
  - `src/art/` (ticker, PrintedPlate, MechArm, Puppeteer, the character behaviour modules) must contain no fuzzynop copy or hardcoded identity.
  - The look comes from `design/tokens.json` → `tokens.css`.
  - All words and links live in `src/content/`.
  - The character's SVG body is a swappable module behind a small typed interface.
- **Document the system** in `docs/system/`:
  - tokens and theming
  - components and their props
  - the art engine's contracts: `[data-perch]`, `[data-ledge]`, `[data-poi]`, print states, performance rules
  - the character API
  - accessibility and motion rules
- **Draft the skill** at `.claude/skills/living-stage-site/SKILL.md`, a guided workflow for someone new:
  1. interview: intent → story → copy style, using §1–2 above
  2. generate `content/*.ts`
  3. choose palette and fonts as tokens
  4. design their character silhouette
  5. scaffold the plates
  6. review loop with previews
  7. deploy
- **Extract** into a separate package or template repo only once the site is done; propose the structure first.
- **Track it** in `docs/system/ROADMAP.md`.

## Start
Do §0 and report. Then begin the copy-style interview (§1 layer 3) per §2. Last time I was shown four styles on real content: lab notebook, quiet first person, terminal log, field notes, plus a recommended mix ("first-person sentences inside terminal-style labels"). Re-present them as a rendered artifact so I can see them on the page.
