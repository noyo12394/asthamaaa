# PASS Equity Atlas

Environmental health intelligence platform: search any US location and understand
**current air quality**, **how much to trust it** (EPA monitor coverage), **who lives
there** (county health & social vulnerability), **where the equity burden concentrates**,
and **what to do next** — with a source trail behind every number and an AI agent that
interprets the data without inventing any of it.

Live: https://pass-equity-atlas.vercel.app

## What it does

- **Command Map** — full-screen 3D MapLibre command center. Layers: current-AQI hex
  surface, animated PM2.5 plume, monitor pins/towers, monitor-confidence coverage rings,
  county health-vulnerability extrusions, equity-burden choropleth, alert-priority
  cells, and unverified community reports. 2D / 2.5D / 3D modes, search + fly-to,
  click-to-inspect, layer legend, hourly timeline drawer with a scrub slider.
- **Location Inspector** — snapshot AQI/PM2.5/ozone/NO₂, nearest monitor + distance +
  coverage rating, county health & vulnerability profile, transparent 0–100 alert
  priority with per-component bars, and a full **source trail** tab (source, status,
  vintage, confidence, backend fetch ledger).
- **Sensor Placement Simulator** (flagship) — click the map to drop up to three
  hypothetical temporary monitors; see before/after monitor-sparsity class
  (dense/moderate/sparse/remote), area upgraded out of sparse/remote, and estimated
  population newly served — ranked by people-served-per-mile-of-coverage-gained.
  Explicitly a coverage-geometry simulation, never a pollution prediction.
- **Why We're Unsure layer** — uncertainty as a first-class map layer: per-cell
  monitor-sparsity class with its own legend, plus a per-location plain-language
  read-out and a "when does confidence improve?" forecast.
- **Personal Exposure Story** — plain-language card ("today this place matters for
  you because…") whose clauses expand to the exact numbers and sources the
  researcher-facing score uses — same values, no separate simplified math.
- **Equity Lens** — three factual panels (who has less monitoring, who has higher
  exposure, who carries the health burden) by county poverty terciles, plus a
  cross-state comparison across the PASS Mid-Atlantic region. Structural framing,
  no causal overreach.
- **7-Day Outlook** — weekly calendar with one row per susceptibility group
  (asthma, COPD, heart disease, children, 65+), each with its own thresholds.
- **Outcome Watchlist** — county health-outcome signals to watch; syndromic
  ER-visit rows are flagged "not yet live" rather than faked.
- **Compare Mode** — 2–5 locations side by side with data-status flags.
- **Monitor Gaps** — ranks where temporary low-cost sensors would help most
  (coverage gap × vulnerability), with "why this helps" reasoning.
- **Public confidence API** — `GET /api/confidence?lat=&lng=` exposes the
  sparsity-class/confidence calculation (CORS-open) so other tools can build on it.
- **Text/SMS path** — `GET /api/text-card?q=<zip or place>&condition=&language=`
  returns the Clinic Mode card as plain text for low-bandwidth field use.
- **Alert Builder** — watch rules (AQI threshold + condition profile) evaluated by a
  scheduled Vercel Cron refresh (daily on Hobby, every 15 min on Pro); trigger history in the UI. Email/SMS is architecture-stubbed,
  intentionally not enabled.
- **Clinic Mode** (flagship) — a visually distinct plain-language mode: printable
  patient handout with the monitor-confidence situation explained practically,
  2–3 condition-specific actions, doctor-conversation prompts, and full Spanish
  generation (same numbers, translated narrative). Narrative is generated at
  request time from live numbers via LLM when `OPENAI_API_KEY` is set; otherwise
  reviewed bilingual templates (labeled either way).
- **Methods** — the full scoring formula, source list, and interpretation limits,
  written for professor/health-department review.
- **Exposure Navigator** — an agent with 11 backend tools (air quality, county
  profiles, risk scoring, comparisons, watch-rule creation, sensor placement, clinic
  messages, uncertainty explanation). With `OPENAI_API_KEY` it runs a function-calling
  loop; without it, a clearly-labeled deterministic tool router answers the common
  intents using the same tools. Either way it can only cite what the backend sourced.

## Architecture (backend-first)

```
Browser ──> Next.js route handlers (/api/*) ──> lib/ domain modules ──> external APIs
                 │                                   │                  (Open-Meteo,
                 │                                   ├── TTL cache      AirNow*, …)
                 │                                   ├── fetch ledger (source_logs)
                 │                                   ├── scoring engine
                 │                                   └── store: Postgres (Drizzle)
                 │                                             or in-memory fallback
                 └── Vercel Cron (daily; 15-min on Pro): refresh + watch rules
```

The browser never calls external APIs. Every fetch is cached (10 min for current air
quality, 24 h geocoding, long-term county data), logged to the source ledger, and
labeled `live / cached / modeled / official / estimated / fallback` with a confidence
level. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_SOURCES.md](DATA_SOURCES.md),
[SCORING.md](SCORING.md).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000 — works with zero configuration
```

With no env vars the app is fully functional: real county boundaries (US Census),
live Open-Meteo air quality when the network allows (labeled fallback otherwise),
in-memory persistence, and the deterministic agent.

```bash
cp .env.example .env.local   # then fill in what you have:
# DATABASE_URL     -> durable saved places / watch rules / observations
# OPENAI_API_KEY   -> conversational agent
# CRON_SECRET      -> protects /api/cron/refresh
```

### Database (optional)

```bash
npm run db:push      # create tables from src/db/schema.ts (needs DATABASE_URL)
npm run seed         # load counties/monitors/health/vulnerability snapshots
```

### Refreshing the data snapshots

Committed snapshots in `src/data/` are labeled with their provenance. Counties are
real US Census boundaries; monitors/health/vulnerability ship as **clearly-labeled
fallback seeds** until you run the real ingestions (needs network access to the
agencies):

```bash
npm run ingest:counties        # US Census cartographic boundaries (already real)
npm run ingest:monitors        # AirNow monitoring site list (official)
npm run ingest:health          # CDC PLACES county release (official)
npm run ingest:vulnerability   # CDC/ATSDR SVI county release (official)
```

### Tests

```bash
npm test             # vitest: AQI math, geo, scoring engine, API routes, agent
npm run lint && npm run typecheck
```

## Deploy to Vercel

1. Import the repo in Vercel (framework auto-detected; `vercel.json` adds the
   cron for `/api/cron/refresh` — daily by default; tighten to `*/15 * * * *` on the Pro plan).
2. Set env vars as available: `DATABASE_URL`, `OPENAI_API_KEY`, `CRON_SECRET`,
   optionally `AIRNOW_API_KEY`, `NEXT_PUBLIC_MAP_STYLE_URL`.
3. If using Postgres: `npm run db:push && npm run seed` against the production DB.

## Current limitations

- Air quality is **model output** (Open-Meteo/CAMS), not monitor readings; the AQI
  shown is an hourly snapshot, not a 24-hour regulatory value. Monitor distance is
  surfaced everywhere precisely because it bounds how verifiable the model is.
- Monitor/health/vulnerability snapshots ship as labeled fallback seeds until the
  ingestion scripts are run against the real agencies (see above). The UI shows an
  amber `FALLBACK` badge wherever such values appear.
- Without `DATABASE_URL`, user records are per-instance and non-durable (the UI
  says so). Without `OPENAI_API_KEY`, the agent is deterministic (labeled).
- Alert delivery is in-app only; email/SMS integration is stubbed by design.
- County-level indicators cannot describe individuals — the UI and agent repeat
  this wherever they appear.
