import { PACKS } from "./data/packs.js";
import { PACK_ORDER } from "./config.js";
import { loadState, saveState, updateDailyStreak, recordChampion } from "./state.js";
import { init, showHome, showHallOfFame } from "./ui.js";
import * as multiplayer from "./multiplayer.js";
import * as onlineMultiplayer from "./online-multiplayer.js";
import { showScreen } from "./screens.js";
import { initLang, showLangPicker, hideLangPicker, hasSavedLang, applyStaticTranslations } from "./i18n/index.js";

const $ = (id) => document.getElementById(id);

(async function boot() {
  await initLang();
  applyStaticTranslations();

  const packIds = Object.keys(PACKS);
  const state = await loadState(packIds);
  const persist = () => saveState(state);

  // Compare today's date to the last-played date once per app boot and
  // update the daily-streak counter accordingly (see src/state.js).
  updateDailyStreak(state);
  persist();

  const onChampionRecorded = (entry) => {
    recordChampion(state, entry);
    persist();
  };

  init({ state, packs: PACKS, packOrder: PACK_ORDER, persist });
  multiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome, recordChampion: onChampionRecorded });
  onlineMultiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome, recordChampion: onChampionRecorded });

  $("multiplayerBtn").addEventListener("click", () => {
    showScreen("screenMpMode");
  });
  $("hallOfFameBtn").addEventListener("click", showHallOfFame);
  $("mpModeBackBtn").addEventListener("click", showHome);
  $("mpModeLocalBtn").addEventListener("click", () => multiplayer.showSetup());
  $("mpModeOnlineBtn").addEventListener("click", () => onlineMultiplayer.showLobby());
  $("mpModeLangBtn").addEventListener("click", showLangPicker);

  $("languageBtn").addEventListener("click", showLangPicker);
  $("langContinueBtn").addEventListener("click", hideLangPicker);

  showHome();

  const savedLang = await hasSavedLang();
  if (!savedLang) showLangPicker();
})();
