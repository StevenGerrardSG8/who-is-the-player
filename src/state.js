import { storage } from "./storage.js";
import { STORAGE_KEY, START_COINS, UNLOCK_MODE, STARS_PER_UNLOCK } from "./config.js";

const MAX_PACK_RUNS = 5; // keep the best 5 completed runs per pack (personal bests)
const MAX_CHAMPIONS = 30; // keep the most recent 30 multiplayer champion entries

export function defaultPackState() {
  // runScore/runStartedAt track the *in-progress* playthrough so a completed
  // run can be snapshotted into bestRuns (see recordPackRun) without needing
  // to touch the core round-building logic in ui.js.
  return { levelIndex: 0, stars: [], hintsBought: [], revealed: false, runScore: 0, runStartedAt: null, bestRuns: [] };
}

function defaultStreak() {
  return { current: 0, longest: 0, lastPlayedDate: null };
}

function defaultHallOfFame() {
  return { champions: [], streak: defaultStreak() };
}

export function defaultState(packIds) {
  const packs = {};
  packIds.forEach((id) => {
    packs[id] = defaultPackState();
  });
  return { coins: START_COINS, score: 0, settings: { sound: true }, packs, hallOfFame: defaultHallOfFame() };
}

export async function loadState(packIds) {
  const saved = await storage.get(STORAGE_KEY);
  const base = defaultState(packIds);
  if (!saved || typeof saved !== "object") return base;
  const savedHof = (saved && saved.hallOfFame) || {};
  const merged = {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved.settings || {}) },
    packs: {},
    hallOfFame: {
      ...base.hallOfFame,
      ...savedHof,
      streak: { ...defaultStreak(), ...(savedHof.streak || {}) },
      champions: Array.isArray(savedHof.champions) ? savedHof.champions : [],
    },
  };
  packIds.forEach((id) => {
    merged.packs[id] = {
      ...defaultPackState(),
      ...((saved.packs && saved.packs[id]) || {}),
    };
  });
  return merged;
}

export async function saveState(state) {
  await storage.set(STORAGE_KEY, state);
}

export function resetPackProgress(state, packId) {
  // Preserve the pack's personal-bests history across a progress reset —
  // "Reset pack progress" should restart the levels/stars, not erase a
  // player's past records for that pack.
  const prevBestRuns = (state.packs[packId] && state.packs[packId].bestRuns) || [];
  state.packs[packId] = { ...defaultPackState(), bestRuns: prevBestRuns };
}

/* ============================================================
   HALL OF FAME — personal bests, champions log, daily streak
============================================================ */

// Snapshot a just-completed pack playthrough into that pack's best-runs
// history (top MAX_PACK_RUNS by score, ties broken by most recent).
export function recordPackRun(packState, entry) {
  const list = Array.isArray(packState.bestRuns) ? packState.bestRuns.slice() : [];
  list.push(entry);
  list.sort((a, b) => b.score - a.score || b.date - a.date);
  packState.bestRuns = list.slice(0, MAX_PACK_RUNS);
  return packState.bestRuns;
}

// Append a multiplayer (local or online) result to the champions log —
// newest first, capped at MAX_CHAMPIONS.
export function recordChampion(state, entry) {
  const list = Array.isArray(state.hallOfFame.champions) ? state.hallOfFame.champions : [];
  state.hallOfFame.champions = [entry, ...list].slice(0, MAX_CHAMPIONS);
  return state.hallOfFame.champions;
}

// Tally the champions log into a "who's won the most" leaderboard.
export function championsLeaderboard(state) {
  const totals = new Map();
  (state.hallOfFame.champions || []).forEach((c) => {
    const row = totals.get(c.name) || { name: c.name, wins: 0, bestScore: 0 };
    row.wins += 1;
    row.bestScore = Math.max(row.bestScore, c.score);
    totals.set(c.name, row);
  });
  return [...totals.values()].sort((a, b) => b.wins - a.wins || b.bestScore - a.bestScore);
}

// Compare today's date to the last-played date and update the streak
// counter accordingly. Call once at app boot. Returns the streak object.
export function updateDailyStreak(state, now = new Date()) {
  const streak = state.hallOfFame.streak;
  const todayKey = now.toISOString().slice(0, 10);
  if (streak.lastPlayedDate === todayKey) return streak;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  streak.current = streak.lastPlayedDate === yesterdayKey ? streak.current + 1 : 1;
  streak.longest = Math.max(streak.longest || 0, streak.current);
  streak.lastPlayedDate = todayKey;
  return streak;
}

export function packSolvedCount(packState) {
  return packState.stars.filter((s) => typeof s === "number").length;
}

export function packStarTotal(packState) {
  return packState.stars.reduce((sum, s) => sum + (typeof s === "number" ? s : 0), 0);
}

export function isPackComplete(packState, playerCount) {
  return packSolvedCount(packState) >= playerCount;
}

export function totalStars(state) {
  return Object.values(state.packs).reduce((sum, p) => sum + packStarTotal(p), 0);
}

export function isPackUnlocked(state, packOrder, packsData, index) {
  if (UNLOCK_MODE === "none") return true;
  if (index === 0) return true;
  if (UNLOCK_MODE === "sequential") {
    const prevId = packOrder[index - 1];
    const prevPack = packsData[prevId];
    if (!prevPack) return true;
    return isPackComplete(state.packs[prevId], prevPack.players.length);
  }
  return totalStars(state) >= index * STARS_PER_UNLOCK;
}
