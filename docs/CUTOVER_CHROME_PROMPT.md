# DNS cutover: prompt for Claude in Chrome

Paste everything between the lines into Claude in Chrome. Updated 2026-11-03: reuses the existing Vercel project `fuzzynop-com` (team STDClub). Launch commit: `release/v2` @ 9f69c66.

---

You're helping me (Josh, owner of fuzzynop.com) move my website from GitHub Pages to Vercel. You do the browser work; I only step in for logins, 2FA and the "confirm" points. Go one step at a time. Before any click that saves, deletes, merges or changes DNS, tell me in one line what you're about to do and wait for my "ok". Never change anything not listed here. If a page looks different from what I describe, stop and tell me what you see.

Facts:
- GitHub repo: github.com/fuzzyplace/fuzzynop.com. `main` = the live old site (GitHub Pages). `release/v2` = the new site, already tested. Merging `release/v2` into `main` is the switch.
- Vercel: team **STDClub**, project **fuzzynop-com** (already exists; don't create a new one).
- DNS: **GoDaddy**. Today: four `A` records on `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153), `CNAME www` → `fuzzynop.com`, plus Google Workspace email records (5 `MX`, a `TXT` starting `v=spf1`, a `TXT` starting `google-site-verification`). **Never touch MX or TXT records.**

Step 1 · Vercel project (vercel.com → team STDClub → project fuzzynop-com)
1. Settings → Git: confirm it's connected to `fuzzyplace/fuzzynop.com`. If not, connect it (this repo). Set **Production Branch = `main`**. Show me.
2. Settings → Build and Deployment: Framework Vite, build `npm run build`, output `dist`, Node 22.x. Fix only if different.
3. Analytics tab → enable Web Analytics.
4. Settings → Domains → add `fuzzynop.com`, then `www.fuzzynop.com` set to redirect (308) to `fuzzynop.com`. Both will say "Invalid Configuration"; that's expected.
5. Read the DNS values Vercel asks for: the `A` record value for `fuzzynop.com` and the `CNAME` value for `www`. If it also asks for a `TXT` record named `_vercel`, note it. Show me all three.

Step 2 · GoDaddy prep (godaddy.com → My Products → fuzzynop.com → DNS; I log in)
1. Show me the full current record list. Change nothing yet.
2. If Vercel asked for a `_vercel` TXT record, add exactly that one record now (it doesn't affect the live site). Confirm with me before saving.

Step 3 · Freeze the old site on its own branch (github.com/fuzzyplace/fuzzynop.com)
1. Branch dropdown → type `v1-pages` → "Create branch v1-pages from main".
2. Settings → Pages → Build and deployment → Source "Deploy from a branch" → branch `v1-pages`, folder `/ (root)` → Save. Confirm with me first.
3. Wait 1–2 minutes, then open https://fuzzynop.com in a private window: it must still show the old site. Settings → Pages must still list custom domain `fuzzynop.com`.

Step 4 · Merge the new site
1. Switch to branch `release/v2`, open the file `CNAME` in the repo root → … → Delete file → commit directly to `release/v2` with message "Remove CNAME for Vercel cutover". Confirm with me first.
2. Pull requests → New → base `main`, compare `release/v2` (or open the existing one). Title "Launch v2". Create it.
3. Confirm with me, then **Merge pull request** (normal merge commit).
4. Vercel → fuzzynop-com → Deployments: wait for the Production deployment from `main` to be **Ready**. Open its `.vercel.app` URL and scroll top to bottom. Tell me what you see. **If it's broken or blank, stop here.**

Step 5 · Switch DNS (GoDaddy DNS page)
1. Delete three of the four `A` records on `@` (keep one).
2. Edit the remaining `@` `A` record: value = Vercel's value from step 1.5 (usually 76.76.21.21), TTL = lowest option.
3. Edit `CNAME www`: value = Vercel's www value from step 1.5 (usually cname.vercel-dns.com).
4. Before saving, show me the full list and confirm the MX records and both TXT records are unchanged. Wait for my "ok", then save.

Step 6 · Verify (can take a few minutes to an hour; check every 5 minutes)
1. Vercel → fuzzynop-com → Settings → Domains: both show Valid Configuration and a certificate.
2. Private window: https://fuzzynop.com shows the new dark site ("Team Builder, Red Teamer, Professional Bogeyman"). https://www.fuzzynop.com redirects to it. https://fuzzynop.com/nope shows the dark 404 page.
3. Send me a short status.

Step 7 · Turn off the old hosting (only after step 6 is fully green)
1. GitHub → Settings → Pages → Unpublish site (or Source: None). Confirm with me first.
2. Keep the `v1-pages` branch (it's the rollback).

If something goes wrong:
- New site broken but DNS fine: Vercel → Deployments → last good production deployment → Promote to Production.
- Need the old site back: GitHub Pages → source `v1-pages`, custom domain `fuzzynop.com`; GoDaddy: `@` A records back to 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 and `www` CNAME back to `fuzzynop.com`.

When done, summarise what changed and anything left for me.

---

## After it's done (this repo's Claude session)
Verify: DNS-over-HTTPS A/CNAME show Vercel values; `curl -sI https://fuzzynop.com` → `server: Vercel` with CSP; `/nope` → 404; Vercel `list_project_domains fuzzynop-com` shows both domains verified. Then mark HANDOFF "launched".
