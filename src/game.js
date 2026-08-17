import {
  HINT_COSTS,
  POINTS_BY_HINTS,
  SOLVE_COINS,
  REVEAL_COINS,
  STREAK_BONUS_COINS,
  STREAK_BONUS_POINTS,
  STREAK_BONUS_CAP,
  TIMED_BONUS_MAX,
  TIMED_BONUS_WINDOW_SEC,
} from "./config.js";

export const LATIN_ALPHABET = "ABCDEFGHIJKLMNOPRSTUVYZ";
export const HEBREW_ALPHABET = "אבגדהוזחטיכלמנסעפצקרשת";
export const ARABIC_ALPHABET = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
export const CYRILLIC_ALPHABET = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ";
export const GREEK_ALPHABET = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";

// Spaces and punctuation are presentation, not letters the player should
// have to find in the tile bank. Unicode punctuation covers Hebrew geresh
// and gershayim as well as straight/curly apostrophes and every hyphen form.
export function isAnswerSeparator(char) {
  return /[\p{P}\p{Z}\s]/u.test(char);
}

export function normalizeAnswer(answer) {
  return [...answer.normalize("NFC")].filter((char) => !isAnswerSeparator(char)).join("");
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildBankLetters(answer, alphabet = LATIN_ALPHABET) {
  const answerLetters = [...normalizeAnswer(answer)];
  const total = Math.max(12, answerLetters.length + 4);
  const bankLetters = [...answerLetters];
  while (bankLetters.length < total) {
    bankLetters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return shuffle(bankLetters);
}

export function checkAnswer(guess, answer) {
  return normalizeAnswer(guess) === normalizeAnswer(answer);
}

// Builds the answer's letter-slot layout into `container`, splitting into
// separate <div class="word"> groups on spaces (as before) and, within a
// word, rendering a "-" as a static separator rather than a slot — a hyphen
// (e.g. "Troost-Ekong", "El-Arabi") is punctuation the player never has to
// hunt for a tile to fill, unlike every real letter. Pushes one entry per
// real letter slot (not separators) onto the caller-supplied `slots` array,
// in reading order, wired to `onSlotClick`.
export function renderAnswerLayout(answer, container, slots, onSlotClick) {
  container.innerHTML = "";
  answer.split(" ").forEach((word) => {
    const w = document.createElement("div");
    w.className = "word";
    word.split("").forEach((ch) => {
      if (isAnswerSeparator(ch)) {
        const sep = document.createElement("div");
        sep.className = "slot-sep";
        sep.textContent = "-";
        w.appendChild(sep);
        return;
      }
      const s = document.createElement("div");
      s.className = "slot";
      const slotObj = { char: ch, el: s, tileIdx: null, confirmed: false };
      s.addEventListener("click", () => onSlotClick(slotObj));
      w.appendChild(s);
      slots.push(slotObj);
    });
    container.appendChild(w);
  });
}

// hintsBought: array subset of [1,2,3] bought for the level just solved
export function computeReward({ revealed, hintsBought }) {
  if (revealed) return { points: 0, coins: REVEAL_COINS };
  const paidHints = hintsBought.filter((n) => n === 1 || n === 2).length;
  return { points: POINTS_BY_HINTS[paidHints], coins: SOLVE_COINS };
}

// 3 = no hints, 2 = info hint(s) but not revealed, 1 = revealed
export function computeStars({ revealed, hintsBought }) {
  if (revealed) return 1;
  if (hintsBought.some((n) => n === 1 || n === 2)) return 2;
  return 3;
}

// No-mistakes streak bonus: escalating coins + points per consecutive round
// solved with zero wrong "all slots filled" checks, capped at
// STREAK_BONUS_CAP consecutive solves. Caller resets streak to 0 on any
// mistake or reveal before calling this with the new (already-incremented)
// streak count.
export function computeStreakBonus(streak) {
  const capped = Math.min(streak, STREAK_BONUS_CAP);
  return {
    coins: capped * STREAK_BONUS_COINS,
    points: capped * STREAK_BONUS_POINTS,
  };
}

// Timed-mode bonus: solving within TIMED_BONUS_WINDOW_SEC seconds of the
// round starting earns up to TIMED_BONUS_MAX bonus points, decaying
// linearly to 0 pts at the window's edge (and staying 0 past it).
export function computeTimeBonus(elapsedSec) {
  if (elapsedSec >= TIMED_BONUS_WINDOW_SEC) return 0;
  const frac = 1 - elapsedSec / TIMED_BONUS_WINDOW_SEC;
  return Math.round(TIMED_BONUS_MAX * frac);
}

export { HINT_COSTS };
