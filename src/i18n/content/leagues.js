// Per-language display names for packs/leagues, keyed by pack id. A pack
// missing from a language's map just falls back to its stored English (or,
// for israeli-league, already-Hebrew) `name` field — same safe-fallback
// pattern as clubs/positions/country.
const HE = {
  "premier-league": "פרימייר ליג",
  "la-liga": "לה ליגה",
  "serie-a": "סרייה א",
  "bundesliga": "בונדסליגה",
  "ligue-1": "ליגה 1",
  "primeira-liga": "פרימיירה ליגה",
  "eredivisie": "אירדיוויזי",
  "super-lig": "סופר ליג",
  "saudi-pro-league": "הליגה הסעודית",
  "mls": "ה-MLS",
  "brasileirao": "ברסיליירו",
  "argentina-liga": "הליגה הארגנטינאית",
  "qatar-stars-league": "ליגת הכוכבים הקטארית",
  "scottish-premiership": "הפרמיירליג הסקוטית",
  "chinese-super-league": "הליגה העל הסינית",
  "greek-super-league": "הסופר ליג היוונית",
  "russian-premier-league": "הפרמיירליג הרוסית",
  "austrian-bundesliga": "הבונדסליגה האוסטרית",
  "liga-mx": "ליגה MX",
  "indian-super-league": "הליגה העל ההודית",
  "ukrainian-premier-league": "הפרמיירליג האוקראינית",
  "j1-league": "ליגת J1",
  "a-league": "ליגת A",
  "uruguayan-liga": "הליגה האורוגוואית",
  "serbian-superliga": "הסופרליגה הסרבית",
  "belgian-pro-league": "הליגה הבלגית",
  "croatian-hnl": "ה-HNL הקרואטית",
  "colombian-liga": "הליגה הקולומביאנית",
  "world-legends": "אגדות העולם",
  "streets-never-forget": "הרחוב לא שוכח",
  "mixed-world-xi": "נבחרת עולמית מעורבת",
  "national-team-legends": "אגדות נבחרות",
  "ballon-dor-winners": "זוכי הכדור הזהב",
  "womens-football": "כוכבות הכדורגל הנשי",
  "legendary-club-sides": "קבוצות אגדיות",
  "israelis-abroad": "ישראלים בחו״ל",
  "retro-90s-2000s": "אייקוני שנות ה-90 וה-2000",
  "legendary-managers": "מאמנים אגדיים",
  "all-leagues-mix": "כל הליגות מעורבב",
};

const LEAGUE_NAMES = { he: HE };

export function translatePackName(pack, lang) {
  const map = LEAGUE_NAMES[lang];
  return (map && map[pack.id]) || pack.name;
}
