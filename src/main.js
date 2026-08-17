import { PACKS } from "./data/packs.js";
import { PACK_ORDER } from "./config.js";
import { loadState, saveState, updateDailyStreak, recordChampion } from "./state.js";
import { init, showHome, toast } from "./ui.js";
import * as multiplayer from "./multiplayer.js";
import * as onlineMultiplayer from "./online-multiplayer.js";
import * as leagues from "./leagues.js";
import { showScreen } from "./screens.js";
import { initLang, showLangPicker, hideLangPicker, hasSavedLang, applyStaticTranslations, t } from "./i18n/index.js";
import { initBackend, syncDayStreak, submitBugReport } from "./backend.js";
import { initAdminScreen } from "./admin.js";

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

  // Anonymous per-device identity for the optional global leaderboards
  // (src/backend.js) — fully non-blocking, the game works offline either way.
  initBackend().then(() => syncDayStreak(state.hallOfFame.streak));

  const onChampionRecorded = (entry) => {
    recordChampion(state, entry);
    persist();
  };

  init({ state, packs: PACKS, packOrder: PACK_ORDER, persist });
  multiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome, recordChampion: onChampionRecorded });
  onlineMultiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome, recordChampion: onChampionRecorded });
  leagues.init({ onExit: showHome });

  $("multiplayerBtn").addEventListener("click", () => {
    showScreen("screenMpMode");
  });
  $("mpModeBackBtn").addEventListener("click", showHome);
  $("mpModeLocalBtn").addEventListener("click", () => multiplayer.showSetup());
  $("mpModeOnlineBtn").addEventListener("click", () => onlineMultiplayer.showLobby());
  $("mpModeLangBtn").addEventListener("click", showLangPicker);

  $("languageBtn").addEventListener("click", showLangPicker);
  $("langContinueBtn").addEventListener("click", hideLangPicker);

  $("bugReportBtn").addEventListener("click", () => {
    $("bugReportText").value = "";
    $("bugReportStatus").textContent = "";
    $("bugReportStatus").classList.remove("ok");
    $("bugReportOverlay").classList.add("show");
  });
  $("bugReportCancelBtn").addEventListener("click", () => {
    $("bugReportOverlay").classList.remove("show");
  });
  $("bugReportSubmitBtn").addEventListener("click", async () => {
    const text = $("bugReportText").value.trim();
    const status = $("bugReportStatus");
    if (!text) {
      status.textContent = t("bug.empty");
      status.classList.remove("ok");
      return;
    }
    status.textContent = t("bug.sending");
    status.classList.remove("ok");
    $("bugReportSubmitBtn").disabled = true;
    const ok = await submitBugReport(text);
    $("bugReportSubmitBtn").disabled = false;
    if (ok) {
      $("bugReportOverlay").classList.remove("show");
      toast(t("bug.sent"));
    } else {
      status.textContent = t("bug.failed");
    }
  });

  showHome();

  const savedLang = await hasSavedLang();
  if (!savedLang) showLangPicker();

  // Private developer view — only reachable by knowing the exact URL, and
  // even then Firestore itself refuses to serve the data unless the visitor
  // signs in as the developer's own account (see firestore.rules).
  if (new URLSearchParams(location.search).get("admin")) initAdminScreen();
})();
