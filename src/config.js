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
  "national-team-legends",
  "ballon-dor-winners",
  "womens-football",
  "legendary-club-sides",
  "israelis-abroad",
  "retro-90s-2000s",
  "legendary-managers",
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

// No-mistakes streak bonus: +STREAK_BONUS_COINS per consecutive round solved
// with zero wrong "all slots filled" checks (escalating, capped so it
// doesn't grow unbounded), reset to 0 the moment a mistake happens or a
// round is finished via reveal.
export const STREAK_BONUS_COINS = 5;
export const STREAK_BONUS_CAP = 10; // max +50 coins (10 * 5) once streak>=10

// Timed-mode scoring (opt-in via Settings): solving within TIMED_BONUS_WINDOW_SEC
// seconds earns up to TIMED_BONUS_MAX bonus points, decaying linearly to 0.
export const TIMED_BONUS_MAX = 50;
export const TIMED_BONUS_WINDOW_SEC = 30;

export const STORAGE_KEY = "wtp-progress-v2";
export const LANG_STORAGE_KEY = "wtp-lang-v1";
