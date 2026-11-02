# fuzzynop.com — Claude Code guide

Portfolio for **Josh Schwartz aka FuzzyNop ("Z")**: red teamer, security leader, artist, educator, game designer, DJ.
Redesign v2: Limbo-like ink + paper-cut silhouettes on fog, biomechanical spider-leg arms that 3D-print the page as you scroll, hexagons, ink splatter, and a small ink character of Z carried around by the arms. High-contrast black/white/gray; orange only as the printer's hot tip.
Tone: **understated. No hype, no buzzwords, no name-dropping. Let the work speak.**

Read before any work:
1. `docs/BRIEF.md` — goals, audience, scope
2. `docs/DESIGN_SYSTEM.md` — tokens, type, components, motion (source of truth: `design/tokens.json` → `src/styles/tokens.css`)
3. `docs/CONTENT.md` — approved copy (Z's own words) + what must never be published
4. `docs/DEPLOY_VERCEL.md` — hosting, domains, cutover from GitHub Pages
5. `docs/DECISIONS.md` — decision log + open assumptions
6. `docs/HANDOFF.md` — **current build brief (v2.3)** — start here for new work
7. `design/references/` — mood + likeness images (reference only, never ship)

## First-time setup
Run once from the repo root: `mv _claude .claude` (Claude config is staged as `_claude/` because it couldn't be written to `.claude/` remotely). Then `npm install`.

## Stack
- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v4 via `@tailwindcss/vite`; theme maps to M3-style CSS variables in `src/styles/tokens.css`
- Animation runs on one shared ticker (`src/art/ticker.ts`: read phase then writes, loops sleep when settled); no animation library. Three.js only if a section earns it (lazy-load)
- `@vercel/analytics` for analytics
- Hosting: Vercel (framework preset: Vite, output `dist/`)

## Commands
```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + production build — run before every commit
npm run preview    # serve dist/
```

## Layout
```
src/
  content/site.ts      # ALL copy + links live here (typed). Components never hardcode copy.
  art/                 # the illustration engine: MechArm (IK arms), PrintedPlate (scroll-printed plates),
                       # Puppeteer + Character (Z's silhouette carried between [data-perch] plates), Decor, ArtDefs (filters/fog/grain)
  components/          # small UI pieces (PlateHeader, Prose, LinkRow, HexBadge)
  sections/            # Hero (arm writes the tagline)
  styles/tokens.css    # design tokens (CSS vars) + Tailwind @theme mapping
  styles/global.css    # base styles, utilities
design/tokens.json     # canonical tokens (edit here first, mirror to tokens.css)
public/                # og.png, favicon, static assets
legacy/v1/             # previous hand-written site — reference only, never edit, never ship
```

## Rules
- **Tokens only.** No raw hex, px font sizes, or ad-hoc easings in components. Use `bg-surface`, `text-on-surface`, `text-primary`, `font-display`, etc. New value → add to `design/tokens.json` + `tokens.css` first.
- **Orange is a whisper.** `accent` role only: nozzle hot tip + print line while printing, focus ring, 1px hover underline. Never a fill behind text, never a button/chip/eyebrow/headline. ≤ 2 orange moments per screen. Everything else is black, white, gray (`gray-100`…`gray-900`; text uses 100–500 only).
- **Copy lives in `src/content/site.ts`.** Every line must trace to "Approved copy" in `docs/CONTENT.md`. Prefer Z's own phrasing.
- **No name-dropping.** No employers, titles, clients, conferences, publications, collaborators, or orgs — even though the background is in CONTENT.md for context.
- **Voice:** Z's own, first person, plain and direct. Write like a professional portfolio copywriter, never like an AI: no stock phrases, no filler triads, no "where X meets Y". **No em or en dashes anywhere on the page (hard rule; `src/content/copy.test.ts` enforces it).** No "passionate about" lists, no exclamation marks, no emoji. Don't introduce Z's "z for s" quirk here unless asked; never "correct" it if present.
- **Privacy:** never publish home addresses, personal email, family/relationship details, health info, job-search or relocation plans, or anything outside "Approved copy".
- **Accessibility:** WCAG 2.1 AA minimum. Semantic landmarks, visible focus (orange `--md-sys-color-accent` ring), `prefers-reduced-motion` respected everywhere, text contrast ≥ 4.5:1, color never the only signal.
- **Performance:** Lighthouse ≥ 95 all categories. No layout shift from fonts (`display=swap` + fallbacks). Lazy-load anything heavy (Three.js, video).
- **Mobile-first.** Test at 375px. No horizontal scroll. Desktop-only effects degrade to clean fades.
- External links: `target="_blank" rel="noopener noreferrer"` + visible ↗ affordance.
- Don't touch `CNAME` or `legacy/` until DNS cutover (see `docs/DEPLOY_VERCEL.md`).

## Art rules
- Read "Art direction" in `docs/DESIGN_SYSTEM.md` before touching `src/art/`.
- All art is original inline SVG. Never import or trace reference images (Limbo, Westworld) or photos.
- New content block → wrap in `<PrintedPlate side tone>`; it becomes a perch automatically.
- Arms must never park over text. Text never sits directly on fog without a plate or shade.
- Test in a real scroll: `scripts/screenshot.mjs` scrolls with mouse.wheel; also check `prefers-reduced-motion`.

## Workflow
- **Canonical branch: `release/v2`** (the finished v2 site). Work in short-lived `claude/<short-desc>` branches off it, merge back, delete after. Open PR: `release/v2` → `main`; merging it is the launch cutover (see `docs/LAUNCH.md`). Small commits. `npm run check` must pass.
- Slash commands: `/check`, `/new-section <Name>`, `/design-review`, `/content-audit`, `/ship`.
- Subagents: `design-reviewer` (tokens/a11y/aesthetic/orange budget), `content-editor` (voice, sourcing, no name-drops).
- When unsure, make the best reasonable assumption, keep building, and log it in `docs/DECISIONS.md` → "Open assumptions". Z reviews in batches.
