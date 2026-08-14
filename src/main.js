import { PACKS } from "./data/packs.js";
import { PACK_ORDER } from "./config.js";
import { loadState, saveState } from "./state.js";
import { init, showHome } from "./ui.js";
import * as multiplayer from "./multiplayer.js";
import * as onlineMultiplayer from "./online-multiplayer.js";
import { showScreen } from "./screens.js";

const $ = (id) => document.getElementById(id);

(async function boot() {
  const packIds = Object.keys(PACKS);
  const state = await loadState(packIds);
  const persist = () => saveState(state);

  init({ state, packs: PACKS, packOrder: PACK_ORDER, persist });
  multiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome });
  onlineMultiplayer.init({ packs: PACKS, packOrder: PACK_ORDER, onExit: showHome });

  $("multiplayerBtn").addEventListener("click", () => {
    showScreen("screenMpMode");
  });
  $("mpModeBackBtn").addEventListener("click", showHome);
  $("mpModeLocalBtn").addEventListener("click", () => multiplayer.showSetup());
  $("mpModeOnlineBtn").addEventListener("click", () => onlineMultiplayer.showLobby());

  showHome();
})();
