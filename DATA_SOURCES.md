# Data sources

Every value shown in the UI carries: source name, timestamp or vintage, a status
label (`live / cached / modeled / official / estimated / fallback / seed`), and a
confidence level. This file documents each source and how it enters the system.

## Runtime (fetched by the backend, cached, logged)

### Open-Meteo Air Quality API — `live` / `modeled`
- https://open-meteo.com/en/docs/air-quality-api (CAMS model, no key)
- PM2.5, PM10, ozone, NO₂, SO₂, CO, US AQI; hourly history + forecast.
- Cached 10 minutes; cache hits re-labeled `cached` with age.
- **These are model estimates, not monitor readings** — the UI pairs them with
  monitor distance so the verification gap is explicit.
- Unreachable ⇒ deterministic synthetic field, labeled `fallback`, confidence low.

### Open-Meteo Geocoding API — `live`
- GeoNames-backed, no key; cached 24 h. Offline fallback: built-in gazetteer of
  ~50 major US cities + all Census county names (labeled `fallback`).

### AirNow API (US EPA) — `official`, optional
- Reserved integration for official AQI observations when `AIRNOW_API_KEY` is set.

## Committed snapshots (`src/data/`, provenance embedded in each file)

### County boundaries & metadata — `official`
- US Census Bureau cartographic boundary file (20 m generalized), via the
  plotly/datasets GeoJSON mirror. 3,221 counties: FIPS, name, state, centroid,
  geometry (coordinates rounded to 3 dp ≈ 110 m — display/containment, not legal).
- Refresh: `npm run ingest:counties`.

### Monitor metadata — `fallback` seed until ingested
- Real target: AirNow `monitoring_site_locations.dat` (official, no key).
  Refresh: `npm run ingest:monitors`.
- Committed seed: synthetic placements at county centroids (dense in the
  Mid-Atlantic focus region, sparse elsewhere), `status: "fallback"`, surfaced as
  an amber badge and in every nearest-monitor answer.

### County health indicators — `fallback` seed until ingested
- Real target: CDC PLACES county release via Socrata (`npm run ingest:health`);
  measures: asthma, COPD, diabetes, hypertension, CHD, obesity, cancer
  (model-based prevalence, adults 18+).
- Committed seed: published national baseline prevalence with deterministic
  per-county perturbation (FIPS-seeded). **Not county-specific measurements** —
  labeled as such at the file, API, and UI layers.

### County vulnerability indicators — `fallback` seed until ingested
- Real target: CDC/ATSDR SVI 2022 county CSV (`npm run ingest:vulnerability`);
  overall percentile (RPL_THEMES) + poverty, 65+, ≤17, disability, limited
  English, no vehicle.
- Committed seed: national baseline shares with deterministic perturbation and a
  synthetic `svi` percentile; same labeling rules.

## Honesty rules encoded in the platform

1. Fallback values are never presented as live; the badge follows the value into
   comparisons, handouts, and agent answers.
2. A snapshot AQI is never called a regulatory/annual value (see SCORING.md).
3. County indicators are population context, never individual diagnosis.
4. Community reports are unverified human observations, rendered separately, and
   never enter the scoring engine.
5. Every outbound fetch — success or failure — lands in the fetch ledger exposed
   at `/api/freshness` and in the Inspector's source-trail tab.
