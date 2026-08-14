import { storage } from "./storage.js";
import { STORAGE_KEY, START_COINS, UNLOCK_MODE, STARS_PER_UNLOCK } from "./config.js";

export function defaultPackState() {
  return { levelIndex: 0, stars: [], hintsBought: [], revealed: false };
}

export function defaultState(packIds) {
  const packs = {};
  packIds.forEach((id) => {
    packs[id] = defaultPackState();
  });
  return { coins: START_COINS, score: 0, settings: { sound: true }, packs };
}

export async function loadState(packIds) {
  const saved = await storage.get(STORAGE_KEY);
  const base = defaultState(packIds);
  if (!saved || typeof saved !== "object") return base;
  const merged = {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved.settings || {}) },
    packs: {},
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
  state.packs[packId] = defaultPackState();
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
