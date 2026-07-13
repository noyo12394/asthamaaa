#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const ROOT = process.cwd();
const RAW = resolve(ROOT, "data/pfas/raw");
const OUT = resolve(ROOT, "src/data/pfas-pilot.json");
const STATES = { DE: "10", MD: "24", NJ: "34", NY: "36", PA: "42" };
const WQP_FILES = Object.keys(STATES).map((state) => [state, resolve(RAW, `WQP_PFAS_water_${state}.csv`)]);

const COMPOUNDS = new Map([
  ["Perfluorooctanoic acid", "PFOA"],
  ["Perfluorooctane sulfonic acid", "PFOS"],
  ["Perfluorooctanesulfonic acid", "PFOS"],
  ["Perfluorohexanesulfonic acid", "PFHxS"],
  ["Perfluorononanoic acid", "PFNA"],
]);

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toNgL(value, unit) {
  const n = number(value);
  if (n == null) return null;
  const normalized = String(unit ?? "").toLowerCase().replace("µ", "u").replace("�", "u");
  if (normalized.includes("ug/l")) return n * 1000;
  if (normalized.includes("pg/l")) return n / 1000;
  return n;
}

function isNonDetect(text) {
  return /not detected|non.detect|below|^</i.test(String(text ?? ""));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function parseCsvLine(line, delimiter = ",") {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

function parseDelimited(text, delimiter = ",") {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "", delimiter);
  return lines.map((line) => {
    const cells = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

async function buildWqp() {
  const samples = [];
  const seen = new Set();

  for (const [state, file] of WQP_FILES) {
    const csv = await readFile(file, "utf8");
    const rows = parseDelimited(csv);
    for (const row of rows) {
      const compound = COMPOUNDS.get(cleanText(row.CharacteristicName));
      const lat = number(row["ActivityLocation/LatitudeMeasure"]);
      const lng = number(row["ActivityLocation/LongitudeMeasure"]);
      const activityType = cleanText(row.ActivityTypeCode);
      if (!compound || lat == null || lng == null || /quality control|blank/i.test(activityType)) continue;

      const detected = !isNonDetect(row.ResultDetectionConditionText);
      const valueNgL = detected
        ? toNgL(row.ResultMeasureValue, row["ResultMeasure/MeasureUnitCode"])
        : null;
      const limitNgL = toNgL(
        row["DetectionQuantitationLimitMeasure/MeasureValue"],
        row["DetectionQuantitationLimitMeasure/MeasureUnitCode"]
      );
      if (detected && valueNgL == null) continue;

      const resultId = cleanText(row.ResultIdentifier);
      const activityId = cleanText(row.ActivityIdentifier);
      const key = `${state}|${activityId}|${resultId}|${compound}`;
      if (seen.has(key)) continue;
      seen.add(key);

      samples.push({
        id: key,
        state,
        source: "Water Quality Portal",
        provider: cleanText(row.OrganizationFormalName || row.ProviderName),
        activityId,
        monitoringLocationId: cleanText(row.MonitoringLocationIdentifier),
        locationName: cleanText(row.MonitoringLocationName) || "Reported monitoring location",
        activityType,
        medium: cleanText(row.ActivityMediaSubdivisionName) || cleanText(row.ActivityMediaName) || "Water",
        date: cleanText(row.ActivityStartDate),
        year: Number(cleanText(row.ActivityStartDate).slice(0, 4)) || null,
        compound,
        chemicalName: cleanText(row.CharacteristicName),
        detected,
        valueNgL,
        limitNgL,
        originalValue: cleanText(row.ResultMeasureValue),
        originalUnit: cleanText(row["ResultMeasure/MeasureUnitCode"]),
        detectionCondition: cleanText(row.ResultDetectionConditionText) || (detected ? "Detected" : "Not detected"),
        method: cleanText(row["ResultAnalyticalMethod/MethodName"] || row["ResultAnalyticalMethod/MethodIdentifier"]),
        lat,
        lng,
        coordinatePrecision: "Reported monitoring location",
        sourceUrl: "https://www.waterqualitydata.us/",
      });
    }
  }
  return samples;
}

async function zipByPws() {
  const rows = parseDelimited(await readFile(resolve(RAW, "UCMR5_ZIPCodes.txt"), "utf8"), "\t");
  const result = new Map();
  for (const row of rows) if (!result.has(row.PWSID)) result.set(row.PWSID, row.ZIPCODE);
  return result;
}

async function buildUcmr() {
  const zipMap = await zipByPws();
  const child = spawn("unzip", ["-p", resolve(RAW, "ucmr5-occurrence-data.zip"), "UCMR5_All.txt"]);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const systems = new Map();
  const stateSummary = new Map(Object.keys(STATES).map((state) => [state, { state, samples: 0, detections: 0, systems: new Set(), latestDate: "" }]));
  let headers = null;

  for await (const line of lines) {
    if (!headers) {
      headers = line.replace(/^\uFEFF/, "").split("\t");
      continue;
    }
    const cells = line.split("\t");
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const stateCode = cleanText(row.State).toUpperCase();
    const state = Object.hasOwn(STATES, stateCode) ? stateCode : null;
    const compound = cleanText(row.Contaminant);
    if (!state || (compound !== "PFOA" && compound !== "PFOS")) continue;

    const summary = stateSummary.get(state);
    const detected = cleanText(row.AnalyticalResultsSign) === "=" && number(row.AnalyticalResultValue) != null;
    const valueNgL = detected ? toNgL(row.AnalyticalResultValue, row.Units) : null;
    const mrlNgL = toNgL(row.MRL, row.Units);
    const pwsid = cleanText(row.PWSID);
    const date = cleanText(row.CollectionDate);
    summary.samples += 1;
    summary.detections += detected ? 1 : 0;
    summary.systems.add(pwsid);
    if (date && new Date(date) > new Date(summary.latestDate || 0)) summary.latestDate = date;

    const key = `${pwsid}|${compound}`;
    const existing = systems.get(key) ?? {
      id: key,
      state,
      pwsid,
      pwsName: cleanText(row.PWSName),
      zip: zipMap.get(pwsid) ?? "",
      compound,
      sampleCount: 0,
      detectionCount: 0,
      maxNgL: null,
      mrlNgL,
      latestDate: "",
      source: "EPA UCMR 5",
      spatialPrecision: "Public water system / ZIP context; not a home or exact sample point",
      sourceUrl: "https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule",
    };
    existing.sampleCount += 1;
    existing.detectionCount += detected ? 1 : 0;
    if (valueNgL != null && (existing.maxNgL == null || valueNgL > existing.maxNgL)) existing.maxNgL = valueNgL;
    if (date && new Date(date) > new Date(existing.latestDate || 0)) existing.latestDate = date;
    systems.set(key, existing);
  }

  const exitCode = await new Promise((resolveCode) => child.on("close", resolveCode));
  if (exitCode !== 0) throw new Error(`unzip exited with code ${exitCode}`);

  return {
    systems: [...systems.values()].sort((a, b) => (b.maxNgL ?? -1) - (a.maxNgL ?? -1)),
    stateSummary: [...stateSummary.values()].map((row) => ({ ...row, systems: row.systems.size })),
  };
}

async function main() {
  const [wqpSamples, ucmr] = await Promise.all([buildWqp(), buildUcmr()]);
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceRelease: "EPA UCMR 5 January 2026 occurrence data; WQP exports downloaded 2026-07-13",
    wqpSamples,
    ucmrSystems: ucmr.systems,
    ucmrStateSummary: ucmr.stateSummary,
  };
  await mkdir(resolve(ROOT, "src/data"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${OUT}`);
  console.log(`WQP display records: ${wqpSamples.length}`);
  console.log(`UCMR system/compound summaries: ${ucmr.systems.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
