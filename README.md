# StartupSniper

A small lead board for people who sell 5-day builds to early startups.

It pulls freshly funded companies from public sources, checks their job boards,
gives each one a fit score, and drafts the first DM or email. Everything you
have already contacted stays in a tiny built in CRM so you do not write to the
same founder twice.

I built it because I was opening six tabs every morning: Y Combinator, Work at
a Startup, Wellfound, Product Hunt, Hacker News, then a spreadsheet. This does
that loop in one page.

## What it does

- Pulls startups from six public feeds and dedupes them by domain.
- Reads ATS boards (Greenhouse, Lever, Ashby, Workable) to count real open roles.
- Scores every lead from 0 to 100 so the small funded teams with open roles show up first.
- Writes four pitch formats per lead: short DM, role based DM, LinkedIn note under 300 characters, and a cold email.
- Tracks outreach status (new, saved, pitched, demo sent, replied, archived) with notes and follow up reminders.
- Exports the filtered list to CSV.

## Where the data comes from

| Source | What it pulls | File |
| --- | --- | --- |
| Y Combinator | Recent cohorts (W25 to F26), about 940 companies, through the yc-oss JSON endpoints | `workers/fetchers/yc.ts` |
| Work at a Startup | Companies that are actively hiring right now, plus remote role links | `workers/fetchers/workatastartup.ts` |
| Wellfound and seed news | Funding RSS feeds (FinSMEs, EU Startups, TechCrunch Startups) filtered to rounds from the last 12 months and teams under 50 | `workers/fetchers/wellfound.ts` |
| Product Hunt | The public Atom feed for the last 7 days, plus new GitHub products with their own domain | `workers/fetchers/producthunt.ts` |
| Show HN | Hacker News Algolia API for `show_hn` posts from the last week | `workers/fetchers/indie.ts` |
| HN "Who is hiring?" | The newest monthly thread, parsed for remote roles and founder emails | `workers/fetchers/hnHiring.ts` |

Wellfound itself sits behind Cloudflare Turnstile and returns a 403 to most
serverless IPs. That fetcher therefore uses the funding RSS feeds as the primary
path and falls back to seed stage companies with verified job boards.

## How a page load works

1. `GET /api/companies` reads straight from D1. The first paint usually lands
   under 50ms because nothing is fetched upstream on that path.
2. If the cached feed is older than 15 minutes, the worker schedules a refresh
   with `ctx.waitUntil` and returns the stale rows anyway. You never wait for a
   network round trip on load.
3. Pressing **Sync Live** runs every fetcher in parallel, then enriches ATS data
   in batches of 12 companies. Each batch is a separate request, so each one
   gets its own 50 subrequest budget on the Cloudflare free plan.
4. Opening a company calls `POST /api/companies/:id/enrich`, which checks that
   one site and its job board right before you copy the pitch.

Upstream responses are cached in SQLite inside D1 (the `http_cache` table)
instead of KV, because the free KV tier allows 1,000 writes per day and D1
allows 100,000. That is what makes the Force button safe to spam.

## Fit score

`lib/scoring.ts` adds points for four things:

- How recent the funding is (32 points for a fresh cohort or a round in the last six months, 24 for the last twelve).
- Team size (25 points for 1 to 10 people, less as the team grows).
- Open roles and a real ATS board (up to 25 points).
- Remote friendly, a reachable founder, and more than one source (up to 22 points).

Scores clamp between 15 and 99. The breakdown is shown in the drawer, so you can
see why a company landed where it did.

## Running it locally

You do not need any API keys. Local dev runs the same Worker router
(`workers/api.ts`) and the same schema (`migrations/0001_init.sql`), backed by
Node 22's built in `node:sqlite` in `.data/startupsniper.sqlite`.

```bash
npm install

# optional: fill the local database with real companies first
npm run sync

# http://localhost:3000
npm run dev
```

Other scripts:

```bash
npm run typecheck     # tsc --noEmit
npm run build         # Next.js production build
npm run check:copy    # fails on em dashes or filler phrases in the copy
```

## Deploying

Both options run on the free Cloudflare plan.

### Pages with Pages Functions (what I use)

```bash
npx wrangler d1 create startupsniper-db
# paste the returned database_id into wrangler.toml

npm run db:migrate:remote
npm run deploy:pages
```

Then open the Pages project, go to Settings, Functions, D1 database bindings,
and bind `DB` to `startupsniper-db`. No cron job is required: the refresh
happens inside the request that needs it.

### One Worker for everything

```bash
npm run db:migrate:remote
npm run deploy:cf
```

This serves `./out` as static assets and mounts `/api/*` on the same Worker. The
`wrangler.toml` also has an optional `30 0 * * *` trigger (6:00 AM IST) if you
would rather warm the cache on a schedule.

## AI keys

AI is optional. The template pitches work without it and always stay on screen
as a fallback.

### Your own key

Open **My 5d Offer** from the header, paste a key, and press Test:

- Gemini keys start with `AIza`.
- OpenRouter keys start with `sk-or-`.

Keys are kept in `localStorage` and never sent to this app's own server. On save
the format is checked, and Test sends a one token request straight to the
provider so you get a real answer instead of a guess.

### One shared key for everyone

Set a key on the server and the browser will call `POST /api/ai` instead. The
key never reaches the client.

```bash
npx wrangler secret put OPENROUTER_API_KEY
# or
npx wrangler secret put GEMINI_API_KEY
```

On Pages, add the same name under Settings, Environment variables. If the proxy
is not configured, the app quietly falls back to a direct browser request with
your own key.

### When it fails

Errors are shown in the drawer, not swallowed: 401 for a bad key, 404 for a
removed model (OpenRouter then tries the next model in the list), 429 with
retries and backoff, an 8 second timeout, and a JSON parse error. In every case
you keep the template pitch and get a Retry button.

## Notes

- Everything here reads public pages and public APIs. No paid data provider, no scraped logins.
- Company counts move around because the feeds do. A quiet week in YC means fewer new rows.
- The AI is asked to write like a person, not a brochure. Generated text is also
  cleaned before it reaches the UI (see `lib/humanize.ts`), which removes em
  dashes and a short list of filler phrases.
- The repo has no tests worth bragging about yet. `npm run typecheck` and
  `npm run check:copy` are what I run before pushing.

## Layout

```
app/          Next.js dashboard and API routes
components/   Cards, drawers, filters, settings
lib/          Scoring, pitch templates, AI helpers, shared types
workers/      Cloudflare Worker router, D1 helpers, source fetchers
functions/    Pages Functions entry for /api/*
migrations/   D1 schema
scripts/      Local sync runner and build helpers
```
