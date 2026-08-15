import {
  HINT_COSTS,
  buildBankLetters,
  checkAnswer,
  computeReward,
  computeStars,
  computeStreakBonus,
  computeTimeBonus,
} from "./game.js";
import {
  packSolvedCount,
  packStarTotal,
  totalStars,
  isPackUnlocked,
  resetPackProgress,
} from "./state.js";
import { UNLOCK_MODE, STARS_PER_UNLOCK, TIMED_BONUS_WINDOW_SEC } from "./config.js";
import { loadPhoto as loadPhotoInto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, onLangChange } from "./i18n/index.js";
import { resolvePlayer } from "./i18n/content/index.js";

const $ = (id) => document.getElementById(id);

let ctx = null; // { state, packs, packOrder, persist }
let currentPackId = null;
let tiles = [];
let slots = [];
let locked = false;
let toastTimer;
let resolved = null; // current round's player, resolved for the active UI language
let mistakesThisRound = 0; // wrong "all slots filled" checks this round, drives the streak bonus
let wrongFreeTimer = null; // pending timeout that frees wrong-position letters back to the bank
let roundStartTime = 0; // Date.now() when the current round started, for timed-mode scoring
let timerInterval = null; // interval driving the visible countdown in timed mode

function currentPack() {
  return ctx.packs[currentPackId];
}
function currentPackState() {
  return ctx.state.packs[currentPackId];
}
function currentPlayerData() {
  return currentPack().players[currentPackState().levelIndex];
}

/* ============================================================
   HOME SCREEN
============================================================ */
function renderHome() {
  $("homeCoins").textContent = ctx.state.coins;
  $("homeStars").textContent = totalStars(ctx.state);
  renderPackGrid();
}

function lockHint(index) {
  if (UNLOCK_MODE === "sequential") return t("home.finishPrevious");
  return t("home.starsToUnlock", { n: index * STARS_PER_UNLOCK });
}

function renderPackGrid() {
  const grid = $("packGrid");
  grid.innerHTML = "";
  ctx.packOrder.forEach((packId, idx) => {
    const pack = ctx.packs[packId];
    if (!pack) return;
    const ps = ctx.state.packs[packId];
    const solved = packSolvedCount(ps);
    const stars = packStarTotal(ps);
    const unlocked = isPackUnlocked(ctx.state, ctx.packOrder, ctx.packs, idx);
    const pct = Math.round((solved / pack.players.length) * 100);

    const card = document.createElement("div");
    card.className = "pack-card" + (unlocked ? "" : " locked");
    card.innerHTML =
      '<div class="p-icon">' + pack.icon + "</div>" +
      '<div class="p-name">' + pack.name + "</div>" +
      '<div class="p-progress">' + solved + "/" + pack.players.length + "</div>" +
      '<div class="p-bar"><div class="p-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="p-stars">★ ' + stars + "</div>" +
      (unlocked ? "" : '<div class="p-hint">' + lockHint(idx) + "</div>");

    if (unlocked) {
      card.addEventListener("click", () => showGame(packId));
    }
    grid.appendChild(card);
  });
}

/* ============================================================
   TOAST
============================================================ */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ============================================================
   PHOTO
============================================================ */
function loadPhoto(p) {
  return loadPhotoInto(p, $("photo"));
}

/* ============================================================
   GAME SCREEN
============================================================ */
function renderScoreboard() {
  const pack = currentPack();
  const ps = currentPackState();
  $("sbLevel").textContent = ps.levelIndex + 1 + "/" + pack.players.length;
  $("sbScore").textContent = ctx.state.score;
  $("sbCoins").textContent = ctx.state.coins;
  $("gamePackName").textContent = pack.name;
}

function buildRound() {
  const p = currentPlayerData();
  const ps = currentPackState();
  const pack = currentPack();
  resolved = resolvePlayer(p, getLang(), pack);
  locked = false;
  mistakesThisRound = 0;
  clearTimeout(wrongFreeTimer);
  ps.hintsBought = ps.hintsBought || [];
  $("sticker").classList.remove("win");
  $("stickerNum").textContent = "#" + (ps.levelIndex + 1);
  $("clueChips").innerHTML = "";
  $("careerPanel").classList.remove("show");
  $("careerTable").innerHTML = "";

  const answerEl = $("answer");
  answerEl.innerHTML = "";
  answerEl.classList.remove("correct", "wrong", "small", "tiny", "rtl");
  answerEl.classList.toggle("rtl", !!resolved.rtl);
  const letters = resolved.answer.replace(/ /g, "").length;
  if (letters >= 12) answerEl.classList.add("tiny");
  else if (letters >= 9) answerEl.classList.add("small");

  slots = [];
  resolved.answer.split(" ").forEach((word) => {
    const w = document.createElement("div");
    w.className = "word";
    word.split("").forEach((ch) => {
      const s = document.createElement("div");
      s.className = "slot";
      const slotObj = { char: ch, el: s, tileIdx: null, confirmed: false };
      s.addEventListener("click", () => removeFromSlot(slotObj));
      w.appendChild(s);
      slots.push(slotObj);
    });
    answerEl.appendChild(w);
  });

  const bankLetters = buildBankLetters(resolved.answer, resolved.alphabet);
  const bankEl = $("bank");
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

  updateHintButtons();
  if (ps.hintsBought.includes(1)) showClueChips();
  if (ps.hintsBought.includes(2)) showCareer();

  loadPhoto(p);
  prefetchPhotos(pack.players.slice(ps.levelIndex + 1, ps.levelIndex + 3));
  renderScoreboard();
  startRoundTimer();
}

/* ---------- timed mode ---------- */
function stopRoundTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const elapsed = (Date.now() - roundStartTime) / 1000;
  const remaining = Math.max(0, TIMED_BONUS_WINDOW_SEC - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  $("gameTimerValue").textContent = mm + ":" + String(ss).padStart(2, "0");
  $("gameTimer").classList.toggle("low", remaining > 0 && remaining <= 5);
  if (remaining <= 0) stopRoundTimer();
}

function startRoundTimer() {
  stopRoundTimer();
  const timerEl = $("gameTimer");
  if (!ctx.state.settings.timedMode) {
    timerEl.style.display = "none";
    return;
  }
  timerEl.style.display = "block";
  timerEl.classList.remove("low");
  roundStartTime = Date.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 250);
}

/* ---------- tile logic ---------- */
function placeTile(tile) {
  if (locked || tile.used) return;
  const empty = slots.find((s) => s.tileIdx === null);
  if (!empty) return;
  empty.tileIdx = tiles.indexOf(tile);
  empty.el.textContent = tile.char;
  empty.el.classList.add("filled");
  tile.used = true;
  tile.el.classList.add("used");
  if (slots.every((s) => s.tileIdx !== null)) checkAnswerNow();
}

function removeFromSlot(slot) {
  if (locked || slot.confirmed || slot.tileIdx === null) return;
  const tile = tiles[slot.tileIdx];
  tile.used = false;
  tile.el.classList.remove("used");
  slot.tileIdx = null;
  slot.el.textContent = "";
  slot.el.classList.remove("filled");
  $("answer").classList.remove("wrong");
}

function checkAnswerNow() {
  const guess = slots.map((s) => tiles[s.tileIdx].char).join("");
  if (checkAnswer(guess, resolved.answer)) {
    winRound(false);
    return;
  }
  mistakesThisRound += 1;
  $("answer").classList.add("wrong");
  setTimeout(() => $("answer").classList.remove("wrong"), 600);

  // Per-letter lock feedback: letters already in the right slot turn green
  // and lock (can't be removed/reused); letters in the wrong slot flash red
  // and then free back to the bank so only the wrong ones need retrying.
  const toFree = [];
  slots.forEach((s) => {
    if (s.confirmed) return;
    const tile = tiles[s.tileIdx];
    if (tile.char === s.char) {
      s.confirmed = true;
      s.el.classList.add("slot-correct");
    } else {
      s.el.classList.add("slot-wrong");
      toFree.push(s);
    }
  });
  clearTimeout(wrongFreeTimer);
  wrongFreeTimer = setTimeout(() => {
    toFree.forEach((s) => {
      const tile = tiles[s.tileIdx];
      tile.used = false;
      tile.el.classList.remove("used");
      s.tileIdx = null;
      s.el.textContent = "";
      s.el.classList.remove("filled", "slot-wrong");
    });
  }, 650);
}

/* ---------- hints ---------- */
function updateHintButtons() {
  const ps = currentPackState();
  [1, 2, 3].forEach((n) => {
    const btn = $("hint" + n);
    const bought = ps.hintsBought.includes(n);
    btn.classList.toggle("bought", bought);
    btn.disabled = bought || locked;
    btn.querySelector(".h-cost").textContent = bought ? t("hint.bought") : "● " + HINT_COSTS[n];
  });
}

function buyHint(n) {
  const ps = currentPackState();
  if (locked || ps.hintsBought.includes(n)) return;
  if (ctx.state.coins < HINT_COSTS[n]) {
    toast(t("game.notEnoughCoins"));
    return;
  }
  ctx.state.coins -= HINT_COSTS[n];
  ps.hintsBought.push(n);
  ctx.persist();
  renderScoreboard();
  updateHintButtons();
  if (n === 1) showClueChips();
  if (n === 2) showCareer();
  if (n === 3) revealName();
}

function showClueChips() {
  $("clueChips").innerHTML = '<span class="chip">' + resolved.pos + '</span><span class="chip">' + resolved.country + "</span>";
}

function showCareer() {
  $("careerTable").innerHTML = resolved.career
    .map((row) => '<tr><td class="years">' + row[0] + '</td><td class="club">' + row[1] + "</td></tr>")
    .join("");
  $("careerPanel").classList.add("show");
}

function revealName() {
  clearTimeout(wrongFreeTimer);
  slots.forEach((s) => {
    if (s.tileIdx !== null) {
      tiles[s.tileIdx].used = false;
      tiles[s.tileIdx].el.classList.remove("used");
      s.tileIdx = null;
      s.el.textContent = "";
      s.el.classList.remove("filled");
    }
    s.confirmed = false;
    s.el.classList.remove("slot-correct", "slot-wrong");
  });
  const target = resolved.answer.replace(/ /g, "").split("");
  target.forEach((ch, i) => {
    const tile = tiles.find((t) => !t.used && t.char === ch);
    if (tile) {
      slots[i].tileIdx = tiles.indexOf(tile);
      slots[i].el.textContent = ch;
      slots[i].el.classList.add("filled");
      tile.used = true;
      tile.el.classList.add("used");
    }
  });
  winRound(true);
}

/* ---------- win / next ---------- */
function winRound(revealed) {
  locked = true;
  stopRoundTimer();
  updateHintButtons();
  $("answer").classList.add("correct");
  $("sticker").classList.add("win");

  const ps = currentPackState();
  const reward = computeReward({ revealed, hintsBought: ps.hintsBought });
  const stars = computeStars({ revealed, hintsBought: ps.hintsBought });

  // No-mistakes streak bonus: reveal or any wrong-guess attempt this round
  // breaks the streak; a clean solve extends it and pays out escalating coins.
  let streakBonus = 0;
  if (revealed || mistakesThisRound > 0) {
    ctx.state.streak = 0;
  } else {
    ctx.state.streak = (ctx.state.streak || 0) + 1;
    streakBonus = computeStreakBonus(ctx.state.streak);
  }

  // Timed-mode bonus: only for genuine (non-revealed) solves, based on how
  // quickly the round was solved once timed mode is switched on.
  let timeBonus = 0;
  if (ctx.state.settings.timedMode && !revealed) {
    const elapsedSec = (Date.now() - roundStartTime) / 1000;
    timeBonus = computeTimeBonus(elapsedSec);
  }

  const totalPoints = reward.points + timeBonus;
  const totalCoins = reward.coins + streakBonus;

  ctx.state.score += totalPoints;
  ctx.state.coins += totalCoins;
  ps.stars[ps.levelIndex] = stars;

  const p = currentPlayerData();
  $("mTitle").textContent = revealed ? t("win.revealed") : t("win.goal");
  $("mName").textContent = p.wiki;
  let rewardsHtml =
    "+<b>" + totalPoints + "</b> pts &nbsp;·&nbsp; +<b>" + totalCoins + "</b> coins &nbsp;·&nbsp; " + "★".repeat(stars);
  const extras = [];
  if (streakBonus > 0) extras.push(t("game.streakBonus", { n: ctx.state.streak, c: streakBonus }));
  if (timeBonus > 0) extras.push(t("game.timeBonus", { n: timeBonus }));
  if (extras.length) rewardsHtml += "<br>" + extras.join(" &nbsp;·&nbsp; ");
  $("mRewards").innerHTML = rewardsHtml;

  const pack = currentPack();
  const isLast = ps.levelIndex >= pack.players.length - 1;
  $("nextBtn").textContent = isLast ? t("win.seeResults") : t("win.nextPlayer");

  ctx.persist();
  setTimeout(() => {
    $("overlay").classList.add("show");
    renderScoreboard();
  }, 700);
}

function nextLevel() {
  $("overlay").classList.remove("show");
  const ps = currentPackState();
  const pack = currentPack();
  ps.hintsBought = [];
  if (ps.levelIndex >= pack.players.length - 1) {
    ctx.persist();
    showPackComplete();
    return;
  }
  ps.levelIndex += 1;
  ctx.persist();
  buildRound();
}

function showPackComplete() {
  const pack = currentPack();
  const ps = currentPackState();
  $("pcPackName").textContent = pack.name;
  $("pcStars").innerHTML =
    "★ " + packStarTotal(ps) + " / " + pack.players.length * 3 + " &nbsp;·&nbsp; " + pack.players.length + "/" + pack.players.length + " solved";
  $("packCompleteOverlay").classList.add("show");
}

/* ---------- reset ---------- */
async function resetProgress() {
  if (!confirm(t("game.resetConfirm", { pack: currentPack().name }))) return;
  resetPackProgress(ctx.state, currentPackId);
  ctx.persist();
  buildRound();
  toast(t("game.resetToast"));
}

/* ============================================================
   SCREEN NAV
============================================================ */
export function showHome() {
  currentPackId = null;
  stopRoundTimer();
  showScreen("screenHome");
  renderHome();
}

export function showGame(packId) {
  currentPackId = packId;
  const pack = ctx.packs[packId];
  const ps = ctx.state.packs[packId];
  if (ps.levelIndex >= pack.players.length) {
    ps.levelIndex = 0; // replay a completed pack
  }
  showScreen("screenGame");
  buildRound();
}

/* ============================================================
   INIT
============================================================ */
export function init(context) {
  ctx = context;
  $("hint1").addEventListener("click", () => buyHint(1));
  $("hint2").addEventListener("click", () => buyHint(2));
  $("hint3").addEventListener("click", () => buyHint(3));
  $("nextBtn").addEventListener("click", nextLevel);
  $("resetBtn").addEventListener("click", resetProgress);
  $("backBtn").addEventListener("click", () => {
    ctx.persist();
    showHome();
  });
  $("pcHomeBtn").addEventListener("click", () => {
    $("packCompleteOverlay").classList.remove("show");
    showHome();
  });
  $("settingsBtn").addEventListener("click", () => {
    $("timedModeToggle").checked = !!ctx.state.settings.timedMode;
    $("settingsOverlay").classList.add("show");
  });
  $("settingsDoneBtn").addEventListener("click", () => {
    $("settingsOverlay").classList.remove("show");
  });
  $("timedModeToggle").addEventListener("change", (e) => {
    ctx.state.settings.timedMode = e.target.checked;
    ctx.persist();
    if (currentPackId !== null) startRoundTimer(); // live-update the in-progress game screen
  });

  onLangChange(() => {
    if (currentPackId === null) renderHome();
    else buildRound();
  });
}
