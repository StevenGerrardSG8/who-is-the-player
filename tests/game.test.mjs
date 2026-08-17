import test from "node:test";
import assert from "node:assert/strict";
import { buildBankLetters, checkAnswer, isAnswerSeparator, normalizeAnswer } from "../src/game.js";

test("answer normalization removes spaces and Unicode punctuation", () => {
  assert.equal(normalizeAnswer("קווין-פרינס בואטנג"), "קוויןפרינסבואטנג");
  assert.equal(normalizeAnswer("ג׳ייקוב"), "גייקוב");
  assert.equal(normalizeAnswer("ETO'O"), "ETOO");
});

test("punctuation variants never need a tile", () => {
  const answer = "ג׳ייקוב רמזי";
  const bank = buildBankLetters(answer, "אבגדהוזחטיכלמנסעפצקרשת");
  assert.equal(bank.some(isAnswerSeparator), false);
  assert.equal(checkAnswer("גייקוברמזי", answer), true);
});

test("straight and typographic apostrophes are equivalent", () => {
  assert.equal(checkAnswer("ETOO", "ETO'O"), true);
  assert.equal(checkAnswer("ETOO", "ETO’O"), true);
});
