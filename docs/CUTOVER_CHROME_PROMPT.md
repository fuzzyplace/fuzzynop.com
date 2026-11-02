# Prompt for Claude in Chrome: DNS cutover (GoDaddy → Vercel)

Run this only after `release/v2` is declared final (see docs/HANDOFF.md). Paste everything below the line into Claude in Chrome.

---

You're helping me (Josh, owner of fuzzynop.com) move my website from GitHub Pages to Vercel. You do the browser work; I only step in for logins, 2FA, payment prompts, and the explicit "confirm" points below. Go one step at a time. Before any click that saves, deletes, merges or changes DNS, tell me in one line what you're about to do and wait for my "ok". Never change anything not listed here.

**Facts**
- Repo: github.com/fuzzyplace/fuzzynop.com. `main` = the live old site (GitHub Pages). `release/v2` = the new site, already tested. Merging `release/v2` into `main` is the switch.
- Vercel team: STDClub. There's an existing preview project `fuzzynop-redesign-preview`; create a new production project instead.
- DNS is at **GoDaddy**. Current records: four `A` records on `@` (185.199.108.153, .109, .110, .111 = GitHub), `CNAME www` → `fuzzynop.com`, Google Workspace mail (5 `MX` records) plus `TXT` SPF and `google-site-verification`. **Never touch MX or TXT records.**
- The full checklist is `docs/LAUNCH.md` in the repo.

**Step 1 · Vercel project**
1. vercel.com, team STDClub → Add New → Project → Import `fuzzyplace/fuzzynop.com`. Name it `fuzzynop-com`. Framework Vite, build `npm run build`, output `dist`, Node 22.x, no environment variables. Deploy.
2. Settings → Git → Production Branch = `main`. (The first production build shows the old site or fails. That's fine; no domain points at it yet.)
3. Settings → Analytics → Enable Web Analytics.
4. Settings → Domains: add `fuzzynop.com` and `www.fuzzynop.com`; set www to redirect (308) to `fuzzynop.com`. If Vercel asks for a `_vercel` TXT verification record, note its exact value.
5. Copy down exactly what Vercel says the DNS records should be (apex `A` value, usually 76.76.21.21; www `CNAME` value, usually cname.vercel-dns.com). Show them to me.

**Step 2 · Freeze the old site** (so it stays up during the switch)
1. GitHub repo → branch dropdown → create branch `v1-pages` from `main`.
2. Settings → Pages → Source: deploy from branch `v1-pages`, root. Confirm the custom domain still reads `fuzzynop.com` and https://fuzzynop.com still shows the old site.

**Step 3 · Prepare and merge**
1. On branch `release/v2`, delete the file `CNAME` in the repo root (file view → … → Delete file), commit message "Remove CNAME for Vercel cutover". **Confirm with me first.**
2. Open a pull request `release/v2` → `main` (or use the existing one). Wait for checks.
3. **Confirm with me**, then merge the PR.
4. Vercel, project `fuzzynop-com` → Deployments: wait for the production deployment to be Ready. Open its `.vercel.app` URL and scroll top to bottom. Tell me if anything looks broken. **Stop here if it does.**

**Step 4 · GoDaddy DNS** (I log in)
1. godaddy.com → My Products → `fuzzynop.com` → DNS.
2. Show me the current record list before changing anything.
3. Delete three of the four GitHub `A` records on `@`; edit the fourth to the Vercel apex value from step 1. TTL: the lowest allowed.
4. Edit `CNAME www` to the Vercel www value from step 1.
5. If Vercel asked for a `_vercel` TXT record, add it (only that one).
6. Before saving, show me the final list and confirm MX records, the SPF TXT and the google-site-verification TXT are unchanged. **Wait for my ok**, then save.

**Step 5 · Verify** (minutes to an hour)
1. Vercel → Domains: both Valid Configuration with a certificate (refresh every few minutes).
2. https://fuzzynop.com in a private window: the new site (dark page, "Team Builder, Red Teamer, Professional Bogeyman").
3. https://www.fuzzynop.com redirects to fuzzynop.com; https://fuzzynop.com/nope shows the dark 404 page.
4. Report back.

**Step 6 · Turn off the old hosting** (only after step 5 is fully green)
1. GitHub → Settings → Pages → Unpublish site (or Source: None). **Confirm with me.**
2. Keep the `v1-pages` branch; it's the rollback.

**If something goes wrong**
- New site broken, DNS fine: Vercel → Deployments → last good one → Promote to Production.
- Need the old site back: re-enable GitHub Pages from `v1-pages`; in GoDaddy set the `@` A records back to 185.199.108.153/.109/.110/.111 and `www` back to `fuzzynop.com`.

At the end, give me a short summary of what changed and anything I still need to do.
