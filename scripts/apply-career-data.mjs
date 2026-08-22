// Run this LOCALLY after fetch-missing-career.mjs. Patches each player's
// `career: []` in the data file with the fetched result from
// scripts/career-results.json.
//
// Usage:
//   node scripts/apply-career-data.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const RESULTS_FILE = path.join(__dirname, "career-results.json");

async function main() {
  const results = JSON.parse(await fs.readFile(RESULTS_FILE, "utf-8"));
  const byFile = {};
  for (const r of results) {
    if (!r.career || r.career.length === 0) continue;
    (byFile[r.file] ||= []).push(r);
  }

  for (const [fname, entries] of Object.entries(byFile)) {
    const fullPath = path.join(DATA_DIR, fname);
    let content = await fs.readFile(fullPath, "utf-8");
    let patched = 0;

    for (const entry of entries) {
      const wikiEsc = JSON.stringify(entry.wiki);
      const re = new RegExp(
        `(wiki:${wikiEsc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, pos:"[^"]*", country:"[^"]*",\\n\\s*career:)\\[\\]`
      );
      const careerStr = JSON.stringify(entry.career);
      const before = content;
      content = content.replace(re, `$1${careerStr}`);
      if (content !== before) patched++;
    }

    await fs.writeFile(fullPath, content, "utf-8");
    console.log(`${fname}: patched ${patched}/${entries.length}`);
  }

  console.log("\nDone. Run `npm run build` to verify, then commit + push.");
}

main();
