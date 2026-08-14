// Country names in the data files are stored as "<flag emoji> <English or
// Hebrew name>" (e.g. "🇳🇴 Norway", "🇮🇱 ישראל"). Rather than hand-translating
// ~200 country names into every language, decode the flag's two regional-
// indicator code points back to an ISO 3166-1 alpha-2 code and let the
// browser's built-in Intl.DisplayNames localize it for free — this covers
// every language the browser ships data for, with zero authored content.
const REGIONAL_INDICATOR_BASE = 0x1F1E6 - 65; // 'A' regional indicator minus 'A'

function flagToIso(flag) {
  const points = [...flag]
    .map((c) => c.codePointAt(0))
    .filter((cp) => cp >= 0x1F1E6 && cp <= 0x1F1FF);
  if (points.length !== 2) return null;
  return points.map((cp) => String.fromCharCode(cp - REGIONAL_INDICATOR_BASE)).join("");
}

// Special (non-ISO-country) flags used for UK home nations — Intl can't
// resolve these from the flag itself, so they get a tiny manual map.
const SPECIAL_NAMES = {
  "England": { en: "England", he: "אנגליה", ar: "إنجلترا", es: "Inglaterra", fr: "Angleterre", pt: "Inglaterra", de: "England", it: "Inghilterra", ru: "Англия", tr: "İngiltere", nl: "Engeland", pl: "Anglia", el: "Αγγλία", ja: "イングランド", ko: "잉글랜드", zh: "英格兰" },
  "Scotland": { en: "Scotland", he: "סקוטלנד", ar: "اسكتلندا", es: "Escocia", fr: "Écosse", pt: "Escócia", de: "Schottland", it: "Scozia", ru: "Шотландия", tr: "İskoçya", nl: "Schotland", pl: "Szkocja", el: "Σκωτία", ja: "スコットランド", ko: "스코틀랜드", zh: "苏格兰" },
  "Wales": { en: "Wales", he: "ויילס", ar: "ويلز", es: "Gales", fr: "Pays de Galles", pt: "País de Gales", de: "Wales", it: "Galles", ru: "Уэльс", tr: "Galler", nl: "Wales", pl: "Walia", el: "Ουαλία", ja: "ウェールズ", ko: "웨일스", zh: "威尔士" },
  "Northern Ireland": { en: "Northern Ireland", he: "צפון אירלנד", ar: "أيرلندا الشمالية", es: "Irlanda del Norte", fr: "Irlande du Nord", pt: "Irlanda do Norte", de: "Nordirland", it: "Irlanda del Nord", ru: "Северная Ирландия", tr: "Kuzey İrlanda", nl: "Noord-Ierland", pl: "Irlandia Północna", el: "Βόρεια Ιρλανδία", ja: "北アイルランド", ko: "북아일랜드", zh: "北爱尔兰" },
};

export function translateCountry(raw, lang) {
  const match = (raw || "").match(/^(\S+)\s+(.*)$/);
  if (!match) return raw;
  const [, flag, name] = match;

  const special = SPECIAL_NAMES[name.trim()];
  if (special) return flag + " " + (special[lang] || special.en);

  const iso = flagToIso(flag);
  if (!iso) return raw;
  try {
    const localized = new Intl.DisplayNames([lang], { type: "region" }).of(iso);
    if (localized) return flag + " " + localized;
  } catch (e) {
    // Unsupported locale for Intl.DisplayNames — fall back to stored text.
  }
  return raw;
}
