# Launch: cutover from GitHub Pages (v1) to Vercel (v2)

Prepared 2026-11-02 on `claude/v2.8-launch`. Nothing here has been run yet. Background and day-to-day use: `docs/DEPLOY_VERCEL.md`.

**The one thing to know:** `main` serves the live v1 site through GitHub Pages today (`CNAME` = `fuzzynop.com`). Merging the v2 PR into `main` **is** the cutover moment. GitHub Pages rebuilds from `main` on every push, and v2's raw source is not a static site (its `index.html` points at `/src/main.tsx`), so the moment v2 lands on `main` Pages would serve a blank page. Step 3 freezes v1 on its own branch first so that never reaches a visitor.

---

## What's needed from Z
- [ ] **DNS provider access** for `fuzzynop.com` (registrar or DNS host login), or someone who has it on a call.
- [ ] **Vercel access**: which account/team owns production (see step 1), and the go-ahead to add the domains there.
- [ ] **Go-ahead** for the cutover date and time (pick a quiet hour; allow 1 hour).
- [ ] **Optional links**, only if wanted at launch (they stay hidden in production until real):
  - Calendly (or other booking) URL: enables "Book time" and can become the main CTA.
  - A public email address (not the personal Gmail): enables "Email".
- [ ] **Approve the drafted lines** in `docs/CONTENT.md` ("How it maps to the site"):
  - 04 Contact: "Say hello." / "If you're working on any of this, or think I could help, get in touch." / CTA "Message me · LinkedIn" (marked "drafted, Z to confirm").
  - Pop-out body line "I also produce events and spaces with The Fuzzy Place." (marked "body line drafted").
  - Anything else in that table you'd word differently.

---

## Pre-launch QA (on the Vercel preview of the PR branch)
Run all of these against the preview URL before step 4. Tick in the PR.

**Build and content**
- [ ] `npm run check` passes on the PR branch (typecheck, tests incl. the no-dash copy test, token contrast, build).
- [ ] `/content-audit` clean: every line traces to `docs/CONTENT.md`, no name-drops, nothing from "Never publish".
- [ ] All live links open in a new tab with ↗ and land on the right page; "soon" links are hidden in production.
- [ ] Footer reads `0x90 0x90 0x90 · nothing happened here`.

**Devices and motion**
- [ ] 375 px phone: no horizontal scroll, every plate assembles, nothing overlaps text, tap targets ≥ 44 px.
- [ ] 1440 desktop: full scroll down and back up, pinned assembly plays smoothly both ways.
- [ ] Real iPhone Safari and an Android Chrome: scroll, tap the character, links.
- [ ] Firefox and Safari desktop (the link tree uses container queries).
- [ ] `prefers-reduced-motion: reduce`: everything placed, no transit, no pin-scrub.
- [ ] Keyboard only: skip link, visible orange focus ring, focus inside a plate shows it whole.

**Headers, meta, errors**
- [ ] DevTools console: no errors and no CSP violations on a full scroll (the CSP is in `vercel.json`; it was tested locally on 2026-11-02 with zero violations at 1440 and 375). Previews (`*.vercel.app`) get a second CSP that also allows the Vercel toolbar (`vercel.live`, `vercel.com` images, `assets.vercel.com` fonts, the `ws-us3.pusher.com` socket), so preview comments work. If a violation still names a Vercel toolbar URL, it is the toolbar, not the site: note it, then re-test with the toolbar off (toolbar menu, or Project Settings → General → Vercel Toolbar) or in a private window that is not signed in to Vercel.
- [ ] Response headers on `/` include `Content-Security-Policy` (on the preview it lists `https://vercel.live`; on `fuzzynop.com` it must not), `Strict-Transport-Security`, `X-Frame-Options: DENY`.
- [ ] An unknown path (e.g. `/nope`) returns **404** with the dark 404 page and a link home.
- [ ] Share card: paste the preview URL into opengraph.xyz (or a Slack DM to yourself): title "Josh Schwartz / FuzzyNop", the tagline image. Note: `og:image` points at `https://fuzzynop.com/og.png`, which only resolves after cutover, so the card on the preview may show the v1 image or none. Re-check after step 6.
- [ ] Lighthouse (mobile) on the preview: ≥ 95 accessibility, best practices, SEO; performance as high as it goes (local runs: 78 to 87, variance from the container).
- [ ] Vercel Analytics: enabled on the project (Project → Analytics → Enable) so `/_vercel/insights` answers.

---

## Cutover checklist (in order)

### 1. Vercel project (any time before launch day)
- **Use the existing preview project** `fuzzynop-redesign-preview` (STDClub team), which already builds this repo, **or** create a clean one. Recommendation: create a new project named `fuzzynop-com` in the account that should own the domain long term, so production isn't living in a project named "preview". Either works; keep only one project attached to the domains.
- New project: vercel.com → **Add New → Project → Import Git Repository** → `fuzzyplace/fuzzynop.com`. Framework preset **Vite** (pinned in `vercel.json`), build `npm run build`, output `dist`, install `npm install`, root `./`, Node 22.x (Settings → General). No environment variables.
- Settings → Git → **Production Branch: `main`**. Until the merge, `main` is v1, so the production deployment of that project will be v1 or a failed build. That's harmless: no domain points at it yet.
- Settings → Analytics → **Enable** Web Analytics.
- Optional: Settings → Deployment Protection off for production (it's a public site); keep previews protected if you like.

### 2. Add the domains in Vercel (any time before launch day)
- Project → Settings → **Domains** → add `fuzzynop.com` and `www.fuzzynop.com`. Set `www.fuzzynop.com` to **redirect to `fuzzynop.com` (308)**. `vercel.json` also redirects www to the apex.
- Vercel will show **Invalid Configuration** until DNS moves. That's expected.
- If Vercel asks to verify ownership (the domain was used on another Vercel account), add the `TXT _vercel` record it shows now; it doesn't affect the live site.
- **Write down the exact records Vercel shows** for this project. Use those, not the examples below, if they differ.
- At the DNS provider, **lower the TTL** of the apex and `www` records to 300 s at least a day before, so the switch and any rollback propagate fast.

### 3. Freeze v1 for GitHub Pages (launch day, before the merge)
1. Create a branch from the current `main`: `git switch main && git pull && git switch -c v1-pages && git push -u origin v1-pages`.
2. GitHub → repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `v1-pages` / root**. Check that Pages still shows the custom domain `fuzzynop.com` and that https://fuzzynop.com still serves v1.
3. From now on `main` can change without touching the live site. `v1-pages` is also the rollback.

### 4. Merge (launch day)
1. On the PR branch, delete `CNAME` (`git rm CNAME`), commit, push, and let the preview build go green. Leave `legacy/` alone.
2. Run the pre-launch QA above on that last preview.
3. **Merge the PR into `main`.** Vercel builds production from `main`.
4. Wait for the production deployment to be **Ready**, then open the project's production URL (`<project>.vercel.app`) and do a quick scroll. Don't touch DNS until this looks right.

### 5. Move DNS (right after step 4)
At the DNS provider for `fuzzynop.com`:

**Remove** (GitHub Pages):
| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (if present) |
| CNAME | `www` | `fuzzyplace.github.io` (or any `*.github.io`) |

**Add** (Vercel; use the values the Domains page shows, these are the usual ones):
| Type | Name | Value |
|---|---|---|
| A | `@` | `76.76.21.21` (newer projects may show `216.198.79.1`; use what Vercel shows) |
| CNAME | `www` | `cname.vercel-dns.com` (or the project-specific `*.vercel-dns-0xx.com` value Vercel shows) |

- Keep MX, SPF/DKIM/DMARC `TXT` and any other records exactly as they are.
- If there's a `CAA` record, make sure `letsencrypt.org` is allowed, or Vercel can't issue the certificate.
- Alternative: point the nameservers at Vercel DNS (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`), but then every other record (mail) has to be recreated in Vercel first. Records-only is simpler.

### 6. TLS and domain check
- Vercel → Domains: both show **Valid Configuration** and a certificate is issued (usually minutes; can take up to an hour while old records expire).
- `dig +short fuzzynop.com A` and `dig +short www.fuzzynop.com CNAME` return the Vercel values (check from a couple of resolvers, e.g. `@1.1.1.1` and `@8.8.8.8`).
- `curl -sI https://fuzzynop.com` → `200`, `server: Vercel`, `content-security-policy` present.
- `curl -sI https://www.fuzzynop.com` → `308` to `https://fuzzynop.com/`.
- `curl -sI http://fuzzynop.com` → redirect to `https://`.

### 7. Turn off GitHub Pages
- Only after step 6 is green: GitHub → **Settings → Pages → Unpublish site** (or set Source to None). Remove the custom domain there if it's still listed.
- Keep the `v1-pages` branch for a few weeks as the rollback; delete it once v2 has settled.

### 8. Smoke tests (production)
- [ ] https://fuzzynop.com loads v2; full scroll at phone and desktop width; the character appears.
- [ ] https://www.fuzzynop.com → apex.
- [ ] https://fuzzynop.com/nope → 404 page, status 404.
- [ ] `https://fuzzynop.com/og.png`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest`, `/robots.txt`, `/sitemap.xml` all 200.
- [ ] Share card on opengraph.xyz and in a real Slack / iMessage / LinkedIn post preview (LinkedIn Post Inspector refreshes its cache).
- [ ] Console: no errors, no CSP violations (production uses the strict CSP with no `vercel.live`; if you are signed in to Vercel and the toolbar shows on the custom domain, its violations are expected there, so check in a private window). Vercel Analytics shows a page view within a few minutes.
- [ ] Lighthouse on production (mobile): note the scores in the PR.

---

## Rollback
- **v2 is broken but DNS is fine:** Vercel → Deployments → pick the last good production deployment → **Promote to Production** (instant). Or `git revert` the bad commit on `main`.
- **Back to v1 entirely:** re-enable GitHub Pages from `v1-pages` (Settings → Pages, custom domain `fuzzynop.com`), then at the DNS provider swap the records in step 5 back (GitHub `A`/`AAAA` records and the `www` CNAME to `fuzzyplace.github.io`). With TTL at 300 s it propagates in minutes. GitHub then re-issues its own certificate, which can take up to an hour; tick "Enforce HTTPS" once it's offered.
- **HSTS note:** `vercel.json` sends `Strict-Transport-Security` with `includeSubDomains; preload`. Browsers will insist on HTTPS for every subdomain for 2 years. That's fine as long as every subdomain serves HTTPS. Don't submit the domain to the preload list until v2 has been stable for a while; the header alone doesn't add it.
