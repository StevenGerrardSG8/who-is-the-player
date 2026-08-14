// Collapses the many specific position strings used across league data files
// (e.g. "Centre-back", "Wing-back", "מגן") into 5 broad roles, then looks up
// a per-language label for that role. This never touches the data files —
// the raw pos string stays as-is; only the *displayed* hint chip is translated.
const CANON = {
  "Goalkeeper": "GK", "שוער": "GK",

  "Defender": "DF", "מגן": "DF",
  "Centre-back": "DF", "Left-back": "DF", "Right-back": "DF", "Wing-back": "DF",

  "Midfielder": "MF", "קשר": "MF",
  "Attacking Midfielder": "MF", "Defensive Midfielder": "MF",

  "Winger": "WG", "כנף": "WG",
  "Left Winger": "WG", "Inside Forward": "WG",

  "Forward": "FW", "חלוץ": "FW", "Striker": "FW",
};

const LABELS = {
  GK: { en: "Goalkeeper", he: "שוער", ar: "حارس مرمى", es: "Portero", fr: "Gardien", pt: "Goleiro", de: "Torwart", it: "Portiere", ru: "Вратарь", tr: "Kaleci", nl: "Doelman", pl: "Bramkarz", el: "Τερματοφύλακας", ja: "ゴールキーパー", ko: "골키퍼", zh: "守门员" },
  DF: { en: "Defender", he: "מגן", ar: "مدافع", es: "Defensa", fr: "Défenseur", pt: "Defensor", de: "Verteidiger", it: "Difensore", ru: "Защитник", tr: "Defans", nl: "Verdediger", pl: "Obrońca", el: "Αμυντικός", ja: "ディフェンダー", ko: "수비수", zh: "后卫" },
  MF: { en: "Midfielder", he: "קשר", ar: "لاعب وسط", es: "Centrocampista", fr: "Milieu", pt: "Meio-campista", de: "Mittelfeldspieler", it: "Centrocampista", ru: "Полузащитник", tr: "Orta Saha", nl: "Middenvelder", pl: "Pomocnik", el: "Μέσος", ja: "ミッドフィルダー", ko: "미드필더", zh: "中场" },
  WG: { en: "Winger", he: "כנף", ar: "جناح", es: "Extremo", fr: "Ailier", pt: "Ponta", de: "Flügelspieler", it: "Ala", ru: "Вингер", tr: "Kanat", nl: "Vleugelspeler", pl: "Skrzydłowy", el: "Εξτρέμ", ja: "ウイング", ko: "윙어", zh: "边锋" },
  FW: { en: "Forward", he: "חלוץ", ar: "مهاجم", es: "Delantero", fr: "Attaquant", pt: "Atacante", de: "Stürmer", it: "Attaccante", ru: "Нападающий", tr: "Forvet", nl: "Aanvaller", pl: "Napastnik", el: "Επιθετικός", ja: "フォワード", ko: "공격수", zh: "前锋" },
};

export function translatePosition(rawPos, lang) {
  const code = CANON[(rawPos || "").trim()];
  if (!code) return rawPos;
  const row = LABELS[code];
  return (row && (row[lang] || row.en)) || rawPos;
}
