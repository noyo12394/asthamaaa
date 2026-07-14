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

### Monitor metadata — `official`
- AirNow `Monitoring_Site_Locations_V2.dat` (official metadata, no key), with
  active sites grouped across reported pollutants. Refresh: `npm run ingest:monitors`.
- AirNow information is preliminary; PASS monitor-distance bands are context
  heuristics, not EPA siting or confidence standards.

### County health indicators — `official`
- CDC PLACES county releases via Socrata (`npm run ingest:health`);
  measures: asthma, COPD, diabetes, hypertension, CHD, obesity, cancer
  (model-based prevalence, adults 18+).
- The 2025 release is primary. Its chronic-condition fields are blank for 187
  Pennsylvania/Kentucky counties, so those profiles use the official 2024
  release and carry `year: "2024 release fallback"`. No synthetic substitution.

### County vulnerability indicators — `official`
- CDC/ATSDR SVI 2022 county CSV (`npm run ingest:vulnerability`);
  overall percentile (RPL_THEMES) + poverty, 65+, ≤17, disability, limited
  English, no vehicle.

## Honesty rules encoded in the platform

1. Fallback values are never presented as live; the badge follows the value into
   comparisons, handouts, and agent answers.
2. A snapshot AQI is never called a regulatory/annual value (see SCORING.md).
3. County indicators are population context, never individual diagnosis.
4. Community reports are unverified human observations, rendered separately, and
   never enter the scoring engine.
5. Every outbound fetch — success or failure — lands in the fetch ledger exposed
   at `/api/freshness` and in the Inspector's source-trail tab.
