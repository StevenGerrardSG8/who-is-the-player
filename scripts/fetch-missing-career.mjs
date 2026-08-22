// Run this LOCALLY on your own machine (not inside Claude) — it fetches each
// player's Wikipedia infobox to backfill career data for players that
// currently have an empty `career: []`. Pure HTTP + regex, no LLM involved.
//
// Usage:
//   node scripts/fetch-missing-career.mjs
//
// Output: scripts/career-results.json — apply it with apply-career-data.mjs.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const OUTPUT_FILE = path.join(__dirname, "career-results.json");

const TARGET_FILES = ["ligue-1.js", "premier-league.js", "serie-a.js"];

async function loadDefault(fullPath) {
  const mod = await import(pathToFileURL(fullPath).href + "?t=" + Date.now());
  return mod.default;
}

async function fetchWikitext(title) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    "&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2";
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const page = j.query && j.query.pages && j.query.pages[0];
  if (!page || page.missing) return null;
  return page.revisions && page.revisions[0] && page.revisions[0].slots.main.content;
}

function cleanWikiLink(s) {
  if (!s) return "";
  s = s.replace(/\{\{nowrap\|([^}]*)\}\}/gi, "$1");
  s = s.replace(/\{\{[^{}]*\}\}/g, "").trim();
  const linkMatch = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (linkMatch) return (linkMatch[2] || linkMatch[1]).trim();
  return s.replace(/'''/g, "").trim();
}

function parseInfoboxCareer(wikitext) {
  if (!wikitext) return [];
  const infoboxMatch = wikitext.match(/\{\{Infobox football biography([\s\S]*?)\n\}\}/i);
  if (!infoboxMatch) return [];
  const box = infoboxMatch[1];

  const params = {};
  const lines = box.split(/\n\|/);
  for (const line of lines) {
    const m = line.match(/^\s*([a-zA-Z0-9]+)\s*=\s*(.*)$/s);
    if (m) params[m[1]] = m[2].trim();
  }

  const career = [];
  for (let i = 1; i <= 40; i++) {
    const years = params["years" + i];
    const clubs = params["clubs" + i];
    if (!clubs) continue;
    let clubName = cleanWikiLink(clubs);
    const loan = /→/.test(clubs) || /loan/i.test(clubs);
    if (loan && !/\(loan\)/i.test(clubName)) clubName += " (loan)";
    const yearsClean = (years || "").replace(/\{\{[^{}]*\}\}/g, "").trim();
    if (clubName) career.push([yearsClean, clubName]);
  }
  return career;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const targets = [];
  for (const fname of TARGET_FILES) {
    const pack = await loadDefault(path.join(DATA_DIR, fname));
    for (const p of pack.players) {
      if (!p.career || p.career.length === 0) {
        targets.push({ file: fname, wiki: p.wiki, answer: p.answer });
      }
    }
  }

  console.log(`Found ${targets.length} players with empty career. Fetching from Wikipedia...`);

  const results = [];
  let done = 0;
  for (const t of targets) {
    try {
      const wikitext = await fetchWikitext(t.wiki);
      const career = parseInfoboxCareer(wikitext);
      results.push({ ...t, career });
    } catch (e) {
      results.push({ ...t, career: [], error: e.message });
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${targets.length}...`);
    await sleep(150); // be polite to Wikipedia's API
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
  const withCareer = results.filter((r) => r.career.length > 0).length;
  console.log(`\nDone. ${withCareer}/${results.length} players got career data.`);
  console.log(`Results written to ${OUTPUT_FILE}`);
  console.log(`Run: node scripts/apply-career-data.mjs`);
}

main();
