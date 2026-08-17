import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const HE_PATH = path.join(ROOT, "src", "i18n", "content", "answers", "he.js");
const EXCLUDED_PATH = path.join(DATA_DIR, "excluded-players.js");
const SNAPSHOT_PATH = path.join(DATA_DIR, "sheet-player-translations.json");
const SHEET_ID = "1zIBzmwNS2CLsUSvsigWlIJhuyoZE_KsMAvnXU1DFtnM";
const SHEET_GID = "637609892";
const DEFAULT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/" +
  SHEET_ID +
  "/export?format=csv&gid=" +
  SHEET_GID;

// Spreadsheet display names that differ from the stable Wikipedia key used
// by the application. Add future title corrections here instead of deleting
// and recreating the player's stable id.
const WIKI_ALIASES = new Map([["Yossi Abuksis", "Yossi Abukasis"]]);

function parseArgs(argv) {
  const options = { csvPath: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--csv") options.csvPath = argv[++i];
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else throw new Error("Unknown argument: " + argv[i]);
  }
  return options;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function sheetTranslations(csvText) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("The spreadsheet export has no data rows.");

  const hebrewIndex = rows[0].indexOf("שם בעברית");
  const englishIndex = rows[0].indexOf("שם באנגלית");
  if (hebrewIndex < 0 || englishIndex < 0) {
    throw new Error("Expected the Hebrew and English player-name columns.");
  }

  const translations = new Map();
  for (const row of rows.slice(1)) {
    const rawKey = (row[englishIndex] || "").trim();
    const answer = (row[hebrewIndex] || "").trim();
    if (!rawKey && !answer) continue;
    if (!rawKey || !answer) throw new Error("A spreadsheet row has a missing player name.");
    const key = WIKI_ALIASES.get(rawKey) || rawKey;
    if (translations.has(key)) throw new Error("Duplicate spreadsheet player: " + key);
    translations.set(key, answer);
  }
  return translations;
}

function parseAnswerMap(source) {
  const answers = new Map();
  const linePattern = /^  ("(?:\\.|[^"])*"): \{ answer: ("(?:\\.|[^"])*") \},$/gm;
  let match;
  while ((match = linePattern.exec(source))) {
    answers.set(JSON.parse(match[1]), JSON.parse(match[2]));
  }
  if (!answers.size) throw new Error("Could not parse " + path.relative(ROOT, HE_PATH));
  return answers;
}

function renderAnswerMap(answers) {
  const lines = ["export default {"];
  for (const [key, answer] of answers) {
    lines.push("  " + JSON.stringify(key) + ": { answer: " + JSON.stringify(answer) + " },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

function parseExcluded(source) {
  const names = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^  ("(?:\\.|[^"])*"),$/);
    if (match) names.add(JSON.parse(match[1]));
  }
  return names;
}

function renderExcluded(names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
  return [
    "// Synced from the Google Sheet: these players were explicitly removed from the database.",
    "// Filtering here keeps every league pack and the combined pack consistent.",
    "export const EXCLUDED_PLAYER_WIKIS = new Set([",
    ...sorted.map((name) => "  " + JSON.stringify(name) + ","),
    "]);",
    "",
  ].join("\n");
}

function scanBracePairs(source) {
  const stack = [];
  const pairs = [];
  let mode = "normal";

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (mode === "line-comment") {
      if (char === "\n") mode = "normal";
      continue;
    }
    if (mode === "block-comment") {
      if (char === "*" && next === "/") {
        mode = "normal";
        i++;
      }
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "template") {
      if (char === "\\") {
        i++;
        continue;
      }
      if (
        (mode === "single" && char === "'") ||
        (mode === "double" && char === '"') ||
        (mode === "template" && char.charCodeAt(0) === 96)
      ) {
        mode = "normal";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      mode = "line-comment";
      i++;
    } else if (char === "/" && next === "*") {
      mode = "block-comment";
      i++;
    } else if (char === "'") mode = "single";
    else if (char === '"') mode = "double";
    else if (char.charCodeAt(0) === 96) mode = "template";
    else if (char === "{") stack.push(i);
    else if (char === "}") {
      const start = stack.pop();
      if (start !== undefined) pairs.push([start, i]);
    }
  }
  return pairs;
}

function excludedObjectRanges(source, excluded) {
  const pairs = scanBracePairs(source);
  const ranges = new Map();
  const wikiPattern = /\bwiki\s*:\s*("(?:\\.|[^"])*")/g;
  let match;

  while ((match = wikiPattern.exec(source))) {
    const wiki = JSON.parse(match[1]);
    if (!excluded.has(wiki)) continue;

    let container = null;
    for (const pair of pairs) {
      if (pair[0] < match.index && pair[1] > match.index) {
        if (!container || pair[0] > container[0]) container = pair;
      }
    }
    if (!container) throw new Error("Could not locate player object for " + wiki);

    const [objectStart, objectEnd] = container;
    const lineStart = source.lastIndexOf("\n", objectStart - 1) + 1;
    const start = source.slice(lineStart, objectStart).trim() ? objectStart : lineStart;
    let end = objectEnd + 1;
    while (end < source.length && /[ \t]/.test(source[end])) end++;
    if (source[end] === ",") end++;
    while (end < source.length && /[ \t]/.test(source[end])) end++;
    if (source[end] === "\r") end++;
    if (source[end] === "\n") end++;
    ranges.set(objectStart, { start, end, wiki });
  }
  return [...ranges.values()].sort((a, b) => b.start - a.start);
}

function pruneExcludedPlayers(excluded, dryRun) {
  const changedFiles = [];
  let removedObjects = 0;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => !["excluded-players.js", "packs.js"].includes(name));

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const source = fs.readFileSync(filePath, "utf8");
    const ranges = excludedObjectRanges(source, excluded);
    if (!ranges.length) continue;

    let next = source;
    for (const range of ranges) next = next.slice(0, range.start) + next.slice(range.end);
    const leftovers = excludedObjectRanges(next, excluded);
    if (leftovers.length) throw new Error("Excluded players remain in " + file);
    if (!dryRun) fs.writeFileSync(filePath, next);
    changedFiles.push(file);
    removedObjects += ranges.length;
  }
  return { changedFiles, removedObjects };
}

function writeIfChanged(filePath, content, dryRun) {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (previous === content) return false;
  if (!dryRun) fs.writeFileSync(filePath, content);
  return true;
}

async function readCsv(options) {
  if (options.csvPath) return fs.readFileSync(path.resolve(options.csvPath), "utf8");
  const url = process.env.PLAYER_SHEET_CSV_URL || DEFAULT_CSV_URL;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Spreadsheet download failed: HTTP " + response.status);
  return response.text();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const translations = sheetTranslations(await readCsv(options));
  const previousSnapshot = fs.existsSync(SNAPSHOT_PATH)
    ? JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"))
    : { translations: {} };
  const previousKeys = new Set(Object.keys(previousSnapshot.translations || {}));
  const currentKeys = new Set(translations.keys());
  const newlyRemoved = [...previousKeys].filter((key) => !currentKeys.has(key));

  const excluded = parseExcluded(fs.readFileSync(EXCLUDED_PATH, "utf8"));
  newlyRemoved.forEach((key) => excluded.add(key));

  const answers = parseAnswerMap(fs.readFileSync(HE_PATH, "utf8"));
  let changedAnswers = 0;
  for (const key of excluded) answers.delete(key);
  for (const [key, answer] of translations) {
    if (answers.get(key) !== answer) changedAnswers++;
    answers.set(key, answer);
  }

  const snapshotTranslations = Object.fromEntries(
    [...translations].sort(([a], [b]) => a.localeCompare(b, "en")),
  );
  const snapshot = JSON.stringify(
    { spreadsheetId: SHEET_ID, gid: SHEET_GID, translations: snapshotTranslations },
    null,
    2,
  ) + "\n";

  const prune = pruneExcludedPlayers(excluded, options.dryRun);
  const changed = {
    hebrewAnswers: writeIfChanged(HE_PATH, renderAnswerMap(answers), options.dryRun),
    exclusions: writeIfChanged(EXCLUDED_PATH, renderExcluded(excluded), options.dryRun),
    snapshot: writeIfChanged(SNAPSHOT_PATH, snapshot, options.dryRun),
  };

  console.log(
    JSON.stringify(
      {
        dryRun: options.dryRun,
        spreadsheetPlayers: translations.size,
        newlyRemoved,
        totalExcluded: excluded.size,
        changedAnswers,
        removedSourceObjects: prune.removedObjects,
        changedSourceFiles: prune.changedFiles,
        changed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
