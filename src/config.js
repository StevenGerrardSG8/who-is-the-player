// Order packs appear in on the home screen and for "sequential" unlock checks.
export const PACK_ORDER = [
  "premier-league",
  "la-liga",
  "serie-a",
  "bundesliga",
  "ligue-1",
  "primeira-liga",
  "eredivisie",
  "super-lig",
  "saudi-pro-league",
  "mls",
  "brasileirao",
  "argentina-liga",
  "qatar-stars-league",
  "scottish-premiership",
  "chinese-super-league",
  "greek-super-league",
  "russian-premier-league",
  "austrian-bundesliga",
  "liga-mx",
  "indian-super-league",
  "ukrainian-premier-league",
  "j1-league",
  "a-league",
  "uruguayan-liga",
  "serbian-superliga",
  "belgian-pro-league",
  "croatian-hnl",
  "colombian-liga",
  "israeli-league",
  "world-legends",
  "streets-never-forget",
  "mixed-world-xi",
  "all-leagues-mix",
];

// "none"       — every pack is unlocked from the start, playable in any order
// "stars"      — pack at index i unlocks once total stars earned >= i * STARS_PER_UNLOCK
// "sequential" — pack at index i unlocks once pack i-1 is fully completed
export const UNLOCK_MODE = "none";
export const STARS_PER_UNLOCK = 30;

export const START_COINS = 100;
export const HINT_COSTS = { 1: 15, 2: 30, 3: 60 };
export const BASE_POINTS = 100;
export const HINT_PENALTY = 25;
export const SOLVE_COINS = 25;
export const REVEAL_COINS = 5;
export const NO_HINT_BONUS = 50;

export const STORAGE_KEY = "wtp-progress-v2";
