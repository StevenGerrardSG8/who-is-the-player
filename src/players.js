import { showScreen } from "./screens.js";
import { t } from "./i18n/index.js";
import { loadPhoto } from "./photo.js";

const $ = (id) => document.getElementById(id);

const MAX_RESULTS = 60;

let allPlayers = [];
let onExit = null;
let expandedRow = null;

export function init({ packs, onExit: exit }) {
  onExit = exit;
  allPlayers = Object.values(packs)
    .filter((pack) => pack.id !== "all-leagues-mix")
    .flatMap((pack) => pack.players.map((p) => ({ ...p, packId: pack.id, packName: pack.name })));

  $("playersBtn").addEventListener("click", showPlayers);
  $("playersBackBtn").addEventListener("click", () => (onExit ? onExit() : showPlayers()));
  $("playersSearchInput").addEventListener("input", () => renderList($("playersSearchInput").value));
}

function showPlayers() {
  showScreen("screenPlayers");
  renderList($("playersSearchInput").value);
}

function matches(player, needle) {
  return (
    player.wiki.toLowerCase().includes(needle) ||
    (player.pos || "").toLowerCase().includes(needle) ||
    (player.country || "").toLowerCase().includes(needle) ||
    player.packName.toLowerCase().includes(needle)
  );
}

function renderList(query) {
  expandedRow = null;
  const needle = query.trim().toLowerCase();
  const filtered = needle ? allPlayers.filter((p) => matches(p, needle)) : allPlayers;

  $("playersCount").textContent =
    filtered.length === allPlayers.length
      ? t("players.count", { n: allPlayers.length })
      : t("players.countFiltered", { shown: Math.min(filtered.length, MAX_RESULTS), n: filtered.length });

  const list = $("playersList");
  if (!filtered.length) {
    list.innerHTML = '<p class="hof-empty-hint">' + t("players.noResults") + "</p>";
    return;
  }

  list.innerHTML = filtered
    .slice(0, MAX_RESULTS)
    .map(
      (p, i) =>
        '<button type="button" class="league-row" data-idx="' + i + '">' +
        '<span class="league-row-name">' + escapeHtml(p.wiki) + "</span>" +
        '<span class="league-row-code">' + escapeHtml(p.pos || "") + "</span>" +
        "</button>" +
        '<div class="career" id="playerCareer' + i + '"></div>'
    )
    .join("");

  const shown = filtered.slice(0, MAX_RESULTS);
  list.querySelectorAll(".league-row").forEach((row) => {
    row.addEventListener("click", () => toggleRow(shown[Number(row.dataset.idx)], Number(row.dataset.idx)));
  });
}

function toggleRow(player, idx) {
  const panel = $("playerCareer" + idx);
  if (!panel) return;
  if (expandedRow === idx) {
    panel.classList.remove("show");
    expandedRow = null;
    return;
  }
  expandedRow = idx;
  const chips =
    '<span class="chip">' + escapeHtml(player.pos || "") + '</span><span class="chip">' + escapeHtml(player.country || "") + "</span>";
  const career = (player.career || [])
    .map((row) => '<tr><td class="years">' + escapeHtml(row[0]) + '</td><td class="club">' + escapeHtml(row[1]) + "</td></tr>")
    .join("");
  panel.innerHTML =
    '<div class="clue-chips" style="position:static;margin-bottom:10px">' + chips + "</div>" +
    '<div class="photo" id="playerPhoto' + idx + '" style="position:static;margin:0 auto 10px;max-width:160px"></div>' +
    "<h3>" + escapeHtml(player.packName) + "</h3>" +
    "<table>" + career + "</table>";
  panel.classList.add("show");
  loadPhoto(player, $("playerPhoto" + idx));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
