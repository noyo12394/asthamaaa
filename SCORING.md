# Scoring methodology

Implemented in `src/lib/scoring.ts`; rendered for end users at `/methods`. The
score prioritizes **attention** — which places/residents most warrant a closer look
right now. It does not measure personal dose and it does not diagnose.

## Components (each 0–100)

### Exposure — weight 0.40
Piecewise mapping of the snapshot US AQI:

```
AQI ≤ 50    -> 0.5 · AQI                 (50 -> 25)
50–100      -> 25 + 0.5 · (AQI − 50)     (100 -> 50)
100–200     -> 50 + 0.35 · (AQI − 100)   (200 -> 85)
> 200       -> 85 + 0.05 · (AQI − 200), capped at 100
```

The AQI itself uses EPA's May-2024 breakpoints (PM2.5 "Good" ceiling 9.0 µg/m³).
Sub-indices: PM2.5, PM10, O₃ (8-h table), NO₂ (1-h table); composite = max.
Gas concentrations arrive in µg/m³ and are converted to ppb at 25 °C / 1013 hPa —
an approximation, noted in the source trail. Missing AQI ⇒ exposure assumed 35
with an explicit caveat.

### Community health burden — weight 0.20
Mean of county prevalence values normalized to high-burden reference ceilings
(≈ the high end of US county distributions):

| measure | ceiling |
|---|---|
| adult asthma | 14% |
| COPD | 12% |
| diabetes | 18% |
| hypertension | 45% |
| coronary heart disease | 10% |
| obesity | 45% |

`burden = 100 · mean(min(1, value/ceiling))`. The heaviest contributor is reported
as the "dominant burden".

### Equity burden — weight 0.20
```
equity = 0.6 · vulnerability + 0.4 · (100 − monitorConfidence)
```
Vulnerability = SVI percentile × 100 (component-mean fallback if the percentile is
missing). The coverage-gap term is what makes "vulnerable **and** unobserved"
communities rank highest — the platform's core equity claim.

### Personal susceptibility — weight 0.20
Baseline 20 (general population). +25 age ≥ 65; +20 age ≤ 12; +30 asthma;
+30 COPD; +25 heart disease; +15 diabetes; +15 pregnancy; +10 hypertension;
capped at 100. Prevention-focused weighting, not a clinical instrument; with no
profile, the baseline applies and the explanation says so.

### Monitor confidence — reported separately (weight 0 in the sum)
```
confidence = 100 · (0.7 · max(0, 1 − d/50 km) + 0.3 · min(1, n₂₅/4))
```
`d` = distance to nearest active monitor, `n₂₅` = monitors within 25 km.
Coverage bands: **good** ≤ 10 km, **partial** ≤ 25 km, **sparse** beyond —
heuristics informed by typical urban-scale PM2.5 spatial correlation, not an EPA
siting standard. Confidence deliberately does not scale the final score; it feeds
the equity term and is displayed beside every result so low observational
confidence stays visible.

## Final score

```
final = 0.40·exposure + 0.20·healthBurden + 0.20·equity + 0.20·susceptibility

< 25  Low      25–49  Moderate      50–69  High      ≥ 70  Very High
```

Weights are round, documented constants chosen for transparency — not fitted
parameters. Scores are integers; no invented precision.

## Guardrails (encoded, not aspirational)

- Concentration units (µg/m³, ppb, ppm) and index units (AQI) are always labeled
  and never mixed silently; the µg/m³→ppb conversion is flagged as approximate.
- A 1-hour snapshot AQI is never presented as a 24-hour NowCast, a design value,
  or NAAQS attainment evidence.
- County data ⇒ population context only; the disclaimer travels with the payload.
- Fallback inputs append explicit caveats to the result and cap confidence labels.
- Every component returns its inputs, plain-language explanation, and sources, so
  a reviewer can recompute any number by hand.
