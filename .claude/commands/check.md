---
description: Typecheck, token contrast, production build, and a quick rules sweep
---
1. Run `npm run check`. Fix any failure before continuing.
2. Grep `src/` (excluding `src/styles/`) for raw hex colors (`#[0-9a-fA-F]{3,8}`), arbitrary Tailwind values (`-\[`), and `px` font sizes. Report each with file:line and the token that should replace it.
3. Grep for `target="_blank"` without `rel="noopener noreferrer"`.
4. Check every entry in `src/content/site.ts` against `docs/CONTENT.md`; list anything not traceable.
5. Summarize: PASS or a short list of fixes.
