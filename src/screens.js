// Every top-level screen in the app. Any navigation should hide all of
// these first, then show the target one — otherwise screens reached from
// multiple entry points (e.g. Multiplayer, reachable from Home or mid-game)
// can end up stacked on top of each other.
const SCREEN_IDS = [
  "screenHome",
  "screenGame",
  "screenMpMode",
  "screenMpSetup",
  "screenMpGame",
  "screenMpOnline",
  "screenMpoGame",
];

const OVERLAY_IDS = ["overlay", "packCompleteOverlay", "mpResultsOverlay", "mpoResultsOverlay", "settingsOverlay"];

export function hideAllScreens() {
  SCREEN_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  OVERLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  });
}

export function showScreen(id) {
  hideAllScreens();
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";
}
