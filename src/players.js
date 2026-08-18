import { showScreen } from "./screens.js";
import { t } from "./i18n/index.js";
import { loadPhoto } from "./photo.js";
import { resolvePlayer } from "./i18n/content/index.js";

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
  $("playersExportBtn").addEventListener("click", exportToExcel);
}

// Wikipedia article URL for a player, from the same title used to fetch
// their photo (see photo.js) — no live photo fetch here (thousands of
// players would be far too slow/rate-limited), just a link to the page.
function wikiUrl(player) {
  return "https://en.wikipedia.org/wiki/" + encodeURIComponent(player.wiki.replace(/ /g, "_"));
}

function formatCareer(career) {
  return (career || []).map(([years, club]) => years + ": " + club).join("; ");
}

// Admin-only spoiler export (gated behind the same ?admin=1 sign-in that
// reveals the "playersBtn"/"playersExportBtn" — see admin.js): every
// player, every pack, name in Hebrew + English, position, nationality,
// full career, and a Wikipedia link in place of the photo itself.
function exportToExcel() {
  const rows = allPlayers.map((player) => {
    const he = resolvePlayer(player, "he");
    const en = resolvePlayer(player, "en");
    return {
      "Name (Hebrew)": he.answer,
      "Name (English)": en.answer,
      "Position": en.pos,
      "Nationality": en.country,
      "Career": formatCareer(en.career),
      "Wikipedia": wikiUrl(player),
      "Pack": player.packName,
    };
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Players");
  XLSX.writeFile(book, "who-is-the-player-players.xlsx");
}

function showPlayers() {
  showScreen("screenPlayers");
  renderList($("playersSearchInput").value);
}

function matches(player, needle) {
  return (
    player.answer.toLowerCase().includes(needle) ||
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
