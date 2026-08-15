import en from "./en.js";
import he from "./he.js";
import ar from "./ar.js";
import es from "./es.js";
import fr from "./fr.js";
import pt from "./pt.js";
import de from "./de.js";
import it from "./it.js";
import ru from "./ru.js";
import tr from "./tr.js";
import nl from "./nl.js";
import pl from "./pl.js";
import el from "./el.js";
import ja from "./ja.js";
import ko from "./ko.js";
import zh from "./zh.js";
import { storage } from "../storage.js";
import { LANG_STORAGE_KEY } from "../config.js";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧", rtl: false },
  { code: "he", label: "עברית", flag: "🇮🇱", rtl: true },
  { code: "ar", label: "العربية", flag: "🇸🇦", rtl: true },
  { code: "es", label: "Español", flag: "🇪🇸", rtl: false },
  { code: "fr", label: "Français", flag: "🇫🇷", rtl: false },
  { code: "pt", label: "Português", flag: "🇧🇷", rtl: false },
  { code: "de", label: "Deutsch", flag: "🇩🇪", rtl: false },
  { code: "it", label: "Italiano", flag: "🇮🇹", rtl: false },
  { code: "ru", label: "Русский", flag: "🇷🇺", rtl: false },
  { code: "tr", label: "Türkçe", flag: "🇹🇷", rtl: false },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", rtl: false },
  { code: "pl", label: "Polski", flag: "🇵🇱", rtl: false },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷", rtl: false },
  { code: "ja", label: "日本語", flag: "🇯🇵", rtl: false },
  { code: "ko", label: "한국어", flag: "🇰🇷", rtl: false },
  { code: "zh", label: "中文", flag: "🇨🇳", rtl: false },
];

const DICTS = { en, he, ar, es, fr, pt, de, it, ru, tr, nl, pl, el, ja, ko, zh };

let currentLang = "en";
let listeners = [];

export function isRtl(code = currentLang) {
  const lang = LANGUAGES.find((l) => l.code === code);
  return !!(lang && lang.rtl);
}

export function getLang() {
  return currentLang;
}

export function t(key, vars) {
  const dict = DICTS[currentLang] || DICTS.en;
  let str = dict[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.replace("{" + k + "}", vars[k]);
    });
  }
  return str;
}

export function onLangChange(fn) {
  listeners.push(fn);
}

function applyDocumentDirection() {
  document.documentElement.dir = isRtl() ? "rtl" : "ltr";
  document.documentElement.lang = currentLang;
}

export async function setLang(code) {
  if (!DICTS[code]) code = "en";
  currentLang = code;
  applyDocumentDirection();
  await storage.set(LANG_STORAGE_KEY, code);
  listeners.forEach((fn) => fn(code));
}

export async function initLang() {
  const saved = await storage.get(LANG_STORAGE_KEY);
  if (saved && DICTS[saved]) {
    currentLang = saved;
  }
  applyDocumentDirection();
  return currentLang;
}

export function hasSavedLang() {
  return storage.get(LANG_STORAGE_KEY);
}

const $ = (id) => document.getElementById(id);

// Simple element-id -> translation-key map for every static (non-dynamic)
// piece of chrome in index.html. Dynamic strings (turn banners, toasts,
// rewards text, etc.) are translated inline where they're generated.
const STATIC_MAP = {
  homeSubtitle: "home.subtitle",
  homeCoinsLabel: "home.coins",
  homeStarsLabel: "home.totalStars",
  multiplayerBtn: "home.multiplayer",
  settingsBtn: "home.settings",

  mpModeBackLabel: "game.back",
  mpModeCrumb: "home.multiplayer",
  mpModeTitle1: "mpMode.title.party",
  mpModeTitle2: "mpMode.title.mode",
  mpModeSubtitle: "mpMode.subtitle",
  mpModeLocalTitle: "mpMode.local.title",
  mpModeLocalDesc: "mpMode.local.desc",
  mpModeOnlineTitle: "mpMode.online.title",
  mpModeOnlineDesc: "mpMode.online.desc",

  mpOnlineBackLabel: "game.back",
  onlineTitle1: "online.title.play",
  onlineTitle2: "online.title.online",
  onlineSubtitle: "online.subtitle",
  mpHostBtn: "online.hostRoom",
  mpJoinToggleBtn: "online.joinWithCode",
  mpJoinBtn: "online.join",
  onlineRoomLabel: "online.title.online",
  onlinePackLabel: "mp.pack",
  onlineRoundsLabel: "mp.roundsPerPlayer",
  mpOnlineStartBtn: "mp.start",
  mpoQuitLabel: "game.quit",
  mpoSkipBtn: "mp.skip",
  mpoGameOverTitle: "mp.gameOver",
  mpoPlayAgainBtn: "mp.backToHome",

  mpBackLabel: "game.back",
  mpSetupCrumb: "home.multiplayer",
  mpSetupTitle1: "mpMode.title.party",
  mpSetupTitle2: "mpMode.title.mode",
  mpSetupSubtitle: "mp.subtitle",
  mpAddPlayerBtn: "mp.addPlayer",
  mpPackLabel: "mp.pack",
  mpRoundsLabel: "mp.roundsPerPlayer",
  mpStartBtn: "mp.start",
  mpQuitLabel: "game.quit",
  mpSkipBtn: "mp.skip",
  mpGameOverTitle: "mp.gameOver",
  mpPlayAgainBtn: "mp.backToHome",

  backBtnLabel: "game.back",
  sbLevelLabel: "game.level",
  sbScoreLabel: "game.score",
  sbCoinsLabel: "game.coins",
  sbLivesLabel: "game.lives",
  hint1Label: "hint.position",
  hint2Label: "hint.career",
  hint3Label: "hint.reveal",
  careerTitle: "career.title",
  resetBtn: "game.resetProgress",
  packCompleteTitle: "packComplete.title",
  pcHomeBtn: "packComplete.backToPacks",

  settingsTitle: "settings.title",
  survivalModeLabel: "settings.survivalMode",
  survivalModeDesc: "settings.survivalModeDesc",
  survivalHintNote: "settings.survivalHintNote",
  settingsCloseBtn: "settings.close",

  survivalOutTitle: "survival.outTitle",
  survivalRetryBtn: "survival.retryPack",
  survivalHomeBtn: "survival.backHome",

  langPickTitle: "lang.pickTitle",
  langPickSubtitle: "lang.pickSubtitle",
  langContinueBtn: "lang.continue",
};

export function applyStaticTranslations() {
  Object.entries(STATIC_MAP).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.textContent = t(key);
  });
  const homeTitle = $("homeTitle");
  if (homeTitle) homeTitle.innerHTML = t("app.title.who") + " <span>" + t("app.title.player") + "</span>";
  document.querySelectorAll(".back-arrow").forEach((el) => {
    el.textContent = isRtl() ? "→" : "←";
  });
  renderLangGrid();
}

function renderLangGrid() {
  const grid = $("langGrid");
  if (!grid) return;
  grid.innerHTML = "";
  LANGUAGES.forEach((lang) => {
    const card = document.createElement("div");
    card.className = "lang-card" + (lang.code === currentLang ? " selected" : "");
    card.innerHTML = '<span class="flag">' + lang.flag + "</span>" + lang.label;
    card.addEventListener("click", async () => {
      await setLang(lang.code);
    });
    grid.appendChild(card);
  });
}

export function showLangPicker() {
  renderLangGrid();
  $("langPickerOverlay").classList.add("show");
}

export function hideLangPicker() {
  $("langPickerOverlay").classList.remove("show");
}

onLangChange(applyStaticTranslations);
