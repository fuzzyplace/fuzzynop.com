---
description: Audit all site copy for accuracy, sourcing, privacy, and voice (delegates to content-editor)
---
Use the **content-editor** subagent on `src/content/site.ts` against `docs/CONTENT.md` and `docs/BRIEF.md`. Report: untraceable claims, privacy violations, broken/odd links, tone misses, and every `confirm: true` item still pending. Suggest tighter copy where it helps; don't apply changes unless asked.
