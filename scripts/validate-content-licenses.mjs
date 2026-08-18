import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isApprovedWikimediaLicense } from "../src/content-license-policy.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, predicate));
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

// 1) Guard the photo loader against unsafe fallbacks.
const photo = read("src/photo.js");
if (/thesportsdb\.com/i.test(photo)) {
  fail("src/photo.js still references TheSportsDB image fallback.");
}
if (/Promise\.resolve\(\s*["']TheSportsDB["']\s*\)/.test(photo)) {
  fail("src/photo.js still uses TheSportsDB as a generic photo credit.");
}
if (/return\s+["']Wikipedia["']/.test(photo)) {
  fail('src/photo.js still falls back to the generic credit "Wikipedia".');
}
if (!/buildWikimediaAttribution/.test(photo)) {
  fail("src/photo.js is not using the central Wikimedia attribution policy.");
}
if (!/isMarketingSafeMode/.test(photo)) {
  fail("src/photo.js is not enforcing Marketing Safe Mode.");
}

// 2) Every local image asset must be listed in the asset-license manifest.
const manifestPath = path.join(ROOT, "asset-license-manifest.json");
if (!fs.existsSync(manifestPath)) {
  fail("asset-license-manifest.json is missing.");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const records = new Map((manifest.assets || []).map((item) => [item.path, item]));
  const assetFiles = [
    ...walk(path.join(ROOT, "public"), (file) =>
      /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(file)
    ),
    ...walk(path.join(ROOT, "src", "assets"), (file) =>
      /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(file)
    ),
  ];

  for (const file of assetFiles) {
    const relative = rel(file);
    if (!records.has(relative)) {
      fail(`Local image asset is not in asset-license-manifest.json: ${relative}`);
    }
  }

  for (const [assetPath, item] of records) {
    if (!fs.existsSync(path.join(ROOT, assetPath))) {
      warn(`Manifest entry points to a missing asset: ${assetPath}`);
    }
    if (!item.status || item.status === "review") {
      warn(`Asset still requires origin/license verification: ${assetPath}`);
    }
  }
}

// 3) Limit remote media/script/style hosts in shipped browser code.
const allowedHosts = new Set([
  "commons.wikimedia.org",
  "en.wikipedia.org",
  "he.wikipedia.org",
  "www.gstatic.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
  "cdn.sheetjs.com",
]);

const browserFiles = [
  path.join(ROOT, "index.html"),
  ...walk(path.join(ROOT, "src"), (file) => /\.(js|css|html)$/i.test(file)),
];

const urlPattern = /https?:\/\/[^\s"'`)<>]+/g;
for (const file of browserFiles) {
  const source = fs.readFileSync(file, "utf8");
  const urls = source.match(urlPattern) || [];
  for (const raw of urls) {
    try {
      const host = new URL(raw).hostname;
      if (host === "www.thesportsdb.com" || host === "thesportsdb.com") {
        fail(`Blocked player-image host in ${rel(file)}: ${host}`);
      } else if (!allowedHosts.has(host)) {
        warn(`Review remote host in ${rel(file)}: ${host}`);
      }
    } catch (_) {
      warn(`Could not parse URL in ${rel(file)}: ${raw}`);
    }
  }
}

// 4) Exercise the central allowlist as part of every validation run.
for (const allowed of ["CC0", "Public Domain", "CC BY 4.0", "CC BY-SA 4.0"]) {
  if (!isApprovedWikimediaLicense(allowed)) {
    fail(`Approved Wikimedia license was unexpectedly rejected: ${allowed}`);
  }
}
for (const blocked of [
  "CC BY-NC 4.0",
  "CC BY-ND 4.0",
  "CC BY-NC-SA 4.0",
  "Fair Use",
  "All Rights Reserved",
  "Unknown",
]) {
  if (isApprovedWikimediaLicense(blocked)) {
    fail(`Prohibited/unknown Wikimedia license was unexpectedly accepted: ${blocked}`);
  }
}

for (const message of warnings) console.warn("WARN:", message);

if (failures.length) {
  for (const message of failures) console.error("FAIL:", message);
  console.error(`\nLicense validation failed with ${failures.length} hard issue(s).`);
  process.exit(1);
}

console.log(
  `License validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`
);
