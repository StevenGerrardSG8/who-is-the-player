import {
  HINT_COSTS,
  buildBankLetters,
  checkAnswer,
  computeReward,
  computeStars,
  computeStreakBonus,
  computeTimeBonus,
  renderAnswerLayout,
} from "./game.js";
import {
  packSolvedCount,
  packStarTotal,
  totalStars,
  isPackUnlocked,
  resetPackProgress,
  recordPackRun,
  championsLeaderboard,
} from "./state.js";
import {
  UNLOCK_MODE,
  STARS_PER_UNLOCK,
  TOP_LEAGUE_PACKS,
  HOME_LEAGUE_PACK,
  SPECIAL_PACKS,
  FEATURED_PACK_ID,
  TIMED_BONUS_WINDOW_SEC,
  SURVIVAL_LIVES,
} from "./config.js";
import { loadPhoto as loadPhotoInto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, onLangChange } from "./i18n/index.js";
import { resolvePlayer } from "./i18n/content/index.js";
import { translatePackName } from "./i18n/content/leagues.js";
import {
  getGlobalName,
  setGlobalName,
  recordRun,
  fetchLeaderboard,
  isPushAlreadyEnabled,
  enablePushNotifications,
} from "./backend.js";

const $ = (id) => document.getElementById(id);

let ctx = null; // { state, packs, packOrder, persist }
let currentPackId = null;
let onHallOfFame = false;
let tiles = [];
let slots = [];
let locked = false;
let toastTimer;
let resolved = null; // current round's player, resolved for the active UI language
let mistakesThisRound = 0; // wrong "all slots filled" checks this round, drives the streak bonus
let wrongFreeTimer = null; // pending timeout that frees wrong-position letters back to the bank
let roundStartTime = 0; // Date.now() when the current round started, for timed-mode scoring
let timerInterval = null; // interval driving the visible countdown in timed mode

// Survival Mode ("lives") is scoped to a single pack *attempt* rather than
// persisted — it resets to full whenever a pack is (re)entered from Home,
// and stays put across levels within that same attempt so wrong guesses on
// later players can still cost lives banked from earlier ones.
let livesLeft = SURVIVAL_LIVES;

function survivalEnabled() {
  return !!(ctx.state.settings && ctx.state.settings.survivalMode);
}

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
  renderHofTeaser();
  renderPackGrid();
}

// Best-ever pack run (highest score) across every pack, for the home-screen
// Hall of Fame teaser — packState.bestRuns is already sorted best-first (see
// recordPackRun in state.js), so each pack's own best is just bestRuns[0].
function bestOverallRun() {
  let best = null;
  ctx.packOrder.forEach((packId) => {
    const pack = ctx.packs[packId];
    const ps = ctx.state.packs[packId];
    if (!pack || !ps || !ps.bestRuns || !ps.bestRuns.length) return;
    const top = ps.bestRuns[0];
    if (!best || top.score > best.run.score) best = { pack, run: top };
  });
  return best;
}

// Home-screen Hall of Fame teaser: a day-streak flame + a "your best pack"
// stat, so a returning player sees real progress the instant Home loads
// instead of having to tap into Hall of Fame first.
function renderHofTeaser() {
  const streak = ctx.state.hallOfFame.streak.current;
  const best = bestOverallRun();
  const parts = [];
  if (streak > 0) {
    parts.push(
      '<span class="hof-teaser-streak"><span class="flame">🔥</span><b>' + streak + "</b> " + t("hof.streakCurrentLabel") + "</span>"
    );
  }
  if (best) {
    parts.push(
      '<span class="hof-teaser-best">' + best.pack.icon + " " +
        escapeHofHtml(t("home.hofTeaserBest", { pack: translatePackName(best.pack, getLang()), score: best.run.score })) +
      "</span>"
    );
  }
  $("hofTeaserStats").innerHTML = parts.length ? parts.join("") : '<span class="hof-teaser-hint">' + t("home.hofTeaserEmpty") + "</span>";
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

  content.appendChild(buildSection("home.sectionIsraeli", [HOME_LEAGUE_PACK], { gridClass: "one-col" }));
  content.appendChild(buildSection("home.sectionTopLeagues", [FEATURED_PACK_ID, ...TOP_LEAGUE_PACKS]));
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
export function toast(msg) {
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
  renderLives(false);
}

// Renders the heart row that mirrors `livesLeft`, and hides the whole
// scoreboard slot when Survival Mode is off (default) so normal play looks
// exactly as it always has. `justLost`, when true, tags the heart that was
// just lost with a one-shot animation class instead of just re-drawing.
function renderLives(justLost) {
  const item = $("sbLivesItem");
  if (!survivalEnabled()) {
    item.style.display = "none";
    return;
  }
  item.style.display = "";
  const el = $("sbLives");
  el.innerHTML = "";
  for (let i = 0; i < SURVIVAL_LIVES; i++) {
    const heart = document.createElement("span");
    heart.className = "heart" + (i < livesLeft ? "" : " lost") + (justLost && i === livesLeft ? " just-lost" : "");
    heart.textContent = "♥";
    el.appendChild(heart);
  }
}

function buildRound() {
  const p = currentPlayerData();
  const ps = currentPackState();
  const pack = currentPack();
  resolved = resolvePlayer(p, getLang());
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
  if (survivalEnabled()) loseLife();

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

// ---------- survival mode: lives ----------
function loseLife() {
  livesLeft = Math.max(0, livesLeft - 1);
  renderLives(true);
  if (livesLeft <= 0) {
    // Freeze the board (same lock used on a win) so the player can't keep
    // fiddling with tiles while the "you're out" overlay is about to show.
    locked = true;
    updateHintButtons();
    setTimeout(showSurvivalOut, 700);
  }
}

function showSurvivalOut() {
  const pack = currentPack();
  $("survivalOutPackName").textContent = pack.name;
  $("survivalOutDesc").textContent = t("survival.outDesc", { pack: pack.name });
  $("survivalOutOverlay").classList.add("show");
}

function retrySurvivalPack() {
  $("survivalOutOverlay").classList.remove("show");
  resetPackProgress(ctx.state, currentPackId);
  livesLeft = SURVIVAL_LIVES;
  ctx.persist();
  buildRound();
}

/* ---------- hints ----------
   Design call for Survival Mode: Hint 3 (Reveal Name) is disabled while
   Survival Mode is on. Hints 1/2 (position/country, career clubs) still cost
   coins but leave the player to actually type the letters in — a wrong
   entry still costs a life, so the challenge stays real. Reveal, on the
   other hand, would let a player facing their last life always buy their
   way to a guaranteed "win" for a handful of coins, which defeats the whole
   point of a lives-based challenge — so it's blocked outright rather than
   just discouraged. */
function updateHintButtons() {
  const ps = currentPackState();
  const survivalBlocksReveal = survivalEnabled();
  [1, 2, 3].forEach((n) => {
    const btn = $("hint" + n);
    const bought = ps.hintsBought.includes(n);
    const blocked = n === 3 && survivalBlocksReveal;
    btn.classList.toggle("bought", bought);
    btn.classList.toggle("survival-blocked", blocked);
    btn.disabled = bought || locked || blocked;
    btn.querySelector(".h-cost").textContent = blocked
      ? t("hint.disabledSurvival")
      : bought
      ? t("hint.bought")
      : "● " + HINT_COSTS[n];
  });
}

function buyHint(n) {
  const ps = currentPackState();
  if (locked || ps.hintsBought.includes(n)) return;
  if (n === 3 && survivalEnabled()) return;
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
  const target = resolved.answer.replace(/[ -]/g, "").split("");
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
  ps.runScore = (ps.runScore || 0) + reward.points;

  const p = currentPlayerData();
  $("mTitle").textContent = revealed ? t("win.revealed") : t("win.goal");
  // resolved.answer is already localized whenever it's actually written in
  // Hebrew script — whether that's a per-player he.js override, or (for
  // Hebrew-native packs like the Israeli league, which have no override
  // because their base answer already IS Hebrew) the pack's own data. Show
  // it alongside the real Wikipedia name in that case; a same-script match
  // (e.g. English UI, Latin answer) would just be a redundant duplicate.
  const isLocalizedAnswer = /[֐-׿]/.test(resolved.answer);
  $("mName").textContent = isLocalizedAnswer ? resolved.answer.replace(/ /g, " ") + " · " + p.wiki : p.wiki;
  let rewardsHtml =
    "+<b>" + totalPoints + "</b> " + t("game.pts") + " &nbsp;·&nbsp; +<b>" + totalCoins + "</b> " + t("game.coinsShort") + " &nbsp;·&nbsp; " + "★".repeat(stars);
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

  // Snapshot this completed playthrough into the pack's personal-bests
  // history, then reset the run trackers so the next playthrough (e.g. a
  // replay) starts a fresh run instead of inheriting this one's numbers.
  const timeMs = ps.runStartedAt ? Date.now() - ps.runStartedAt : null;
  recordPackRun(ps, { score: ps.runScore || 0, stars: packStarTotal(ps), timeMs, date: Date.now() });
  recordRun({ score: ps.runScore || 0, mode: "solo", packId: currentPackId });
  ps.runScore = 0;
  ps.runStartedAt = null;
  ctx.persist();

  $("pcPackName").textContent = translatePackName(pack, getLang());
  $("pcStars").innerHTML =
    "★ " + packStarTotal(ps) + " / " + pack.players.length * 3 + " &nbsp;·&nbsp; " + pack.players.length + "/" + pack.players.length + " solved";
  $("packCompleteOverlay").classList.add("show");
}

/* ---------- reset ---------- */
async function resetProgress() {
  if (!confirm(t("game.resetConfirm", { pack: currentPack().name }))) return;
  resetPackProgress(ctx.state, currentPackId);
  livesLeft = SURVIVAL_LIVES;
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

let activeGlobalPeriod = "daily";

async function renderGlobalNameUI() {
  const name = getGlobalName();
  $("hofNameSetup").style.display = name ? "none" : "";
  $("hofNamePlaying").style.display = name ? "" : "none";
  if (name) $("hofPlayingAsName").textContent = name;

  const pushOn = name && (await isPushAlreadyEnabled());
  $("hofEnablePushBtn").style.display = name && !pushOn ? "" : "none";
  $("hofPushOnLabel").style.display = pushOn ? "" : "none";
}

async function loadGlobalLeaderboard() {
  const period = activeGlobalPeriod;
  const listEl = $("hofGlobalList");
  listEl.innerHTML = '<div class="hof-empty">' + t("hof.globalLoading") + "</div>";
  const rows = await fetchLeaderboard(period);
  if (!onHallOfFame || period !== activeGlobalPeriod) return; // a newer tab click superseded this fetch
  if (!rows.length) {
    listEl.innerHTML = '<div class="hof-empty">' + t("hof.globalEmpty") + "</div>";
    return;
  }
  const unit = period === "dayStreak" ? t("hof.dayStreakUnit") : period === "winStreak" ? t("hof.winStreakUnit") : t("hof.pts");
  listEl.innerHTML = rows
    .map(
      (row, i) =>
        '<div class="hof-champ-lead"><span><span class="rank">#' + (i + 1) + "</span>" + escapeHofHtml(row.name) +
        '</span><span class="wins">' + row.value + " " + unit + "</span></div>"
    )
    .join("");
}

function setGlobalTab(period) {
  activeGlobalPeriod = period;
  $("hofGlobalTabs").querySelectorAll(".hof-global-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.period === period));
  loadGlobalLeaderboard();
}

export function showHallOfFame() {
  onHallOfFame = true;
  showScreen("screenHallOfFame");
  renderHallOfFame();
  renderGlobalNameUI();
  loadGlobalLeaderboard();
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
  livesLeft = SURVIVAL_LIVES; // fresh attempt any time a pack is (re)entered from Home
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
  $("hofTeaserBtn").addEventListener("click", showHallOfFame);
  $("survivalRetryBtn").addEventListener("click", retrySurvivalPack);
  $("survivalHomeBtn").addEventListener("click", () => {
    $("survivalOutOverlay").classList.remove("show");
    ctx.persist();
    showHome();
  });
  $("hofBackBtn").addEventListener("click", showHome);
  $("hofGlobalNameBtn").addEventListener("click", async () => {
    const name = $("hofGlobalNameInput").value.trim();
    if (!name) return;
    await setGlobalName(name);
    renderGlobalNameUI();
    loadGlobalLeaderboard();
  });
  $("hofChangeNameBtn").addEventListener("click", () => {
    $("hofGlobalNameInput").value = getGlobalName() || "";
    $("hofNameSetup").style.display = "";
    $("hofNamePlaying").style.display = "none";
  });
  $("hofEnablePushBtn").addEventListener("click", async () => {
    const ok = await enablePushNotifications();
    if (ok) renderGlobalNameUI();
    else toast(t("hof.pushFailed"));
  });
  $("hofGlobalTabs").querySelectorAll(".hof-global-tab").forEach((btn) => {
    btn.addEventListener("click", () => setGlobalTab(btn.dataset.period));
  });

  onLangChange(() => {
    if (onHallOfFame) {
      renderHallOfFame();
      loadGlobalLeaderboard();
    } else if (currentPackId === null) renderHome();
    else buildRound();
  });
}
