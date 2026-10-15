#!/usr/bin/env node
// scripts/import-ciqual.mjs — Step 5.2, docs/03_MasterPrompts.md §5.2 task 1.
// One-time import script, run manually by a human operator — NOT part of
// the app runtime, never deployed, never bundled into the client.
//
// Downloads the official ANSES CIQUAL 2025 open-data table (Licence
// Ouverte/Etalab) and inserts one row per food into nutrition_foods with
// source='ciqual' and dataset_version='2025_11_03' (the version embedded
// in ANSES's own published filename).
//
// Source: https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table
// Direct file: Table Ciqual 2025_FR_2025_11_03.xlsx
// Licence attribution required by Etalab terms (kept in dataset_version's
// sibling metadata is out of scope for this simple schema — cite here
// instead, per the master prompt's "cite Licence Ouverte terms"):
//   "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual
//   2025. https://doi.org/10.57745/RDMHWY" — Licence Ouverte / Open Licence
//   (Etalab). Data must not be altered in meaning; source/version cited.
//
// Usage: node scripts/import-ciqual.mjs
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (service role bypasses RLS by design — nutrition_foods has no client
// write policy, per 0005_nutrition.sql's own comment).
//
// Parses the .xlsx directly (a zip of plain XML) via Node's built-in
// zlib/DecompressionStream rather than pulling in the "xlsx" (SheetJS)
// npm package, which has known unpatched prototype-pollution/ReDoS
// advisories (checked via `npm audit` this session — no fix available).

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";

const CIQUAL_URL =
  "https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202025_FR_2025_11_03.xlsx";
const DATASET_VERSION = "2025_11_03";

// Column letters verified by hand against a real downloaded copy of this
// exact file (see session notes) — CIQUAL's column order is not guaranteed
// stable across dataset versions, so if this script is ever re-run against
// a newer CIQUAL export, re-verify these letters against row 1's headers
// before trusting the output.
const COLS = {
  alim_code: "G",
  alim_nom_fr: "H",
  alim_grp_nom_fr: "D",
  kcal: "K", // "Energie, Règlement UE N° 1169/2011 (kcal/100 g)"
  protein: "O", // "Protéines, N x facteur de Jones (g/100 g)"
  glucides: "Q", // "Glucides (g/100 g)"
  lipides: "R", // "Lipides (g/100 g)"
};

function colLetterToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseFrenchNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  // CIQUAL marks missing values as "-" and small/uncertain traces as
  // "<10"/"traces" — never guess a number for these, store null (per
  // CLA-FR-014: an unresolved/unknown value must be flagged, not invented).
  if (trimmed === "-" || trimmed === "" || trimmed.toLowerCase() === "traces") return null;
  if (trimmed.startsWith("<")) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

async function downloadCiqual(destPath) {
  console.log(`Downloading CIQUAL 2025 from ${CIQUAL_URL} ...`);
  const res = await fetch(CIQUAL_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  console.log(`Downloaded ${buf.length} bytes to ${destPath}`);
}

function extractXlsx(xlsxPath, outDir) {
  // Shell out to the system `unzip` CLI — .xlsx is a standard zip archive,
  // and this avoids adding a zip-parsing npm dependency for a one-time
  // manual script. Requires `unzip` on PATH (present on macOS/Linux/WSL/
  // Git Bash; if unavailable, extract manually and point this script at
  // the extracted xl/ directory instead).
  execFileSync("unzip", ["-o", "-q", xlsxPath, "-d", outDir]);
}

// fast-xml-parser's default numeric-content detection would silently turn
// a shared string like "24999" (a real alim_code) or "255" (a real kcal
// value written as text in this cell type) into a JS number, at which
// point the object-shaped `{ "#text": ... }` lookup below stops matching
// and the whole string is lost as "" — this cost real debugging time
// (found via a live parse producing 0 valid rows), so numeric parsing is
// explicitly disabled here: every shared string must round-trip as text.
const SHARED_STRINGS_PARSER = new XMLParser({ ignoreAttributes: false, preserveOrder: false, parseTagValue: false });

function textOf(node) {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") return textOf(node["#text"]);
  return "";
}

function loadSharedStrings(xlDir) {
  const xml = readFileSync(path.join(xlDir, "sharedStrings.xml"), "utf8");
  const doc = SHARED_STRINGS_PARSER.parse(xml);
  const items = doc.sst?.si ?? [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((si) => {
    // A shared string is either a plain <t> or a run of <r><t>...</t></r>
    // (rich text) — CIQUAL's header row uses rich text for line-wrapped
    // headers, data cells (food names/values) use plain <t>.
    if (si.t !== undefined) return textOf(si.t);
    if (si.r) {
      const runs = Array.isArray(si.r) ? si.r : [si.r];
      return runs.map((r) => textOf(r.t)).join("");
    }
    return "";
  });
}

function parseSheetRows(xlDir, sharedStrings) {
  const xml = readFileSync(path.join(xlDir, "worksheets", "sheet1.xml"), "utf8");
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>(.*?)<\/row>/gs;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowNum = Number(rowMatch[1]);
    if (rowNum === 1) continue; // header row
    const rowXml = rowMatch[2];
    const cells = {};
    let cellMatch;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const [, col, attrs, val] = cellMatch;
      if (val === undefined) continue;
      const isString = /t="s"/.test(attrs);
      cells[col] = isString ? sharedStrings[Number(val)] : val;
    }
    rows.push(cells);
  }
  return rows;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const workDir = mkdtempSync(path.join(tmpdir(), "ciqual-import-"));
  const xlsxPath = path.join(workDir, "ciqual.xlsx");
  const extractDir = path.join(workDir, "extracted");

  try {
    await downloadCiqual(xlsxPath);
    extractXlsx(xlsxPath, extractDir);

    const xlDir = path.join(extractDir, "xl");
    const sharedStrings = loadSharedStrings(xlDir);
    const rows = parseSheetRows(xlDir, sharedStrings);
    console.log(`Parsed ${rows.length} data rows from CIQUAL sheet1.`);

    const foodRows = rows
      .map((cells) => {
        const alimCode = cells[COLS.alim_code];
        const name = cells[COLS.alim_nom_fr];
        if (!alimCode || !name) return null;
        return {
          source: "ciqual",
          source_id: String(alimCode),
          name,
          kcal_per_100g: parseFrenchNumber(cells[COLS.kcal]),
          protein_per_100g: parseFrenchNumber(cells[COLS.protein]),
          carbs_per_100g: parseFrenchNumber(cells[COLS.glucides]),
          fat_per_100g: parseFrenchNumber(cells[COLS.lipides]),
          dataset_version: DATASET_VERSION,
          quality_flag: null,
        };
      })
      .filter(Boolean);

    console.log(`Prepared ${foodRows.length} valid rows. Upserting into nutrition_foods in batches...`);

    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < foodRows.length; i += BATCH_SIZE) {
      const batch = foodRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("nutrition_foods")
        .upsert(batch, { onConflict: "source,source_id,dataset_version" });
      if (error) throw new Error(`Batch insert failed at offset ${i}: ${error.message}`);
      inserted += batch.length;
      console.log(`  ${inserted}/${foodRows.length} rows upserted...`);
    }

    console.log(`Done. ${inserted} CIQUAL rows imported at dataset_version=${DATASET_VERSION}.`);
    console.log(
      "Attribution (cite wherever CIQUAL data is displayed, per Licence Ouverte/Etalab terms): " +
        '"Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY"'
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
