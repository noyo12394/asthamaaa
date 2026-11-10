# The Monitoring Divide — reproducible descriptive study

Build date: November 10, 2026. Route: `/monitoring-equity`.

## Research question
How does proximity to recently reporting EPA AQS PM2.5 sites vary across population groups and social vulnerability in PA, NY, NJ, DE, and MD?

Research inspiration: Kelly BC et al., *Racial and Ethnic Disparities in Regulatory Air Quality Monitor Locations in the US*, JAMA Network Open 2024;7(12):e2449005, https://doi.org/10.1001/jamanetworkopen.2024.49005 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC11618472/ . That study used block groups, monitor-specific buffers, and population-adjusted spatial Bayesian models. This dashboard is a descriptive extension focused on PM2.5 nearest-site distance. Its results are not adjusted effect estimates or a replication of that paper.

## Sources and construction
1. EPA AQS monitor inventory: https://aqs.epa.gov/aqsweb/airdata/aqs_monitors.zip (extracted June 26, 2026). Include parameter 88101 (PM2.5 local conditions) with a last reported sample on/after June 26, 2025. This is a recent-reporting proxy, not verified operational status on November 10. Do not include non-reference PM2.5 parameter 88502. Exclude sites marked closed on/before the snapshot date using https://aqs.epa.gov/aqsweb/airdata/aqs_sites.zip. Deduplicate collocated instruments by state/county/site; retain the latest reporting instrument for metadata. All 1,039 eligible U.S. sites enter nearest-neighbor calculations, including sites outside the five-state region; 119 are within the region. Site participation in AQS does not imply identical monitoring objectives or measurement scales.
2. CDC/ATSDR nationally ranked 2022 tract SVI: https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html . Retrieved from the public CDC-published ArcGIS service https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/ArcGIS/rest/services/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2 . Filter state FIPS 10, 24, 34, 36, 42. This supplies tract boundaries, overall national SVI rank, and 2018–2022 ACS demographic counts. National ranks permit cross-state comparisons.
3. Census 2020 mean centers of population for census tracts: https://www.census.gov/geographies/reference-files/2020/geo/2020-centers-population.html . Per-state files: https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR42.txt (replace 42 with 10, 24, 34, or 36).
4. Existing PASS air-quality endpoint `/api/air-quality/current` supplies current CAMS modeled PM2.5 through Open-Meteo. It is never used to calculate monitoring distances or demographic disparities. The research tab suppresses synthetic fallback values. The existing endpoint does not reliably retain a separate PM2.5 model valid time when an official AQI overrides the combined snapshot time, so the tab reports available source vintage and retrieval time without claiming an independently verified PM2.5 valid time. Source: https://open-meteo.com/en/docs/air-quality-api . No new model was trained. Other existing Atlas views use a separate AirNow metadata inventory (including additional sites and pollutant coverage), so their nearest-monitor distances can differ from this AQS 88101 research snapshot.

## Distance and population weights
Join tract data to population centers using 11-digit FIPS (2020 tract geography). Use the 2020 population-weighted center for each tract rather than a geometric centroid. All residents of the tract are assigned the center's nearest-site distance. This is not an individual household-distance calculation or a subgroup-specific population center. Compute nearest site over the entire eligible U.S. inventory via unit-sphere dot products and great-circle arc distance, with mean Earth radius 6371.0088 km. Monitor coordinates are supplied in NAD83; direct latitude/longitude use introduces negligible error relative to the kilometer-scale analysis, but is not a survey-grade datum transformation.

The statewide and regional mean distance is sum(ACS population × tract distance) / sum(ACS population). The population-weighted median is the smallest distance whose cumulative population reaches 50%. For race/ethnicity, weights are each group's ACS tract counts. Non-Hispanic White = total population minus the SVI minority-population count; the other race counts are the non-Hispanic SVI adjunct variables. Hispanic/Latino includes any race. Categories are mutually exclusive. Negative or absent estimates are missing, not zero.

Poverty context charts group *all tract residents* by tract percentage below 150% of the federal poverty level (<15%, 15–<30%, ≥30%). They do not compare individual poor versus non-poor residents. Missing poverty estimates are excluded from poverty-stratum charts only.

The beyond-threshold share is sum(group population in tracts with distance strictly greater than threshold) / sum(group population), ×100. Dynamic controls recompute charts and summaries from the precomputed tract observations.

## Map classes and priority definition
Distance map: ≤5, >5–10, >10–25, >25–50, >50 km. These are descriptive display classes, not regulatory coverage standards.

Bivariate map: distance ≤10 / >10–25 / >25 km crossed with national SVI percentile classes <50th / ≥50th–<75th / ≥75th. Missing SVI is gray. The upper class matches the high-vulnerability definition used in priority cards.

Potential double disadvantage: tract SVI ≥0.75 and distance greater than the user-selected threshold (default 25 km). Count all ACS residents in those tracts. This is a screening definition, not a validated measure of need or a recommended monitor-siting allocation. PASS support classes reuse the existing ≤10 km / >10–25 km / >25 km proximity heuristic. They do not estimate calibrated model error.

## Calculated findings at default settings
- 12,737 tracts retrieved; 132 zero-population tracts excluded; no unmatched populated tract centers.
- 12,605 inhabited tracts and 49,387,992 estimated residents analyzed.
- 66 analyzed tracts lack overall SVI and remain in distance/race analyses but not vulnerability analyses.
- 1,039 unique recently reporting U.S. AQS PM2.5 sites considered; 119 in the five-state region.
- Population-weighted median nearest-site distance: 9.25 km. Weighted mean: 14.72 km.
- 8,388,350 residents (16.98%) assigned to tract centers farther than 25 km.
- 845,175 residents in tracts with national SVI ≥0.75 and distance >25 km.
- 1,081 tract centers have a nearest site in another state.

| State | Residents | Weighted median km | Residents >25 km | High SVI and >25 km |
| --- | ---: | ---: | ---: | ---: |
| PA | 12,989,208 | 10.57 | 2,299,612 | 209,393 |
| NY | 19,994,379 | 7.13 | 4,067,412 | 433,186 |
| NJ | 9,249,063 | 10.27 | 714,031 | 95,629 |
| MD | 6,161,707 | 11.18 | 1,178,451 | 100,149 |
| DE | 993,635 | 7.76 | 128,844 | 6,818 |

## Limitations
This is a cross-sectional descriptive proximity study with mixed source vintages. Census population centers are from 2020 while population weights are 2018–2022 ACS. Changes since those dates are not represented. Within-tract racial segregation and the uncertainty of survey estimates are not propagated. No statistical significance or causal claims are supported. Monitor scale, measurement purpose, schedule, data completeness, wind, terrain, and pollutant variability can change representativeness regardless of distance. No live physical PM2.5 observations or calibrated prediction intervals are added by this analysis. Regional results may differ from national regression findings. Do not infer that a group is underserved from its race alone.

Boundaries are generalized for browser display (0.003-degree tolerance; 4 decimals); unrounded official population-center coordinates drive distance calculation. Large low-population tracts dominate land area; population charts address that visual imbalance. Five-state filters change community inclusion, never the nationwide nearest-site reference.

## Reproduction
Download official source files to a scratch directory with names `monitors.zip`, `sites.zip`, `centers-10.txt`, `centers-24.txt`, `centers-34.txt`, `centers-36.txt`, `centers-42.txt`, `svi-tracts.geojson`. The source downloader is `scripts/download-monitoring-equity.py`. Then run:

```sh
python3 scripts/download-monitoring-equity.py /path/to/raw
python3 scripts/build-monitoring-equity.py /path/to/raw
```

The build script writes static GeoJSON plus JSON metadata under `public/research/`. Metadata includes source SHA-256 digests, exclusions, and independently computed summaries. Original sources are publicly accessible; raw files are not committed. The CSV export includes filtered tract observations and the selected threshold. Population figures are ACS estimates, not current enumerations.
