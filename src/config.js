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

// Curated home-screen groupings layered on top of PACK_ORDER above (which
// stays the full flat list — still used as-is for "all-leagues-mix"
// generation in src/data/packs.js and for the plain <select> dropdowns in
// multiplayer/online-multiplayer setup, where flat order is fine and this
// visual categorization doesn't apply). These arrays only drive how
// renderPackGrid() in ui.js buckets packs into tabs/sections on the home
// screen; a pack's *index* for unlock-mode maths (see isPackUnlocked in
// state.js) always comes from its position in PACK_ORDER itself, so nothing
// here can quietly break the "stars"/"sequential" unlock modes.
export const TOP_LEAGUE_PACKS = [
  "premier-league",
  "la-liga",
  "serie-a",
  "bundesliga",
  "ligue-1",
  "primeira-liga",
  "saudi-pro-league",
];

// The developer's home-market pack — Hebrew-native content, always shown
// right after the top leagues regardless of where it sits in PACK_ORDER.
export const HOME_LEAGUE_PACK = "israeli-league";

// Non-league "fun" packs — legends XIs, retro icons, managers, etc. Grouped
// together and clearly labelled as not being real leagues/competitions.
export const SPECIAL_PACKS = [
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
];

// Auto-generated combined pack (see buildAllLeaguesMix in packs.js) — pinned
// at the top of the default "Top Leagues" view so it stays easy to find.
export const FEATURED_PACK_ID = "all-leagues-mix";

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

// "Survival Mode" — optional, off by default (see state.js's
// defaultState().settings.survivalMode). When on, each wrong full-answer
// submission costs one life; running out ends the current pack attempt
// early instead of allowing indefinite retries.
export const SURVIVAL_LIVES = 3;

export const STORAGE_KEY = "wtp-progress-v2";
export const LANG_STORAGE_KEY = "wtp-lang-v1";
