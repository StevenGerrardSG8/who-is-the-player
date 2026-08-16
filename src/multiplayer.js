import { shuffle, buildBankLetters, checkAnswer, renderAnswerLayout } from "./game.js";
import { loadPhoto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, showLangPicker, onLangChange } from "./i18n/index.js";
import { translatePackName } from "./i18n/content/leagues.js";
import { resolvePlayer } from "./i18n/content/index.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
const MP_POINTS = 100;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

let packs = null;
let packOrder = null;
let onExit = null;
let recordChampion = null;

let playerNames = ["", ""];

let game = null; // { players:[{name,score}], deck:[player,...], roundIndex, rounds, packName }
let tiles = [];
let slots = [];
let locked = false;
let awaitingWinner = false;
let winnerFlashIdx = null; // briefly highlights the tapped winner's chip
let resolved = null; // current round's player, resolved for the active UI language

/* ============================================================
   SETUP SCREEN
============================================================ */
function renderSetup() {
  const list = $("mpPlayerList");
  list.innerHTML = "";
  playerNames.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "mp-player-row";
    const badge = document.createElement("div");
    badge.className = "mp-player-badge";
    badge.textContent = i + 1;
    row.appendChild(badge);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("mp.playerPlaceholder", { n: i + 1 });
    input.value = name;
    input.maxLength = 16;
    input.addEventListener("input", (e) => {
      playerNames[i] = e.target.value;
    });
    row.appendChild(input);
    if (playerNames.length > MIN_PLAYERS) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "mp-remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        playerNames.splice(i, 1);
        renderSetup();
      });
      row.appendChild(removeBtn);
    }
    list.appendChild(row);
  });

  $("mpAddPlayerBtn").style.display = playerNames.length >= MAX_PLAYERS ? "none" : "";

  const packSelect = $("mpPackSelect");
  const prevValue = packSelect.value;
  packSelect.innerHTML = "";
  packOrder.forEach((packId) => {
    const pack = packs[packId];
    if (!pack) return;
    const opt = document.createElement("option");
    opt.value = packId;
    opt.textContent = pack.icon + " " + translatePackName(pack, getLang());
    packSelect.appendChild(opt);
  });
  if (prevValue) packSelect.value = prevValue;
}

function showSetup() {
  showScreen("screenMpSetup");
  renderSetup();
}

function startGame() {
  const names = playerNames.map((n) => n.trim()).filter(Boolean);
  if (names.length < MIN_PLAYERS) {
    toast(t("mp.needMinPlayers", { n: MIN_PLAYERS }));
    return;
  }
  const packId = $("mpPackSelect").value;
  const pack = packs[packId];
  const rounds = Math.max(1, Math.min(20, parseInt($("mpRoundsInput").value, 10) || 5));

  const deck = buildDeck(pack.players, rounds);

  game = {
    players: names.map((name) => ({ name, score: 0 })),
    deck,
    roundIndex: 0,
    rounds,
    packId,
    packName: pack.name,
  };

  showScreen("screenMpGame");
  buildRound();
}

function buildDeck(players, count) {
  const deck = [];
  let pool = shuffle([...players]);
  while (deck.length < count) {
    if (pool.length === 0) pool = shuffle([...players]);
    deck.push(pool.pop());
  }
  return deck;
}

/* ============================================================
   IN-GAME
============================================================ */
function currentTarget() {
  return game.deck[game.roundIndex];
}

function renderScoreboard() {
  const el = $("mpScoreboard");
  el.innerHTML = game.players
    .map((p, i) => {
      const cls = (awaitingWinner ? " tappable" : "") + (i === winnerFlashIdx ? " winner-flash" : "");
      return (
        '<div class="mp-score-chip' + cls + '" data-idx="' + i + '">' +
        '<span class="mp-score-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="mp-score-value">' + p.score + "</span>" +
        "</div>"
      );
    })
    .join("");
  $("mpRoundLabel").textContent = t("mp.round", { round: game.roundIndex + 1, total: game.rounds });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildRound() {
  locked = false;
  awaitingWinner = false;
  winnerFlashIdx = null;
  const p = currentTarget();
  resolved = resolvePlayer(p, getLang());
  $("mpSticker").classList.remove("win");
  $("mpStickerNum").textContent = "#" + (game.roundIndex + 1);
  $("mpTurnBanner").textContent = t("mp.raceBanner");
  $("mpTurnBanner").classList.remove("awaiting");
  $("mpAnswer").classList.remove("correct", "wrong", "small", "tiny", "rtl");

  const answerEl = $("mpAnswer");
  answerEl.classList.toggle("rtl", !!resolved.rtl);
  const letters = resolved.answer.replace(/[ -]/g, "").length;
  if (letters >= 12) answerEl.classList.add("tiny");
  else if (letters >= 9) answerEl.classList.add("small");

  slots = [];
  renderAnswerLayout(resolved.answer, answerEl, slots, removeFromSlot);

  const bankLetters = buildBankLetters(resolved.answer, resolved.alphabet);
  const bankEl = $("mpBank");
  bankEl.innerHTML = "";
  bankEl.classList.toggle("rtl", !!resolved.rtl);
  tiles = bankLetters.map((ch) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.textContent = ch;
    const tileObj = { char: ch, el: b, used: false };
    b.addEventListener("click", () => placeTile(tileObj));
    bankEl.appendChild(b);
    return tileObj;
  });

  loadPhoto(p, $("mpPhoto"));
  prefetchPhotos(game.deck.slice(game.roundIndex + 1, game.roundIndex + 3));
  renderScoreboard();
}

function placeTile(tile) {
  if (locked || tile.used) return;
  const empty = slots.find((s) => s.tileIdx === null);
  if (!empty) return;
  empty.tileIdx = tiles.indexOf(tile);
  empty.el.textContent = tile.char;
  empty.el.classList.add("filled");
  tile.used = true;
  tile.el.classList.add("used");
  if (slots.every((s) => s.tileIdx !== null)) checkNow();
}

function removeFromSlot(slot) {
  if (locked || slot.tileIdx === null) return;
  const tile = tiles[slot.tileIdx];
  tile.used = false;
  tile.el.classList.remove("used");
  slot.tileIdx = null;
  slot.el.textContent = "";
  slot.el.classList.remove("filled");
  $("mpAnswer").classList.remove("wrong");
}

function checkNow() {
  const guess = slots.map((s) => tiles[s.tileIdx].char).join("");
  if (checkAnswer(guess, resolved.answer)) {
    onCorrectGuess();
  } else {
    $("mpAnswer").classList.add("wrong");
    setTimeout(() => $("mpAnswer").classList.remove("wrong"), 600);
  }
}

function onCorrectGuess() {
  locked = true;
  awaitingWinner = true;
  $("mpAnswer").classList.add("correct");
  $("mpTurnBanner").textContent = t("mp.tapWinner");
  $("mpTurnBanner").classList.add("awaiting");
  renderScoreboard();
}

function awardPoint(idx) {
  if (!awaitingWinner) return;
  awaitingWinner = false;
  winnerFlashIdx = idx;
  game.players[idx].score += MP_POINTS;
  $("mpSticker").classList.add("win");
  $("mpTurnBanner").classList.remove("awaiting");
  renderScoreboard();
  setTimeout(advanceRound, 700);
}

function skipTurn() {
  if (locked) return;
  locked = true;
  $("mpSticker").classList.add("win");
  setTimeout(advanceRound, 500);
}

function advanceRound() {
  awaitingWinner = false;
  game.roundIndex += 1;
  if (game.roundIndex >= game.rounds) {
    showResults();
    return;
  }
  buildRound();
}

function showResults() {
  $("screenMpGame").style.display = "none";
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0].score;
  const winners = ranked.filter((p) => p.score === topScore);
  $("mpWinnerName").textContent =
    winners.length > 1
      ? t("mp.tie", { names: winners.map((p) => p.name).join(" & ") })
      : t("mp.wins", { name: winners[0].name });
  $("mpFinalScores").innerHTML = ranked
    .map(
      (p, i) =>
        '<div class="mp-final-row' + (p.score === topScore ? " winner" : "") + '">#' + (i + 1) + " " + escapeHtml(p.name) + " — <b>" + p.score + "</b> " + t("game.pts") + "</div>"
    )
    .join("");
  $("mpResultsOverlay").classList.add("show");

  // Local multiplayer is one shared device passed around the room — record
  // the winner(s) into the on-device champions log so regulars can see who's
  // won the most, instead of discarding the result once this overlay closes.
  if (recordChampion) {
    winners.forEach((w) =>
      recordChampion({ name: w.name, score: w.score, packId: game.packId, mode: "local", date: Date.now() })
    );
  }
}

function quitToHome() {
  game = null;
  $("screenMpGame").style.display = "none";
  $("mpResultsOverlay").classList.remove("show");
  if (onExit) onExit();
}

/* ============================================================
   INIT
============================================================ */
export function init(context) {
  packs = context.packs;
  packOrder = context.packOrder;
  onExit = context.onExit;
  recordChampion = context.recordChampion;

  $("mpAddPlayerBtn").addEventListener("click", () => {
    if (playerNames.length < MAX_PLAYERS) {
      playerNames.push("");
      renderSetup();
    }
  });
  $("mpStartBtn").addEventListener("click", startGame);
  $("mpBackBtn").addEventListener("click", () => {
    $("screenMpSetup").style.display = "none";
    if (onExit) onExit();
  });
  $("mpSkipBtn").addEventListener("click", skipTurn);
  $("mpScoreboard").addEventListener("click", (e) => {
    const chip = e.target.closest(".mp-score-chip");
    if (!chip || !awaitingWinner) return;
    awardPoint(parseInt(chip.dataset.idx, 10));
  });
  $("mpQuitBtn").addEventListener("click", quitToHome);
  $("mpPlayAgainBtn").addEventListener("click", quitToHome);
  $("mpSetupLangBtn").addEventListener("click", showLangPicker);

  // Re-render the setup screen's dynamic bits (per-player placeholders,
  // translated pack names) if the language changes while it's on-screen —
  // static chrome (buttons/labels) is already covered by applyStaticTranslations.
  onLangChange(() => {
    if ($("screenMpSetup").style.display !== "none") renderSetup();
    if ($("screenMpGame").style.display !== "none" && game) buildRound();
  });
}

export { showSetup };
