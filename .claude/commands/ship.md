---
description: Prepare a branch for deploy — check, commit, push for a Vercel preview
---
1. `/check` must pass.
2. Ensure you're on a `claude/<desc>` branch (never commit straight to `main`).
3. Commit with a clear message. Ask before `git push`.
4. After push, the Vercel Git integration builds a preview. Report the preview URL if available (`vercel ls` or the Vercel MCP tools).
5. Production = merge to `main`. Never run `vercel --prod` or change domains without explicit OK. Domain cutover steps: `docs/DEPLOY_VERCEL.md`.
