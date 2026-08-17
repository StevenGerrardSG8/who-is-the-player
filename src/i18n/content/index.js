// Resolves a player entry into display-ready, UI-language-aware values
// (pos/country/career/answer/alphabet/rtl) — entirely at render time. No
// league data file is ever modified: this layers translated content on top
// via lookup tables keyed by stable ids (club name, wiki title), each with a
// safe fallback to the original text.
import { translatePosition } from "./positions.js";
import { translateCountry } from "./country.js";
import { LATIN_ALPHABET, HEBREW_ALPHABET, ARABIC_ALPHABET, CYRILLIC_ALPHABET, GREEK_ALPHABET, normalizeAnswer } from "../../game.js";

import clubsEn from "./clubs/en.js";
import clubsHe from "./clubs/he.js";
import clubsAr from "./clubs/ar.js";
import clubsRu from "./clubs/ru.js";
import clubsEl from "./clubs/el.js";
import clubsJa from "./clubs/ja.js";
import clubsKo from "./clubs/ko.js";
import clubsZh from "./clubs/zh.js";

import answersEn from "./answers/en.js";
import answersHe from "./answers/he.js";
import answersHeDisambiguation from "./answers/he-disambiguation.js";
import answersAr from "./answers/ar.js";
import answersRu from "./answers/ru.js";
import answersEl from "./answers/el.js";
import answersJa from "./answers/ja.js";
import answersKo from "./answers/ko.js";
import answersZh from "./answers/zh.js";

const CLUBS = { en: clubsEn, he: clubsHe, ar: clubsAr, ru: clubsRu, el: clubsEl, ja: clubsJa, ko: clubsKo, zh: clubsZh };
const ANSWERS = {
  en: answersEn,
  he: { ...answersHe, ...answersHeDisambiguation },
  ar: answersAr,
  ru: answersRu,
  el: answersEl,
  ja: answersJa,
  ko: answersKo,
  zh: answersZh,
};

// Scripts with a small fixed alphabet the distractor tiles can be drawn
// from, matched against the answer itself (see alphabetFor). Each entry is
// [detector, tile alphabet, right-to-left].
const SCRIPTS = [
  [/[֐-׿]/, HEBREW_ALPHABET, true],
  [/[؀-ۿ]/, ARABIC_ALPHABET, true],
  [/[Ѐ-ӿ]/, CYRILLIC_ALPHABET, false],
  [/[Ͱ-Ͽ]/, GREEK_ALPHABET, false],
];

// ja/ko/zh have no small fixed "alphabet" — the distractor tile pool is
// built from whatever characters already appear across that language's own
// answers, so it grows naturally as more players get translated.
function commonCharPool(answersDict) {
  const chars = new Set();
  Object.values(answersDict).forEach((entry) => {
    [...normalizeAnswer(entry.answer || "")].forEach((ch) => chars.add(ch));
  });
  return [...chars].join("") || LATIN_ALPHABET;
}

// The bank's distractor letters have to come from the same script the answer
// is actually written in, so derive both that and the text direction from the
// answer itself rather than from the UI language or the pack's declared
// `alphabet`. Either of those can disagree with the word on screen: the
// `all-leagues-mix` pack interleaves every other pack's players into one list
// and declares no alphabet of its own, so a Hebrew-answer player drawn from
// the Israeli league inside that mix used to be spelled in Hebrew but padded
// out with Latin distractors — a bank of two scripts, which gives the answer
// away at a glance. Reading the script off the answer makes that mismatch
// impossible to reintroduce from data alone.
function alphabetFor(answer, lang) {
  const script = SCRIPTS.find(([detect]) => detect.test(answer));
  if (script) return { alphabet: script[1], rtl: script[2] };
  if (/[A-Za-z]/.test(answer)) return { alphabet: LATIN_ALPHABET, rtl: false };
  return { alphabet: ANSWERS[lang] ? commonCharPool(ANSWERS[lang]) : LATIN_ALPHABET, rtl: false };
}

function resolveAnswer(player, lang) {
  const override = ANSWERS[lang] && ANSWERS[lang][player.wiki];
  // A missing override is not an error — the player keeps the pack's own
  // wording (e.g. Hebrew Israeli-league answers stay Hebrew even if the UI
  // language is Spanish), and alphabetFor still matches the tiles to it.
  const answer = (override && override.answer) || player.answer;
  return { answer, ...alphabetFor(answer, lang) };
}

export function resolvePlayer(player, lang) {
  const clubs = CLUBS[lang];
  const { answer, alphabet, rtl } = resolveAnswer(player, lang);

  return {
    ...player,
    answer,
    alphabet,
    rtl,
    pos: translatePosition(player.pos, lang),
    country: translateCountry(player.country, lang),
    career: player.career.map(([years, clubName]) => [
      years,
      (clubs && clubs[clubName]) || clubName,
    ]),
  };
}
