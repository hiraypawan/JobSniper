# StartupSniper (`JobSniper`) — Live Funded Startup & Remote Hiring Radar

A high-speed outbound intelligence web app for finding **freshly funded startups (<12 months)** across **Y Combinator (`W25`–`F26`)**, **Work at a Startup**, **Wellfound & Seed Funding Feeds**, **Product Hunt**, **Show HN / Indie Builders**, and **HN "Who is Hiring?"** — complete with **verified ATS open roles (`Greenhouse`, `Lever`, `Ashby`, `Workable`)**, **Sniper Fit Scoring (`0–100`)**, **4-Format 5-Day Build Cold Pitch Generator**, and **D1 Outreach CRM Tracking**.

---

## Architecture Highlights (Instant + Unlimited Live Worker Sync — Zero Cron Required!)

1. **3-Layer Live Worker Engine (No Cron Required)**
   - **Layer 1 — Instant Paint (`<50ms`) + Silent `Stale-While-Revalidate` (`ctx.waitUntil`)**: Serves cached D1 rows immediately while refreshing upstream feeds silently in the background when older than 15 minutes.
   - **Layer 2 — Unlimited On-Demand `"Sync Live"` & `"Force"` Buttons**: Triggers parallel ingestion across all 6 feeds (`~15` subrequests, `~1.8s` for `1,000+` startups) followed by chunked ATS enrichment (`12` companies per Worker request so each call gets its own fresh **50-subrequest budget** on Cloudflare's $0 Free Plan).
   - **Layer 3 — Live Real-Time Check on Card Click (`POST /api/companies/:id/enrich`)**: Opening any startup drawer inspects its live homepage + ATS API (`Greenhouse`, `Lever`, `Ashby`, `Workable`) in real time right before you copy your pitch.
2. **D1-Backed HTTP Cache (`100,000` Free Writes/Day vs KV's `1,000`/Day Cap)**
   - Stores upstream response cache inside SQLite/D1 (`http_cache` table) so you can refresh unlimited times on Cloudflare's free tier without hitting KV's 1,000-write daily cap (while still optionally mirroring metadata to KV if bound).
3. **100% Free Public Data Sources + Resilient Anti-Bot Fallbacks**
   - **YC Companies (`workers/fetchers/yc.ts`)**: Syncs all 8 recent YC cohorts (`W25`, `X25`, `S25`, `F25`, `W26`, `X26`, `S26`, `F26` — `940+` startups) via `yc-oss` JSON endpoints (`api.github.com` raw + `yc-oss.github.io` CDN fallback).
   - **Work at a Startup (`workers/fetchers/workatastartup.ts`)**: Parses public WAAS company data + cross-syncs live `yc-oss` active hiring feed (`300+` hiring startups & remote role links).
   - **Wellfound & Seed Funding (`workers/fetchers/wellfound.ts`)**: Parses live startup funding RSS feeds (`FinSMEs`, `EU-Startups`, `TechCrunch Startups`) for `<12mo` Pre-Seed/Seed/Series A startups (`<50` team) + verified multi-ATS seed startups fallback whenever Wellfound Turnstile (`HTTP 403`) blocks serverless IPs.
   - **Product Hunt (`workers/fetchers/producthunt.ts`)**: Parses live Product Hunt Atom XML feed (`https://www.producthunt.com/feed`, last 7 days) + live GitHub newly-launched software products with standalone domains fallback.
   - **Indie / Show HN (`workers/fetchers/indie.ts`)**: Queries Hacker News Algolia JSON API (`tags=show_hn`, last 7 days) + live GitHub indie product launches.
   - **Ask HN: Who is Hiring? (`workers/fetchers/hnHiring.ts`)**: Parses latest monthly HN hiring thread via Algolia API for remote teams, tech stacks, and direct founder emails.

---

## Local Development (`0` API Keys Needed)

Local development runs the **exact same Worker router (`workers/api.ts`) and SQL schema (`migrations/0001_init.sql`)** automatically backed by Node 22's built-in `node:sqlite` database in `.data/startupsniper.sqlite`.

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Pre-populate local SQLite DB (~1,000+ real startups in ~1.8s)
npm run sync

# 3. Start local dev server at http://localhost:3000
npm run dev
```

---

## Deploying to Cloudflare ($0 Free Plan)

### Option A: Cloudflare Pages + Pages Functions (**Recommended — Zero Cron Setup Needed!**)
Cloudflare Pages automatically deploys both the static Next.js frontend (`out/`) AND `/functions/api/[[route]].ts` in one project:

```bash
# 1. Create your D1 database once
npx wrangler d1 create startupsniper-db
# Copy the returned `database_id` into `wrangler.toml`

# 2. Initialize the remote D1 schema
npm run db:migrate:remote

# 3. Build static export + deploy to Cloudflare Pages
npm run deploy:pages
```
In Cloudflare Dashboard → **Pages → Settings → Functions → D1 database bindings**, bind variable name **`DB`** to `startupsniper-db`. Done!

### Option B: Unified Single Cloudflare Worker (`wrangler deploy`)
Deploys static assets (`./out`) + `/api/*` Worker endpoints + optional `30 0 * * *` (`6:00 AM IST`) daily pre-warm trigger from `wrangler.toml`:

```bash
npm run db:migrate:remote
npm run deploy:cf
```
