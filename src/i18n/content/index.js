// Resolves a player entry + the pack it belongs to into display-ready,
// UI-language-aware values (pos/country/career/answer/alphabet/rtl) —
// entirely at render time. No league data file is ever modified: this
// layers translated content on top via lookup tables keyed by stable ids
// (club name, wiki title), each with a safe fallback to the original text.
import { translatePosition } from "./positions.js";
import { translateCountry } from "./country.js";
import { LATIN_ALPHABET, HEBREW_ALPHABET, ARABIC_ALPHABET, CYRILLIC_ALPHABET, GREEK_ALPHABET } from "../../game.js";
import { isRtl } from "../index.js";

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
import answersAr from "./answers/ar.js";
import answersRu from "./answers/ru.js";
import answersEl from "./answers/el.js";
import answersJa from "./answers/ja.js";
import answersKo from "./answers/ko.js";
import answersZh from "./answers/zh.js";

const CLUBS = { en: clubsEn, he: clubsHe, ar: clubsAr, ru: clubsRu, el: clubsEl, ja: clubsJa, ko: clubsKo, zh: clubsZh };
const ANSWERS = { en: answersEn, he: answersHe, ar: answersAr, ru: answersRu, el: answersEl, ja: answersJa, ko: answersKo, zh: answersZh };

// Scripts that can't reuse the Latin tile bank when a localized answer is
// actually available for a player in that language.
const SCRIPT_ALPHABETS = {
  he: HEBREW_ALPHABET,
  ar: ARABIC_ALPHABET,
  ru: CYRILLIC_ALPHABET,
  el: GREEK_ALPHABET,
};

// ja/ko/zh have no small fixed "alphabet" — the distractor tile pool is
// built from whatever characters already appear across that language's own
// answers, so it grows naturally as more players get translated.
function commonCharPool(answersDict) {
  const chars = new Set();
  Object.values(answersDict).forEach((entry) => {
    (entry.answer || "").replace(/ /g, "").split("").forEach((ch) => chars.add(ch));
  });
  return [...chars].join("") || LATIN_ALPHABET;
}

function resolveAnswer(player, lang, pack) {
  const override = ANSWERS[lang] && ANSWERS[lang][player.wiki];
  if (override && override.answer) {
    const alphabet =
      SCRIPT_ALPHABETS[lang] ||
      (["ja", "ko", "zh"].includes(lang) ? commonCharPool(ANSWERS[lang]) : LATIN_ALPHABET);
    return { answer: override.answer, alphabet, rtl: isRtl(lang) };
  }
  // No localized answer for this player yet — keep the pack's own script
  // untouched (e.g. Hebrew Israeli-league answers stay Hebrew even if the
  // UI language is Spanish, rather than forcing a mismatched Latin bank).
  return { answer: player.answer, alphabet: pack.alphabet || LATIN_ALPHABET, rtl: !!pack.rtl };
}

export function resolvePlayer(player, lang, pack) {
  const clubs = CLUBS[lang];
  const { answer, alphabet, rtl } = resolveAnswer(player, lang, pack);

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
