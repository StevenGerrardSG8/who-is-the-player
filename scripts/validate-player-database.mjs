import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKS } from "../src/data/packs.js";
import { EXCLUDED_PLAYER_WIKIS } from "../src/data/excluded-players.js";
import { checkAnswer, isAnswerSeparator, normalizeAnswer } from "../src/game.js";
import { resolvePlayer } from "../src/i18n/content/index.js";
import answersHe from "../src/i18n/content/answers/he.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const SNAPSHOT_PATH = path.join(DATA_DIR, "sheet-player-translations.json");
const errors = [];
const corePacks = Object.entries(PACKS).filter(([id]) => id !== "all-leagues-mix");
const occurrences = corePacks.flatMap(([packId, pack]) =>
  pack.players.map((player) => ({ packId, ...player })),
);
const uniquePlayers = new Map(occurrences.map((player) => [player.wiki, player]));

for (const [packId, pack] of corePacks) {
  const seen = new Set();
  for (const player of pack.players) {
    if (seen.has(player.wiki)) errors.push("Duplicate in " + packId + ": " + player.wiki);
    seen.add(player.wiki);
  }
}

const answerGroups = new Map();
let punctuationAnswers = 0;
for (const player of uniquePlayers.values()) {
  if (EXCLUDED_PLAYER_WIKIS.has(player.wiki)) {
    errors.push("Excluded player is active: " + player.wiki);
  }
  const answer = resolvePlayer(player, "he").answer;
  if (!/[\u0590-\u05ff]/.test(answer) || /[A-Za-z]/.test(answer)) {
    errors.push("Player has no complete Hebrew answer: " + player.wiki + " -> " + answer);
  }
  if ([...answer].some(isAnswerSeparator)) punctuationAnswers++;
  const normalized = normalizeAnswer(answer);
  if (!normalized || !checkAnswer(normalized, answer)) {
    errors.push("Answer normalization failed: " + player.wiki + " -> " + answer);
  }
  if (!answerGroups.has(answer)) answerGroups.set(answer, []);
  answerGroups.get(answer).push(player.wiki);
}

for (const [answer, players] of answerGroups) {
  if (players.length > 1) {
    errors.push("Hebrew answer collision " + JSON.stringify(answer) + ": " + players.join(", "));
  }
}

const wikiPattern = /\bwiki\s*:\s*("(?:\\.|[^"])*")/g;
for (const file of fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".js"))) {
  if (["excluded-players.js", "packs.js"].includes(file)) continue;
  const source = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  let match;
  while ((match = wikiPattern.exec(source))) {
    const wiki = JSON.parse(match[1]);
    if (EXCLUDED_PLAYER_WIKIS.has(wiki)) {
      errors.push("Excluded source object remains in " + file + ": " + wiki);
    }
  }
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
for (const [wiki, expected] of Object.entries(snapshot.translations || {})) {
  if (answersHe[wiki]?.answer !== expected) {
    errors.push(
      "Sheet translation mismatch: " +
        wiki +
        " expected " +
        JSON.stringify(expected) +
        " got " +
        JSON.stringify(answersHe[wiki]?.answer),
    );
  }
}

if (PACKS["all-leagues-mix"].players.length !== occurrences.length) {
  errors.push("Combined pack is out of sync with the core packs.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      corePacks: corePacks.length,
      activeOccurrences: occurrences.length,
      uniquePlayers: uniquePlayers.size,
      sheetTranslations: Object.keys(snapshot.translations || {}).length,
      excludedPlayers: EXCLUDED_PLAYER_WIKIS.size,
      punctuationAnswersHandled: punctuationAnswers,
      hebrewAnswerCollisions: 0,
      excludedSourceObjects: 0,
    },
    null,
    2,
  ),
);
