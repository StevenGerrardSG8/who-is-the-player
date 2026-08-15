import { HINT_COSTS, buildBankLetters, checkAnswer, computeReward, computeStars, renderAnswerLayout } from "./game.js";
import {
  packSolvedCount,
  packStarTotal,
  totalStars,
  isPackUnlocked,
  resetPackProgress,
} from "./state.js";
import {
  UNLOCK_MODE,
  STARS_PER_UNLOCK,
  TOP_LEAGUE_PACKS,
  HOME_LEAGUE_PACK,
  SPECIAL_PACKS,
  FEATURED_PACK_ID,
} from "./config.js";
import { loadPhoto as loadPhotoInto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, onLangChange } from "./i18n/index.js";
import { resolvePlayer } from "./i18n/content/index.js";
import { translatePackName } from "./i18n/content/leagues.js";

const $ = (id) => document.getElementById(id);

let ctx = null; // { state, packs, packOrder, persist }
let currentPackId = null;
let tiles = [];
let slots = [];
let locked = false;
let toastTimer;
let resolved = null; // current round's player, resolved for the active UI language

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

// Which of the two home-screen tabs is active, and whether the collapsed
// "More Leagues" accordion is open. Module-scoped so the choice survives a
// pack-complete -> back-to-home round trip within the same session, but
// naturally resets on a full page reload.
let activePackTab = "top";
let moreExpanded = false;

function buildPackCard(packId) {
  const pack = ctx.packs[packId];
  if (!pack) return null;
  // Always look up the pack's index in the *full* flat PACK_ORDER (not its
  // position within whatever section/tab we're currently building) — that's
  // the index isPackUnlocked()/lockHint() expect for "stars"/"sequential"
  // unlock-mode maths, regardless of which section the card renders in.
  const idx = ctx.packOrder.indexOf(packId);
  const ps = ctx.state.packs[packId];
  const solved = packSolvedCount(ps);
  const stars = packStarTotal(ps);
  const unlocked = isPackUnlocked(ctx.state, ctx.packOrder, ctx.packs, idx);
  const pct = Math.round((solved / pack.players.length) * 100);

  const card = document.createElement("div");
  card.className = "pack-card" + (unlocked ? "" : " locked");
  card.innerHTML =
    '<div class="p-icon">' + pack.icon + "</div>" +
    '<div class="p-name">' + translatePackName(pack, getLang()) + "</div>" +
    '<div class="p-progress">' + solved + "/" + pack.players.length + "</div>" +
    '<div class="p-bar"><div class="p-bar-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="p-stars">★ ' + stars + "</div>" +
    (unlocked ? "" : '<div class="p-hint">' + lockHint(idx) + "</div>");

  if (unlocked) {
    card.addEventListener("click", () => showGame(packId));
  }
  return card;
}

function buildPackGrid(packIds, extraClass) {
  const grid = document.createElement("div");
  grid.className = "pack-grid" + (extraClass ? " " + extraClass : "");
  packIds.forEach((packId) => {
    const card = buildPackCard(packId);
    if (card) grid.appendChild(card);
  });
  return grid;
}

function buildSection(titleKey, packIds, opts = {}) {
  const section = document.createElement("div");
  section.className = "pack-section";
  const h = document.createElement("h2");
  h.className = "pack-section-title";
  h.textContent = t(titleKey);
  section.appendChild(h);
  if (opts.subKey) {
    const sub = document.createElement("p");
    sub.className = "pack-section-sub";
    sub.textContent = t(opts.subKey);
    section.appendChild(sub);
  }
  section.appendChild(buildPackGrid(packIds, opts.gridClass));
  return section;
}

function renderPackGrid() {
  const content = $("packContent");
  content.innerHTML = "";

  if (activePackTab === "all") {
    content.appendChild(buildPackGrid(ctx.packOrder));
    return;
  }

  // Default "Top" tab: featured mix + curated top leagues, the Israeli
  // league (home-market pack, always shown), a clearly-labelled Specials
  // section, then everything else collapsed behind a "More Leagues" toggle.
  const bucketed = new Set([FEATURED_PACK_ID, HOME_LEAGUE_PACK, ...TOP_LEAGUE_PACKS, ...SPECIAL_PACKS]);
  const moreIds = ctx.packOrder.filter((id) => !bucketed.has(id));

  content.appendChild(buildSection("home.sectionTopLeagues", [FEATURED_PACK_ID, ...TOP_LEAGUE_PACKS]));
  content.appendChild(buildSection("home.sectionIsraeli", [HOME_LEAGUE_PACK], { gridClass: "one-col" }));
  content.appendChild(buildSection("home.sectionSpecials", SPECIAL_PACKS, { subKey: "home.sectionSpecialsHint" }));

  const moreWrap = document.createElement("div");
  moreWrap.className = "pack-more";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pack-more-toggle";
  toggle.innerHTML =
    "<span>" + t("home.moreLeagues", { n: moreIds.length }) + '</span><span class="pack-more-chevron">' + (moreExpanded ? "▴" : "▾") + "</span>";
  toggle.addEventListener("click", () => {
    moreExpanded = !moreExpanded;
    renderPackGrid();
  });
  moreWrap.appendChild(toggle);
  const moreGrid = buildPackGrid(moreIds, "pack-more-body");
  moreGrid.hidden = !moreExpanded;
  moreWrap.appendChild(moreGrid);
  content.appendChild(moreWrap);
}

function setPackTab(tab) {
  if (activePackTab === tab) return;
  activePackTab = tab;
  $("packTabTop").classList.toggle("active", tab === "top");
  $("packTabAll").classList.toggle("active", tab === "all");
  renderPackGrid();
  window.scrollTo({ top: 0, behavior: "auto" });
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
  $("gamePackName").textContent = translatePackName(pack, getLang());
}

function buildRound() {
  const p = currentPlayerData();
  const ps = currentPackState();
  const pack = currentPack();
  resolved = resolvePlayer(p, getLang(), pack);
  locked = false;
  ps.hintsBought = ps.hintsBought || [];
  $("sticker").classList.remove("win");
  $("stickerNum").textContent = "#" + (ps.levelIndex + 1);
  $("clueChips").innerHTML = "";
  $("careerPanel").classList.remove("show");
  $("careerTable").innerHTML = "";

  const answerEl = $("answer");
  answerEl.classList.remove("correct", "wrong", "small", "tiny", "rtl");
  answerEl.classList.toggle("rtl", !!resolved.rtl);
  const letters = resolved.answer.replace(/[ -]/g, "").length;
  if (letters >= 12) answerEl.classList.add("tiny");
  else if (letters >= 9) answerEl.classList.add("small");

  slots = [];
  renderAnswerLayout(resolved.answer, answerEl, slots, removeFromSlot);

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
  if (checkAnswer(guess, resolved.answer)) {
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
  slots.forEach((s) => {
    if (s.tileIdx !== null) {
      tiles[s.tileIdx].used = false;
      tiles[s.tileIdx].el.classList.remove("used");
      s.tileIdx = null;
      s.el.textContent = "";
      s.el.classList.remove("filled");
    }
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
  $("mTitle").textContent = revealed ? t("win.revealed") : t("win.goal");
  // resolved.answer differs from the pack's base answer only when the active
  // UI language has a localized override for this player — show both so a
  // Hebrew player still sees the real (Wikipedia) name they just solved.
  $("mName").textContent =
    resolved.answer === p.answer ? p.wiki : resolved.answer.replace(/ /g, " ") + " · " + p.wiki;
  $("mRewards").innerHTML =
    "+<b>" + reward.points + "</b> " + t("game.pts") + " &nbsp;·&nbsp; +<b>" + reward.coins + "</b> " + t("game.coinsShort") + " &nbsp;·&nbsp; " + "★".repeat(stars);

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
  $("pcPackName").textContent = translatePackName(pack, getLang());
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
  $("packTabTop").addEventListener("click", () => setPackTab("top"));
  $("packTabAll").addEventListener("click", () => setPackTab("all"));
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
  $("settingsBtn").addEventListener("click", () => toast(t("home.settingsSoon")));

  onLangChange(() => {
    if (currentPackId === null) renderHome();
    else buildRound();
  });
}
