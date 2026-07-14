# PASS Equity Atlas Professional Audit

Audit date: 2026-07-13  
Production target: <https://asthamaaa.vercel.app>  
Scope: all 11 pages, 31 route handlers, shared components, map layers, committed datasets, ETL scripts, scoring, storage, tests, deployment configuration, and public documentation.

## Executive assessment

PASS Equity Atlas already has a stronger product concept than a typical dashboard: it combines air, water, monitoring coverage, health context, source provenance, clinic translation, comparison, alerts, and sensor planning. Its most valuable principle is that community reports, modeled air, official monitoring metadata, and measured water results remain distinguishable.

The highest-risk problem was data provenance. The production snapshots for monitors, health, and vulnerability were synthetic fallback seeds even though the interface could appear operational. This audit replaces them with verified official snapshots and makes the ingestion contracts fail closed when federal schemas change. The second major gap was the water workflow: users could filter known place names but could not answer “what was sampled near this address?” The implemented radius workflow now answers that question without interpreting a point as household tap quality.

This is still a research platform, not a regulatory or clinical decision system. The 0–100 air value is an **attention-priority heuristic**, never a safety, diagnosis, exposure, or regulatory-compliance score.

## Product and page audit

| Surface | What works | Material weakness | Resolution / next action |
|---|---|---|---|
| Air map `/` | Search, selectable MapLibre layers, 2D/2.5D/3D, inspector, source trail, timeline, reports | Dense desktop composition; map cells can visually imply finer certainty than the model supports | Source/status language retained; failure UI added. P1: add resolution-dependent aggregation and a persistent layer-method drawer |
| Water `/water-pilot` | WQP points, non-detects, UCMR table, methods, CSV export | No address/radius workflow; year filter could be mistaken for a continuous trend | Implemented 250 m–10 km address radius, map geometry, radius-aware CSV, and caveated sampling history |
| Compare `/compare` | 2–5 places, same source-aware air/risk pipeline | Failed rows look merely empty; no water comparison | P1: explicit row errors/retry and WQP/UCMR comparison mode |
| Outlook `/outlook` | Condition-specific weekly planning | Model forecast can look observational; limited location persistence | Current caveat retained. P1: uncertainty band and URL-shareable state |
| Equity `/equity` | Separates monitoring, exposure, and health burden | County aggregation can hide within-county inequity | P1: tract mode only after validated tract-level sources and privacy review |
| Sensor planner `/simulator` | Clear geometry-only framing and before/after coverage | Population served is modeled and monitor type/pollutant are not constrained | P1: pollutant-aware siting assumptions, cost/scenario inputs, downloadable methodology |
| Coverage gaps `/monitor-gaps` | Actionable ranking | Ranking inherits heuristic distance thresholds | Label thresholds as PASS heuristics everywhere; validate against expert siting guidance before operational use |
| Watchlist `/watchlist` | “Not yet live” rows are honest | “Watch score” may be overread as health surveillance | Rename to planning index and add score decomposition before wider release |
| Alerts `/alerts` | Watch-rule architecture, persistence disclosure | No delivery, auth, rate limits, or durable storage by default | P0 before public subscriptions: auth, Postgres, verified delivery, consent and unsubscribe |
| Clinic `/clinic` | Plain language, Spanish, printable, same underlying numbers | Spanish is partial-site only; URL in handout was stale | P1: professional translation review, WCAG print QA, update all generated URLs |
| Methods `/methods` | Formula and limitations are unusually transparent | Needs downloadable machine-readable data dictionary and release history | P1: versioned methodology and dataset manifests |

## Data inventory and scientific review

| Dataset | Use | Status / cadence | Precision | Key limitation |
|---|---|---|---|---|
| Open-Meteo CAMS air quality | Current/hourly air surface | Live server fetch, 10-minute cache | Model grid | Modeled snapshot, not a monitor, AirNow NowCast, design value, or attainment determination |
| AirNow monitoring sites v2 | Monitor location and proximity | Official feed, refreshed during ETL; feed updates sub-hourly | Submitted site coordinate | Metadata and preliminary AirNow context; proximity is not an EPA confidence standard |
| US Census county boundaries | County resolution and map geometry | Static snapshot, release-based | County | County assignment cannot resolve household-level conditions |
| CDC PLACES 2025 + 2024 | Chronic-condition prevalence | Official release ETL | County, modeled estimate | Population estimate, not diagnosis. 2025 omits chronic fields for PA/KY; official 2024 is used and labeled for 187 counties |
| CDC/ATSDR SVI 2022 | Vulnerability context | Official static ETL; biennial family | County | Relative percentile; editions are not directly comparable over time |
| Water Quality Portal exports | PFAS ambient-water sample records | Official/public snapshot; manual/ETL refresh | Submitted monitoring coordinate | Heterogeneous programs, methods, matrices, reporting limits, and sampling frequency |
| EPA UCMR 5 | PFOA/PFOS public-water-system summaries | Official January 2026 snapshot | Public water system / ZIP context | Not a home or exact sample coordinate; coverage is rule/program specific |
| Community reports | Resident observations | User submitted | Submitted point | Unverified; must never merge visually or analytically with validated measurements |

Verified source contracts:

- AirNow monitoring sites v2: <https://docs.airnowapi.org/docs/MonitoringSiteV2FactSheet.pdf>
- CDC PLACES 2025 county release: <https://data.cdc.gov/d/i46a-9kgh>
- CDC PLACES 2024 county release: <https://data.cdc.gov/d/d3i6-k6z5>
- CDC/ATSDR SVI documentation: <https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html>
- EPA UCMR occurrence data: <https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule>
- Water Quality Portal: <https://www.waterqualitydata.us/>

Do not integrate EJScreen as a live EPA source: public access was removed in 2025. Any future mirror must be labeled archived/non-authoritative. TRI, ECHO/NPDES, Superfund, FEMA, NOAA/NWS, NHD/WBD, and USGS sources remain candidates, not implied current coverage.

## Implemented in this audit

1. Replaced 333 synthetic monitor points with 2,389 active official AirNow v2 sites.
2. Replaced synthetic county health values with 3,143 CDC PLACES profiles; added explicit 2024 official fallback for 187 counties whose 2025 chronic fields are blank.
3. Replaced synthetic vulnerability values with 3,144 CDC/ATSDR SVI county profiles.
4. Added strict schema and minimum-coverage validation to all three ETLs.
5. Added water address search and 250 m, 500 m, 1 km, 5 km, and 10 km radii.
6. Added geodesic radius filtering, visible center/radius map layers, result counts, and privacy copy.
7. Made filtered CSV exports apply the same radius calculation as the interface.
8. Added a sampling-history visualization that separates detections/non-detects and explicitly disclaims continuous-trend interpretation.
9. Rebuilt site navigation into a responsive primary/more pattern with active-page semantics and a mobile menu.
10. Added keyboard-complete geocode combobox behavior, live result announcements, visible search errors, and Escape/arrow/Enter controls.
11. Added a visible Inspector failure/retry state instead of an indefinite spinner.
12. Added dark appearance, skip navigation, link focus states, reduced-motion behavior, and stable loading/error/not-found surfaces.
13. Added canonical production metadata, sitemap, robots policy, and baseline response security headers.
14. Added regression tests that reject synthetic official-data snapshots and validate radius math.
15. Updated public documentation and the production URL.

## Remaining weaknesses

### Scientific and data quality

- Current air is usually CAMS model output. Configure and display official AirNow observations as a separate layer; never blend the values without showing the method.
- The attention score weights and burden ceilings are transparent but not externally validated. Keep it out of safety/clinical language and commission sensitivity analysis before policy use.
- Monitor confidence is a PASS proximity/density heuristic. Rename every remaining ambiguous “confidence” label to “monitor coverage context” where practical.
- PFAS WQP records need a versioned raw-file manifest, checksum, validation report, and automated refresh. Sampling density must not be interpreted as contamination prevalence.
- UCMR needs system population served, source-water type, sampling-point history, and contaminant-specific records before it becomes a full drinking-water explorer.
- Lead, violations, ATTAINS assessments, watershed flow, and source/release datasets are not yet complete enough for public inference.

### GIS and visualization

- Air hex cells and county extrusions can imply abrupt boundaries. Add zoom-dependent aggregation, uncertainty hatching, and map-scale-aware caveats.
- PFAS points should cluster at regional zoom and expose overlapping samples at one station.
- The raster Esri topographic basemap needs a documented production-use/attribution review and a configurable fallback.
- There is no watershed/upstream network model. Implement WBD/NHD only with hydrologic connectivity and direction, not simple Euclidean “upstream” claims.
- No GeoJSON export exists. Add it in research mode with coordinate-precision fields and dataset license metadata.

### UX and accessibility

- Several secondary pages still swallow API failures. Standardize `AsyncState` with retry, stale-data display, and error telemetry.
- Tables need captions, sortable headers, and mobile row alternatives. Map-only actions need equivalent keyboard/list workflows.
- Color contrast must be checked in automated CI and with real dark-mode screenshots; semantic meaning should never rely on color alone.
- Full Spanish/i18n is absent outside clinic output. Use message catalogs and professional review; do not machine-translate medical guidance without review.
- Saved places and filters are not consistently shareable in URLs. Add typed query-state serialization without placing personal addresses in public URLs by default.

### Performance and scalability

- The PFAS snapshot sends a multi-megabyte JSON document. Split WQP and UCMR endpoints, add server-side spatial/temporal queries, gzip/Brotli, and paginate tables.
- Map cells are fetched by viewport and recomputed in process. Move stable layers to spatial tiles or PostGIS-backed queries with bounding-box indexes.
- In-memory persistence resets on deployment and cannot support alerts. Production requires Postgres migrations, indexes, backup/restore, and retention policies.
- Add request tracing, cache hit metrics, source freshness SLOs, ETL run manifests, and alerting for schema/coverage regressions.

### Security and privacy

- Public write routes need authentication or abuse controls, rate limiting, bot protection, payload quotas, and moderation. Photo uploads require malware scanning, EXIF removal, content review, and object-storage policies.
- User alerts require explicit consent, verified destinations, unsubscribe, audit logs, privacy policy, and deletion/export workflows.
- AI routes need per-user budgets, prompt-injection defenses around retrieved content, output logging with redaction, and a provider/data-retention review.
- Add a nonce-based Content Security Policy after cataloging map, API, and analytics origins. Baseline nosniff, frame denial, referrer, permissions, and opener headers are now present.
- Secrets must remain server-only and be rotated; add automated secret scanning and dependency updates in CI.

### Engineering and operations

- The GitHub repository default branch points to a divergent Claude branch instead of production `main`; correct repository settings after confirming no active work depends on it.
- Add Playwright desktop/mobile/a11y smoke tests, axe checks, API contract tests, and visual regression snapshots.
- Version public API responses, publish OpenAPI schemas, and standardize structured errors and request IDs.
- Add ETL commands to scheduled CI with checksum-based commits or artifact storage; do not make public deploys depend on silent runtime fallbacks.
- Establish data owner, license, refresh cadence, precision, and limitations for each future layer before implementation.

## Prioritized roadmap

### P0: trust and production readiness

1. Deploy the official snapshot refresh and radius workflow.
2. Configure durable Postgres and protect all write routes with auth/rate limits.
3. Add source freshness monitoring and block promotion when official-snapshot validation fails.
4. Complete API error states on Compare, Alerts, Outlook, Equity, Watchlist, and Simulator.
5. Run keyboard, VoiceOver, axe, mobile, and dark-mode acceptance tests.

### P1: uniquely useful public workflows

1. Drinking Water Explorer: PWS search, population served, source water, UCMR history, limits, violations, and original EPA records.
2. Station history: group WQP samples by monitoring location/compound with method and reporting-limit changes visible.
3. Research mode: paginated raw tables, CSV/GeoJSON, data dictionary, release manifest, and reproducible query URL.
4. Family mode: plain-language concept cards for PFAS, non-detect, reporting limit, modeled air, and “what can I conclude?”
5. Dataset completeness dashboard: newest release, last successful refresh, geographic coverage, missingness, and sampling density.

### P2: validated expansion

1. Watershed Explorer using WBD/NHD and ATTAINS, with hydrologically valid upstream/downstream context.
2. Nearby-source context using ECHO/NPDES, TRI, Superfund, state permits, airports, military/fire-training sites, and landfills, always symbolically separated from measurements.
3. NOAA/NWS smoke, weather, heat, and hazard context as independent layers.
4. Moderated citizen reporting with photos, status workflow, and agency/community follow-up.
5. External scientific review of the attention index, sensor-placement assumptions, and communication language.

## Differentiators worth protecting

- “Why we are unsure” is as prominent as the result.
- Measurement, model, source, and community observation remain separate data classes.
- Non-detects stay visible and are never converted to zero.
- UCMR records are not pinned to fabricated household coordinates.
- Clinic/family language uses the same sourced numbers as research mode.
- Every decision surface can lead back to an original source, method, timestamp, precision statement, and downloadable record.
