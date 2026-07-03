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
- **Compare Mode** — 2–5 locations side by side with data-status flags.
- **Monitor Gaps** — ranks where temporary low-cost sensors would help most
  (coverage gap × vulnerability), with "why this helps" reasoning.
- **Alert Builder** — watch rules (AQI threshold + condition profile) evaluated by a
  15-minute Vercel Cron; trigger history in the UI. Email/SMS is architecture-stubbed,
  intentionally not enabled.
- **Clinic Mode** — printable, prevention-focused resident handout (English/Spanish),
  condition-aware but never diagnostic; data status printed on the handout.
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
                 └── Vercel Cron (15 min): refresh cache, evaluate watch rules
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
   15-minute cron for `/api/cron/refresh`).
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
