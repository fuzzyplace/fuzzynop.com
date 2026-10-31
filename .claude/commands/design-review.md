---
description: Review the current UI against the design system (delegates to design-reviewer)
---
Build and serve the site (`npm run build && npx vite preview --port 4173`), capture screenshots with `node scripts/screenshot.mjs` if Playwright is available, then use the **design-reviewer** subagent on `src/` and the screenshots. Return its findings ranked by severity with concrete fixes. Don't apply fixes unless asked.
