// Private developer-only view: games-played / unique-visitor counters and
// the bug-report inbox. Not reachable from any in-app UI — only loads when
// the page is opened with ?admin=1, and even then Firestore itself refuses
// to serve stats/summary or list bugReports unless the visitor signs in as
// the developer's own account (see firestore.rules). This is real security,
// not just a hidden URL: a stranger who finds the query param still can't
// read anything without that exact account's password.
import { adminSignIn, fetchAdminStats, fetchBugReports } from "./backend.js";

const $ = (id) => document.getElementById(id);

function fmtDate(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleString();
}

async function loadAdminData() {
  const [stats, reports] = await Promise.all([fetchAdminStats(), fetchBugReports()]);
  $("adminGamesPlayed").textContent = stats.gamesPlayed || 0;
  $("adminUniqueVisitors").textContent = stats.uniqueVisitors || 0;
  $("adminBugReportsList").innerHTML = reports.length
    ? reports
        .map(
          (r) =>
            '<div class="admin-report-row">' +
            '<div class="admin-report-meta">' + fmtDate(r.createdAt) + (r.name ? " · " + escapeHtml(r.name) : "") + "</div>" +
            '<div class="admin-report-text">' + escapeHtml(r.text) + "</div>" +
            "</div>"
        )
        .join("")
    : '<div class="admin-report-empty">No bug reports yet.</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initAdminScreen() {
  $("adminOverlay").classList.add("show");

  $("adminLoginBtn").addEventListener("click", async () => {
    const email = $("adminEmailInput").value.trim();
    const password = $("adminPasswordInput").value;
    const errorEl = $("adminLoginError");
    errorEl.textContent = "";
    if (!email || !password) {
      errorEl.textContent = "Enter your email and password.";
      return;
    }
    $("adminLoginBtn").disabled = true;
    try {
      await adminSignIn(email, password);
      await loadAdminData();
      $("adminLoginForm").style.display = "none";
      $("adminStatsPanel").style.display = "";
    } catch (e) {
      errorEl.textContent = "Sign-in failed — wrong email/password, or Firestore rejected the read.";
    }
    $("adminLoginBtn").disabled = false;
  });
}
