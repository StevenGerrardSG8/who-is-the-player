import { HINT_COSTS, buildBankLetters, checkAnswer, computeReward, computeStars } from "./game.js";
import {
  packSolvedCount,
  packStarTotal,
  totalStars,
  isPackUnlocked,
  resetPackProgress,
  recordPackRun,
  championsLeaderboard,
} from "./state.js";
import { UNLOCK_MODE, STARS_PER_UNLOCK } from "./config.js";
import { loadPhoto as loadPhotoInto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, onLangChange } from "./i18n/index.js";
import { resolvePlayer } from "./i18n/content/index.js";

const $ = (id) => document.getElementById(id);

let ctx = null; // { state, packs, packOrder, persist }
let currentPackId = null;
let onHallOfFame = false;
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
  $("homeStreak").textContent = ctx.state.hallOfFame.streak.current;
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
      const slotObj = { char: ch, el: s, tileIdx: null };
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
  ps.runScore = (ps.runScore || 0) + reward.points;

  const p = currentPlayerData();
  $("mTitle").textContent = revealed ? t("win.revealed") : t("win.goal");
  $("mName").textContent = p.wiki;
  $("mRewards").innerHTML =
    "+<b>" + reward.points + "</b> pts &nbsp;·&nbsp; +<b>" + reward.coins + "</b> coins &nbsp;·&nbsp; " + "★".repeat(stars);

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

  // Snapshot this completed playthrough into the pack's personal-bests
  // history, then reset the run trackers so the next playthrough (e.g. a
  // replay) starts a fresh run instead of inheriting this one's numbers.
  const timeMs = ps.runStartedAt ? Date.now() - ps.runStartedAt : null;
  recordPackRun(ps, { score: ps.runScore || 0, stars: packStarTotal(ps), timeMs, date: Date.now() });
  ps.runScore = 0;
  ps.runStartedAt = null;
  ctx.persist();

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
  onHallOfFame = false;
  showScreen("screenHome");
  renderHome();
}

/* ============================================================
   HALL OF FAME
============================================================ */
function escapeHofHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatHofDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(getLang(), { month: "short", day: "numeric" });
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

function formatHofTime(ms) {
  if (!ms || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? m + "m " + s + "s" : s + "s";
}

function renderHallOfFame() {
  const streak = ctx.state.hallOfFame.streak;
  $("hofStreakCurrent").textContent = streak.current;
  $("hofStreakBest").textContent = streak.longest;

  const bestsEl = $("hofPackBests");
  const packsWithRuns = ctx.packOrder
    .map((packId) => ({ pack: ctx.packs[packId], ps: ctx.state.packs[packId] }))
    .filter((entry) => entry.pack && entry.ps && entry.ps.bestRuns && entry.ps.bestRuns.length);

  if (!packsWithRuns.length) {
    bestsEl.innerHTML = '<div class="hof-empty">' + t("hof.noBests") + "</div>";
  } else {
    bestsEl.innerHTML = packsWithRuns
      .map(({ pack, ps }) => {
        const runsHtml = ps.bestRuns
          .map((run) => {
            const timeStr = formatHofTime(run.timeMs);
            return (
              '<div class="hof-run-chip"><span>★' + run.stars + " · " + formatHofDate(run.date) +
              (timeStr ? " · " + timeStr : "") + '</span><b>' + run.score + " " + t("hof.pts") + "</b></div>"
            );
          })
          .join("");
        return (
          '<div class="hof-pack-row"><div class="hof-pack-head"><span class="p-icon-sm">' + pack.icon +
          '</span><span class="p-name-sm">' + escapeHofHtml(pack.name) + "</span></div>" +
          '<div class="hof-run-list">' + runsHtml + "</div></div>"
        );
      })
      .join("");
  }

  const leaderboardEl = $("hofChampsLeaderboard");
  const logEl = $("hofChampsLog");
  const champions = ctx.state.hallOfFame.champions || [];
  if (!champions.length) {
    leaderboardEl.innerHTML = "";
    logEl.innerHTML = '<div class="hof-empty">' + t("hof.noChampions") + "</div>";
  } else {
    const leaderboard = championsLeaderboard(ctx.state);
    leaderboardEl.innerHTML = leaderboard
      .map(
        (row, i) =>
          '<div class="hof-champ-lead"><span><span class="rank">#' + (i + 1) + "</span>" + escapeHofHtml(row.name) +
          '</span><span class="wins">' + row.wins + " " + t("hof.winsShort") + "</span></div>"
      )
      .join("");
    logEl.innerHTML = champions
      .slice(0, 12)
      .map((c) => {
        const pack = ctx.packs[c.packId];
        const modeLabel = c.mode === "online" ? t("hof.modeOnline") : t("hof.modeLocal");
        const packLabel = pack ? pack.icon + " " + escapeHofHtml(pack.name) : "";
        return (
          '<div class="hof-champ-row"><span class="hof-champ-name">' + escapeHofHtml(c.name) + "</span>" +
          '<span class="hof-champ-meta">' + c.score + " " + t("hof.pts") + " · " + packLabel + " · " + modeLabel + " · " + formatHofDate(c.date) + "</span></div>"
        );
      })
      .join("");
  }
}

export function showHallOfFame() {
  onHallOfFame = true;
  showScreen("screenHallOfFame");
  renderHallOfFame();
}

export function showGame(packId) {
  currentPackId = packId;
  onHallOfFame = false;
  const pack = ctx.packs[packId];
  const ps = ctx.state.packs[packId];
  if (ps.levelIndex >= pack.players.length) {
    ps.levelIndex = 0; // replay a completed pack — start a fresh timed run
    ps.runScore = 0;
    ps.runStartedAt = null;
  }
  if (!ps.runStartedAt) ps.runStartedAt = Date.now();
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
  $("settingsBtn").addEventListener("click", () => toast(t("home.settingsSoon")));
  $("hofBackBtn").addEventListener("click", showHome);

  onLangChange(() => {
    if (onHallOfFame) renderHallOfFame();
    else if (currentPackId === null) renderHome();
    else buildRound();
  });
}
