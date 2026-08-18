// User-facing pack names that avoid unnecessary reliance on league/award marks.
// Internal pack IDs remain unchanged so saved progress and multiplayer stay compatible.

const NEUTRAL_PACK_NAMES = Object.freeze({
  "premier-league": "England",
  "la-liga": "Spain",
  "serie-a": "Italy",
  bundesliga: "Germany",
  "ligue-1": "France",
  "primeira-liga": "Portugal",
  eredivisie: "Netherlands",
  "super-lig": "Türkiye",
  "saudi-pro-league": "Saudi Arabia",
  mls: "USA & Canada",
  brasileirao: "Brazil",
  "argentina-liga": "Argentina",
  "qatar-stars-league": "Qatar",
  "scottish-premiership": "Scotland",
  "chinese-super-league": "China",
  "greek-super-league": "Greece",
  "russian-premier-league": "Russia",
  "austrian-bundesliga": "Austria",
  "liga-mx": "Mexico",
  "indian-super-league": "India",
  "ukrainian-premier-league": "Ukraine",
  "j1-league": "Japan",
  "a-league": "Australia",
  "uruguayan-liga": "Uruguay",
  "serbian-superliga": "Serbia",
  "belgian-pro-league": "Belgium",
  "croatian-hnl": "Croatia",
  "colombian-liga": "Colombia",
  "israeli-league": "Israel",
  "ballon-dor-winners": "World Award Winners",
});

export function getPublicPackName(pack) {
  if (!pack) return "";
  return NEUTRAL_PACK_NAMES[pack.id] || pack.name;
}

export { NEUTRAL_PACK_NAMES };
