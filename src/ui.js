import { HINT_COSTS, buildBankLetters, checkAnswer, computeReward, computeStars } from "./game.js";
import {
  packSolvedCount,
  packStarTotal,
  totalStars,
  isPackUnlocked,
  resetPackProgress,
} from "./state.js";
import { UNLOCK_MODE, STARS_PER_UNLOCK } from "./config.js";

const $ = (id) => document.getElementById(id);

let ctx = null; // { state, packs, packOrder, persist }
let currentPackId = null;
let tiles = [];
let slots = [];
let locked = false;
let toastTimer;

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
  if (UNLOCK_MODE === "sequential") return "Finish previous pack";
  return index * STARS_PER_UNLOCK + "★ to unlock";
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
async function loadPhoto(p) {
  const photo = $("photo");
  photo.innerHTML = '<div class="fallback">?<small>Loading photo…</small></div>';
  try {
    const r = await fetch(
      "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(p.wiki)
    );
    if (!r.ok) throw new Error("fetch failed");
    const j = await r.json();
    const src = (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source);
    if (!src) throw new Error("no image");
    const img = new Image();
    img.onload = () => {
      photo.innerHTML = "";
      photo.appendChild(img);
    };
    img.onerror = showSilhouette;
    img.src = src;
  } catch (e) {
    showSilhouette();
  }
  function showSilhouette() {
    photo.innerHTML = '<div class="fallback">🕵️<small>Mystery player — use the hints!</small></div>';
  }
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
  locked = false;
  ps.hintsBought = ps.hintsBought || [];
  $("sticker").classList.remove("win");
  $("stickerNum").textContent = "#" + (ps.levelIndex + 1);
  $("clueChips").innerHTML = "";
  $("careerPanel").classList.remove("show");
  $("careerTable").innerHTML = "";

  const answerEl = $("answer");
  answerEl.innerHTML = "";
  answerEl.classList.remove("correct", "wrong", "small", "tiny");
  const letters = p.answer.replace(/ /g, "").length;
  if (letters >= 12) answerEl.classList.add("tiny");
  else if (letters >= 9) answerEl.classList.add("small");

  slots = [];
  p.answer.split(" ").forEach((word) => {
    const w = document.createElement("div");
    w.className = "word";
    word.split("").forEach((ch) => {
      const s = document.createElement("div");
      s.className = "slot";
      const slotObj = { char: ch, el: s, tileIdx: null };
      s.addEventListener("click", () => removeFromSlot(slotObj));
      w.appendChild(s);
      slots.push(slotObj);
    });
    answerEl.appendChild(w);
  });

  const bankLetters = buildBankLetters(p.answer);
  const bankEl = $("bank");
  bankEl.innerHTML = "";
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
  renderScoreboard();
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
  if (locked || slot.tileIdx === null) return;
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
  if (checkAnswer(guess, currentPlayerData().answer)) {
    winRound(false);
  } else {
    $("answer").classList.add("wrong");
    setTimeout(() => $("answer").classList.remove("wrong"), 600);
  }
}

/* ---------- hints ---------- */
function updateHintButtons() {
  const ps = currentPackState();
  [1, 2, 3].forEach((n) => {
    const btn = $("hint" + n);
    const bought = ps.hintsBought.includes(n);
    btn.classList.toggle("bought", bought);
    btn.disabled = bought || locked;
    btn.querySelector(".h-cost").textContent = bought ? "✓ Bought" : "● " + HINT_COSTS[n];
  });
}

function buyHint(n) {
  const ps = currentPackState();
  if (locked || ps.hintsBought.includes(n)) return;
  if (ctx.state.coins < HINT_COSTS[n]) {
    toast("Not enough coins — solve players to earn more!");
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
  const p = currentPlayerData();
  $("clueChips").innerHTML = '<span class="chip">' + p.pos + '</span><span class="chip">' + p.country + "</span>";
}

function showCareer() {
  const p = currentPlayerData();
  $("careerTable").innerHTML = p.career
    .map((row) => '<tr><td class="years">' + row[0] + '</td><td class="club">' + row[1] + "</td></tr>")
    .join("");
  $("careerPanel").classList.add("show");
}

function revealName() {
  slots.forEach((s) => {
    if (s.tileIdx !== null) {
      tiles[s.tileIdx].used = false;
      tiles[s.tileIdx].el.classList.remove("used");
      s.tileIdx = null;
      s.el.textContent = "";
      s.el.classList.remove("filled");
    }
  });
  const target = currentPlayerData().answer.replace(/ /g, "").split("");
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
  updateHintButtons();
  $("answer").classList.add("correct");
  $("sticker").classList.add("win");

  const ps = currentPackState();
  const reward = computeReward({ revealed, hintsBought: ps.hintsBought });
  const stars = computeStars({ revealed, hintsBought: ps.hintsBought });

  ctx.state.score += reward.points;
  ctx.state.coins += reward.coins;
  ps.stars[ps.levelIndex] = stars;

  const p = currentPlayerData();
  $("mTitle").textContent = revealed ? "Revealed 💡" : "GOAL! ⚽";
  $("mName").textContent = p.wiki;
  $("mRewards").innerHTML =
    "+<b>" + reward.points + "</b> pts &nbsp;·&nbsp; +<b>" + reward.coins + "</b> coins &nbsp;·&nbsp; " + "★".repeat(stars);

  const pack = currentPack();
  const isLast = ps.levelIndex >= pack.players.length - 1;
  $("nextBtn").textContent = isLast ? "See Results →" : "Next Player →";

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
  if (!confirm("Reset progress for " + currentPack().name + "? Level and stars for this pack will start over.")) return;
  resetPackProgress(ctx.state, currentPackId);
  ctx.persist();
  buildRound();
  toast("Pack progress reset");
}

/* ============================================================
   SCREEN NAV
============================================================ */
export function showHome() {
  currentPackId = null;
  $("screenGame").style.display = "none";
  $("packCompleteOverlay").classList.remove("show");
  $("screenHome").style.display = "flex";
  renderHome();
}

export function showGame(packId) {
  currentPackId = packId;
  const pack = ctx.packs[packId];
  const ps = ctx.state.packs[packId];
  if (ps.levelIndex >= pack.players.length) {
    ps.levelIndex = 0; // replay a completed pack
  }
  $("screenHome").style.display = "none";
  $("screenGame").style.display = "flex";
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
  $("settingsBtn").addEventListener("click", () => toast("Settings coming soon"));
}
