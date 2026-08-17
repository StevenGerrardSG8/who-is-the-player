import { showScreen } from "./screens.js";
import { t } from "./i18n/index.js";
import { toast } from "./ui.js";
import { getGlobalName, getMyLeagues, createLeague, joinLeague, leaveLeague, fetchLeagueStandings } from "./backend.js";

const $ = (id) => document.getElementById(id);

let onExit = null;
let currentCode = null;

export function init({ onExit: exit }) {
  onExit = exit;

  $("leaguesBtn").addEventListener("click", showLeagues);
  $("leaguesBackBtn").addEventListener("click", () => (onExit ? onExit() : showLeagues()));
  $("leagueCreateBtn").addEventListener("click", handleCreate);
  $("leagueJoinBtn").addEventListener("click", handleJoin);

  $("leagueDetailBackBtn").addEventListener("click", showLeagues);
  $("leagueLeaveBtn").addEventListener("click", handleLeave);
}

async function showLeagues() {
  showScreen("screenLeagues");
  const hasName = !!getGlobalName();
  $("leaguesNameGate").style.display = hasName ? "none" : "";
  $("leaguesMineCard").style.display = hasName ? "" : "none";
  $("leagueCreateNameInput").disabled = !hasName;
  $("leagueCreateBtn").disabled = !hasName;
  $("leagueJoinCodeInput").disabled = !hasName;
  $("leagueJoinBtn").disabled = !hasName;
  if (!hasName) return;

  const mine = await getMyLeagues();
  const list = $("leaguesMineList");
  list.innerHTML = "";
  if (!mine.length) {
    list.innerHTML = '<p class="hof-empty-hint">' + t("leagues.noneYet") + "</p>";
    return;
  }
  mine.forEach(({ code, name }) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "league-row";
    row.innerHTML =
      '<span class="league-row-name">' + escapeHtml(name) + "</span>" +
      '<span class="league-row-code">' + escapeHtml(code) + "</span>";
    row.addEventListener("click", () => showDetail(code, name));
    list.appendChild(row);
  });
}

async function handleCreate() {
  const input = $("leagueCreateNameInput");
  const name = input.value.trim();
  if (!name) return;
  $("leagueCreateBtn").disabled = true;
  const result = await createLeague(name);
  $("leagueCreateBtn").disabled = false;
  if (!result) {
    toast(t("leagues.createFailed"));
    return;
  }
  input.value = "";
  showDetail(result.code, result.name);
}

async function handleJoin() {
  const input = $("leagueJoinCodeInput");
  const code = input.value.trim();
  const errEl = $("leagueJoinError");
  errEl.textContent = "";
  if (!code) return;
  $("leagueJoinBtn").disabled = true;
  const result = await joinLeague(code);
  $("leagueJoinBtn").disabled = false;
  if (result === "not_found") {
    errEl.textContent = t("leagues.codeNotFound");
    return;
  }
  if (!result) {
    errEl.textContent = t("leagues.joinFailed");
    return;
  }
  input.value = "";
  showDetail(result.code, result.name);
}

async function showDetail(code, name) {
  currentCode = code;
  showScreen("screenLeagueDetail");
  $("leagueDetailName").textContent = name;
  $("leagueDetailCode").textContent = code;
  const list = $("leagueStandingsList");
  list.innerHTML = '<p class="hof-empty-hint">' + t("leagues.loading") + "</p>";

  const standings = await fetchLeagueStandings(code);
  if (currentCode !== code) return; // navigated away while loading
  if (!standings.length) {
    list.innerHTML = '<p class="hof-empty-hint">' + t("leagues.noneYet") + "</p>";
    return;
  }
  list.innerHTML = standings
    .map(
      (row, i) =>
        '<div class="league-standing-row">' +
        '<span class="league-standing-rank">#' + (i + 1) + "</span>" +
        '<span class="league-standing-name">' + escapeHtml(row.name || "?") + "</span>" +
        '<span class="league-standing-score">' + (row.totalScore || 0) + " " + t("game.pts") + "</span>" +
        "</div>"
    )
    .join("");
}

async function handleLeave() {
  if (!currentCode) return;
  await leaveLeague(currentCode);
  toast(t("leagues.left"));
  showLeagues();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
