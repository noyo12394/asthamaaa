# Architecture

Backend-first: the UI is a client of the platform's own API. The browser never
talks to an external data provider.

## Request flow (search → answer)

1. `GET /api/geocode?q=` — Open-Meteo Geocoding (24 h cache); offline fallback to a
   built-in gazetteer of major cities + Census county names (labeled `fallback`).
2. `GET /api/location/resolve?lat=&lng=` — point-in-polygon against Census county
   geometry (candidate-filtered by centroid distance), plus nearest-monitor lookup.
3. `GET /api/air-quality/current?lat=&lng=` — Open-Meteo Air Quality (10 min TTL);
   cached responses are re-labeled `cached`, failures produce a deterministic field
   labeled `fallback`. Composite AQI computed with EPA 2024 breakpoints when the
   provider omits it.
4. `GET /api/risk-score?lat=&lng=&conditions=&age=` — the scoring engine
   (`src/lib/scoring.ts`) combines exposure, county burden, equity, susceptibility;
   returns per-component explanations, inputs, sources, and caveats. Results are
   written to `risk_scores` when a database is configured.
5. `GET /api/source-trail?lat=&lng=` — every contributing source with status,
   vintage, confidence + the recent backend fetch ledger.

## Map data

`GET /api/map/cells?bbox=&layer=` serves GeoJSON per layer:

| layer | geometry | values |
|---|---|---|
| `aqi` | hex grid (≤60 cells, auto-sized) | batched Open-Meteo current PM2.5/AQI |
| `alert` | hex grid | profile-free risk formula per cell |
| `vulnerability` / `equity` | county polygons | county indicator scores |
| `coverage` | 10/25 km rings | monitor coverage bands |
| `monitors` | points | monitor metadata |
| `reports` | points | unverified community reports |

Hex ids are stable (axial indices from a fixed origin), so responses cache cleanly
(10 min TTL). The PM2.5 "plume" layer is a client-side heatmap over the same cells.

## Modules

```
src/lib/
  types.ts       Sourced<T>, SourceRef, DataStatus — no bare numbers to the UI
  aqi.ts         EPA breakpoint math + µg/m³→ppb conversion (labeled approximation)
  geo.ts         haversine, point-in-polygon, bbox, stable hex grids, circles
  cache.ts       in-process TTL cache tier (globalThis-pinned)
  freshness.ts   fetch ledger: every outbound call logged ok/fail with timing
  counties.ts    Census snapshot access, point→county resolution
  monitors.ts    monitor metadata, nearest-monitor, confidence heuristic
  health.ts      CDC-style county health + SVI-style vulnerability access
  openmeteo.ts   live client + deterministic labeled fallback field
  geocode.ts     Open-Meteo geocoder + offline gazetteer
  scoring.ts     the transparent scoring engine (see SCORING.md)
  store.ts       persistence: Drizzle/Postgres when DATABASE_URL, else memory
  agent/         Exposure Navigator: tools.ts (11 tools) + agent.ts (LLM loop
                 with plain-fetch OpenAI function calling + offline router)
src/db/          Drizzle schema (12 tables) + lazy client
src/data/        committed snapshots with embedded provenance headers
scripts/         ingestion (real sources) + fallback seed generator + db seed
```

## Persistence

Two backends behind one interface (`src/lib/store.ts`):

- **Postgres (Drizzle)** when `DATABASE_URL` is set — durable saved locations,
  watch rules, community reports, agent sessions, risk-score history.
- **In-memory** otherwise — fully functional, per-instance, non-durable; API
  responses carry `persistence: "memory"` and the UI displays it.

Reference data (counties, monitors, health, vulnerability) is read from the
committed snapshots at runtime either way; `npm run seed` mirrors it into Postgres
for SQL access and durability.

## Scheduled refresh

`vercel.json` cron hits `/api/cron/refresh` every 15 minutes (Bearer-guarded by
`CRON_SECRET`): invalidates the current-AQ cache tier, re-fetches air quality for
every active watch rule, records trigger timestamps, and warms caches for saved
locations. Data older than its TTL is re-labeled on read, so staleness is visible
rather than silent.

## Degradation ladder

Every capability has a labeled fallback so the app never silently lies:

| capability | primary | fallback (always labeled) |
|---|---|---|
| air quality | Open-Meteo live | deterministic synthetic field (`fallback`) |
| geocoding | Open-Meteo geocoder | built-in gazetteer |
| monitors/health/SVI | official ingestions | seed snapshots (`fallback` badge) |
| persistence | Postgres | in-memory (UI banner) |
| agent | OpenAI function calling | deterministic tool router (labeled note) |
| basemap | Carto Positron | inline neutral style + county outlines |
