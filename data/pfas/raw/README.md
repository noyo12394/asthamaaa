# PASS PFAS raw data drop

Downloaded 2026-07-13 for the water/PFAS pilot.

## Required sources

- `ucmr5-occurrence-data.zip` — official EPA UCMR 5 occurrence data package from EPA's UCMR occurrence-data page.
- `UCMR5_AddtlDataElem.txt`, `UCMR5_ZIPCodes.txt`, and EPA PDFs — extracted from the official ZIP.
- `UCMR5_All.txt` is intentionally not committed as a loose file because it is 295 MB, which exceeds GitHub's normal 100 MB file limit. It is present inside `ucmr5-occurrence-data.zip`; unzip the package to restore it exactly.
- `WQP_PFAS_water_DE.csv`, `WQP_PFAS_water_MD.csv`, `WQP_PFAS_water_NJ.csv`, `WQP_PFAS_water_NY.csv`, `WQP_PFAS_water_PA.csv` — Water Quality Portal resultPhysChem CSV exports for ambient water samples.

## WQP compounds

The five WQP state files combine these four query names:

- Perfluorooctanoic acid
- Perfluorooctane sulfonic acid
- Perfluorohexanesulfonic acid
- Perfluorononanoic acid

Note: WQP accepted `Perfluorooctane sulfonic acid` for PFOS, not the no-space spelling from the original shopping list.

## ECHO supplemental files

- `PFAS_Analytic_Tools_Metadata_2026-01-15.pdf`
- `PFASHandlingIndustrySectors-Apr2023-Pub.xlsx`
- `ECHO_Fire_Training_Industry3_0_0.xlsx`

These are supplemental context files from EPA ECHO PFAS Analytic Tools, useful for metadata and potential-source layers. They are not measurement files.

## Checksums

```text
39ca7179d7d2ab682073104708721b4022ab9b66ff2a947910fde738c5febb1f  UCMR5_All.txt
b5a26312197d242411e22d93b0d60b8339cb5fd4559d26bf07b819e0a8e72a9f  ucmr5-occurrence-data.zip
ed58c697b63aede31bc5ab5d9a51f02b4e69f165eec6b0bc86306f08964458a9  WQP_PFAS_water_DE.csv
f7c48f12a21935d263614b5c9e3d6a7793a3c82242c0383752362c5c0e93aa1c  WQP_PFAS_water_MD.csv
5488fc76e8bed6f9479645c834e5eaae9d2ece1971c0e381ecb39db450cb8212  WQP_PFAS_water_NJ.csv
22992361e3e4e4f7cc746d3281f31b19af3bf1c036707a96cb7c345273e4935f  WQP_PFAS_water_NY.csv
4cda3915a1152eb7aaaf5b732c6b40bdfab54e7943412f502524a79dc7d4069e  WQP_PFAS_water_PA.csv
```
