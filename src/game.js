import {
  HINT_COSTS,
  BASE_POINTS,
  HINT_PENALTY,
  SOLVE_COINS,
  REVEAL_COINS,
  NO_HINT_BONUS,
} from "./config.js";

export const LATIN_ALPHABET = "ABCDEFGHIJKLMNOPRSTUVYZ";
export const HEBREW_ALPHABET = "אבגדהוזחטיכלמנסעפצקרשת";
export const ARABIC_ALPHABET = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
export const CYRILLIC_ALPHABET = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ";
export const GREEK_ALPHABET = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildBankLetters(answer, alphabet = LATIN_ALPHABET) {
  const answerLetters = answer.replace(/ /g, "").split("");
  const total = Math.max(12, answerLetters.length + 4);
  const bankLetters = [...answerLetters];
  while (bankLetters.length < total) {
    bankLetters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return shuffle(bankLetters);
}

export function checkAnswer(guess, answer) {
  return guess === answer.replace(/ /g, "");
}

// hintsBought: array subset of [1,2,3] bought for the level just solved
export function computeReward({ revealed, hintsBought }) {
  if (revealed) return { points: 0, coins: REVEAL_COINS };
  const paidHints = hintsBought.filter((n) => n === 1 || n === 2).length;
  let points = Math.max(BASE_POINTS - paidHints * HINT_PENALTY, 25);
  if (paidHints === 0 && !hintsBought.includes(3)) points += NO_HINT_BONUS;
  return { points, coins: SOLVE_COINS };
}

// 3 = no hints, 2 = info hint(s) but not revealed, 1 = revealed
export function computeStars({ revealed, hintsBought }) {
  if (revealed) return 1;
  if (hintsBought.some((n) => n === 1 || n === 2)) return 2;
  return 3;
}

export { HINT_COSTS };
