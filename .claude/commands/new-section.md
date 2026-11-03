---
description: Build or redesign one page section — /new-section <Name>
argument-hint: <SectionName>
---
Build the `$ARGUMENTS` section.

1. Read `docs/DESIGN_SYSTEM.md`, `docs/BRIEF.md`, and the `$ARGUMENTS` content in `src/content/site.ts` + `docs/CONTENT.md`.
2. Look at the v1 equivalent in `legacy/v1/index.html` for what to keep (copy, links, motifs) — do not copy its CSS.
3. Propose the layout in 3–5 bullets (grid, type roles, the one organic gesture, the one orange accent, motion), then build it in `src/sections/$ARGUMENTS.tsx` and mount it in `App.tsx` replacing the inline version.
4. Tokens only. Copy only from `site.ts` (add there first, flag new claims `confirm: true` and log them in `docs/DECISIONS.md`).
5. Mobile 375px first; reduced-motion safe; keyboard-reachable.
6. Run `/check`. If Playwright is installed, run `node scripts/screenshot.mjs` and look at both screenshots before calling it done.
