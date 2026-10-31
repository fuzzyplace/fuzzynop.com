# Deploy — Vercel

Current (v1): GitHub Pages, `CNAME` = `fuzzynop.com`, repo `fuzzyplace/fuzzynop.com`, branch `main`.
Target (v2): Vercel, Git-connected, preview per branch, production on `main`.

## 1. Connect the project (once)
1. vercel.com → **Add New → Project → Import Git Repository** → `fuzzyplace/fuzzynop.com`.
2. Framework preset: **Vite** (auto-detected; also pinned in `vercel.json`).
3. Build: `npm run build` · Output: `dist` · Install: `npm install` · Node: 22.x (Settings → General → Node.js Version).
4. Root directory: `./`. No env vars needed for v2.0.
5. Deploy → verify the `*.vercel.app` preview.

CLI alternative:
```bash
npm i -g vercel
vercel link            # pick/create project "fuzzynop-com"
vercel                 # preview deploy
vercel --prod          # production deploy
```

## 2. Analytics
Project → **Analytics → Enable** (Web Analytics). `@vercel/analytics` is already mounted in `App.tsx`. Optional: Speed Insights (`npm i @vercel/speed-insights`, add `<SpeedInsights />`).

## 3. Domain cutover (do last, after v2 is approved on preview)
1. Vercel → Project → **Settings → Domains** → add `fuzzynop.com` and `www.fuzzynop.com` (set www → redirect to apex; `vercel.json` also enforces it).
2. At the DNS provider, use the exact records Vercel shows. Typically:
   - `A  @    76.76.21.21`
   - `CNAME www  cname.vercel-dns.com`
   - Remove the GitHub Pages `A` records (185.199.108–111.153) and any `www` CNAME to `*.github.io`.
   Or move nameservers to Vercel DNS.
3. Wait for Vercel to show **Valid Configuration** + issued TLS cert.
4. GitHub → repo Settings → Pages → **disable**. Then delete `CNAME` from the repo.
5. Smoke test: `https://fuzzynop.com`, `https://www.fuzzynop.com` (→ apex), OG preview (opengraph.xyz), Lighthouse.

## 4. Day-to-day
- Push branch → automatic preview URL (comment on PR).
- Merge to `main` → production.
- Rollback: Vercel → Deployments → previous → **Promote to Production** (instant).

## Config in repo
- `vercel.json` — framework, build/output, www→apex redirect, security headers, immutable caching for `/assets/*`.
- `.nvmrc` — Node 22.
