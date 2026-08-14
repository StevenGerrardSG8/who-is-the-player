import { PACKS } from "./data/packs.js";
import { PACK_ORDER } from "./config.js";
import { loadState, saveState } from "./state.js";
import { init, showHome } from "./ui.js";

(async function boot() {
  const packIds = Object.keys(PACKS);
  const state = await loadState(packIds);
  const persist = () => saveState(state);

  init({ state, packs: PACKS, packOrder: PACK_ORDER, persist });
  showHome();
})();
