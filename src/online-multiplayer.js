// Real cross-device multiplayer for up to 99 players, using PeerJS (WebRTC
// data channel, free public signaling broker — no account/server needed).
// The host generates a short room code; guests connect to it. There's no
// server-side relay, so the host itself acts as the hub: every guest holds
// a single connection to the host, and the host fans lobby/game messages
// out to everyone else (see broadcast/hostConns). All players race the
// same target each round; the host is the sole authority on who answered
// first (see reportAttempt/resolveRound).
import { buildBankLetters, checkAnswer, renderAnswerLayout, applyPerLetterLockFeedback } from "./game.js";
import { loadPhoto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, showLangPicker, onLangChange } from "./i18n/index.js";
import { translatePackName } from "./i18n/content/leagues.js";
import { resolvePlayer } from "./i18n/content/index.js";
import { toast } from "./ui.js";
import { recordRun, recordMatchResult, bumpGamesPlayedCounter } from "./backend.js";

const $ = (id) => document.getElementById(id);
const MP_POINTS = 100;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

let packs = null;
let packOrder = null;
let onExit = null;
let recordChampion = null;

// Default PeerJS/WebRTC setup only offers STUN, which negotiates a direct
// P2P path — fine when both players are behind the same/simple NAT (e.g.
// same wifi), but it silently fails once they're on different networks
// with stricter NATs (mobile data, different home routers, etc.), since
// there's no relay to fall back to. Adding a TURN server (Open Relay
// Project's free, keyless public TURN service) gives WebRTC a relay path
// so the connection also works across arbitrary networks, not just LAN.
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

const MAX_TOTAL_PLAYERS = 99;
const TURN_MS = 20000; // per-turn time limit in "turns" mode

let peer = null;
let conn = null; // guest's single connection to the host
let hostConns = []; // host only: [{idx, conn, name}], one per connected guest
let myName = "";
let peerName = ""; // guest-only: the host's name, for status/disconnect text
let myPlayerIdx = 0; // 0 = host, 1..N = guest, assigned by the host at join time
let lobbyRoster = []; // [{idx, name}], idx 0 is always the host

let game = null; // {players:[{name,score}], deck:[player,...], roundIndex, rounds}
let tiles = [];
let slots = [];
let locked = false;
let roundDecided = false;
let skippedIdxs = new Set();
let skippedNames = []; // names announced as skipped this round, in order
let winnerFlashIdx = null; // briefly highlights the round's winning chip
let resolved = null; // current round's player, resolved for the active UI language
let wrongFreeTimer = null; // pending timeout that frees wrong-position letters back to the bank

// "turns" mode only: players answer one at a time, in join order.
let turnOrder = []; // this round's rotation, e.g. [0,1,2] — fixed join order
let activeIdx = null; // idx whose turn it currently is, or null before it's assigned
let turnDeadline = null; // ms epoch when the active player's turn expires
let hostTurnTimeoutHandle = null; // host-only: fallback that force-passes a stalled turn
let turnCountdownHandle = null; // UI tick for the progress bar, runs on every client
let lastPackChoiceId = null; // guest-only: last pack the host broadcast, for re-render on lang change

// Tracks the last lobby-status message shown so it can be re-translated in
// place if the user opens the language picker while still in the lobby.
let lastStatusKey = null;
let lastStatusVars = null;
function setLobbyStatus(key, vars) {
  lastStatusKey = key;
  lastStatusVars = vars;
  $("mpLobbyStatus").textContent = t(key, vars);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function genRoomCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return s;
}

function shuffleIdx(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeckIndices(poolSize, count) {
  const idxs = [];
  let pool = shuffleIdx(poolSize);
  while (idxs.length < count) {
    if (pool.length === 0) pool = shuffleIdx(poolSize);
    idxs.push(pool.pop());
  }
  return idxs;
}

/* ============================================================
   LOBBY
============================================================ */
function resetLobbyUI() {
  $("mpOnlineChoice").style.display = "";
  $("mpOnlineLobby").style.display = "none";
  $("mpOnlineError").textContent = "";
  $("mpJoinRow").style.display = "none";
  $("mpOnlineConfig").style.display = "none";
  $("mpOnlineStartBtn").style.display = "none";
  $("mpLobbyStatus").classList.remove("waiting");
  $("mpOnlineRoster").innerHTML = "";
  $("mpLobbyPackChoice").style.display = "none";
  lastStatusKey = null;
  lastStatusVars = null;
  hostConns = [];
  lobbyRoster = [];
  lastPackChoiceId = null;
}

function renderRoster() {
  $("mpOnlineRoster").innerHTML = lobbyRoster
    .map((p) => '<span class="roster-chip' + (p.idx === 0 ? " is-host" : "") + '">' + escapeHtml(p.name) + "</span>")
    .join("");
}

function renderPackChoice() {
  const el = $("mpLobbyPackChoice");
  const pack = lastPackChoiceId && packs[lastPackChoiceId];
  if (!pack) {
    el.style.display = "none";
    return;
  }
  el.textContent = t("online.packChosen", { pack: pack.icon + " " + translatePackName(pack, getLang()) });
  el.style.display = "";
}

// Host-only: relay a message to every connected guest (optionally skipping
// one — e.g. not echoing a player's own skip back to themself).
function broadcast(msg, exceptIdx) {
  hostConns.forEach(({ idx, conn: c }) => {
    if (idx === exceptIdx) return;
    try {
      c.send(msg);
    } catch (e) {}
  });
}

function populatePackSelect() {
  const select = $("mpOnlinePackSelect");
  const prevValue = select.value;
  select.innerHTML = "";
  packOrder.forEach((packId) => {
    const pack = packs[packId];
    if (!pack) return;
    const opt = document.createElement("option");
    opt.value = packId;
    opt.textContent = pack.icon + " " + translatePackName(pack, getLang());
    select.appendChild(opt);
  });
  if (prevValue) select.value = prevValue;
}

export function showLobby() {
  showScreen("screenMpOnline");
  resetLobbyUI();
  populatePackSelect();
}

function hostRoom() {
  myName = $("mpOnlineNameInput").value.trim() || t("online.defaultHostName");
  myPlayerIdx = 0;
  lobbyRoster = [{ idx: 0, name: myName }];
  hostConns = [];
  attemptHost(0);
}

function attemptHost(tries) {
  if (tries >= 6) {
    $("mpOnlineError").textContent = t("online.couldntCreate");
    return;
  }
  const code = genRoomCode();
  const p = new Peer("wtp-" + code, { config: ICE_CONFIG });
  p.on("open", () => {
    peer = p;
    $("mpOnlineChoice").style.display = "none";
    $("mpOnlineLobby").style.display = "";
    $("mpRoomCode").textContent = code;
    setLobbyStatus("online.waitingShare", { code });
    $("mpLobbyStatus").classList.add("waiting");
  });
  p.on("error", (err) => {
    if (err.type === "unavailable-id") {
      p.destroy();
      attemptHost(tries + 1);
    } else {
      $("mpOnlineError").textContent = t("online.connectionError", { err: err.type });
    }
  });
  p.on("connection", (c) => {
    if (hostConns.length + 1 >= MAX_TOTAL_PLAYERS) {
      try {
        c.close();
      } catch (e) {}
      return;
    }
    wireHostConnection(c, hostConns.length + 1);
  });
}

// If the peer ID doesn't exist, PeerJS's broker replies with a
// "peer-unavailable" error almost instantly (handled by p.on("error")
// below). But if the ID exists and the WebRTC handshake itself stalls —
// e.g. both STUN and the TURN relay fail or time out — neither "open" nor
// "error" ever fires, and the guest is stuck on "connecting…" forever with
// no feedback. Give the handshake a deadline so that case surfaces a real,
// actionable error instead of hanging silently.
const CONNECT_TIMEOUT_MS = 15000;

function joinRoom() {
  myName = $("mpOnlineNameInput").value.trim() || t("online.defaultGuestName");
  const code = $("mpJoinCodeInput").value.trim().toUpperCase();
  if (!code) {
    $("mpOnlineError").textContent = t("online.enterCode");
    return;
  }
  myPlayerIdx = -1; // assigned by the host once "welcome" arrives
  const p = new Peer({ config: ICE_CONFIG });
  let settled = false;
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    p.destroy();
    $("mpOnlineError").textContent = t("online.connectTimeout");
  }, CONNECT_TIMEOUT_MS);
  p.on("open", () => {
    peer = p;
    conn = p.connect("wtp-" + code, { reliable: true });
    wireConnection();
    conn.on("open", () => {
      if (settled) return; // timed out just before the handshake landed
      settled = true;
      clearTimeout(timeoutId);
      conn.send({ type: "hello", name: myName });
      $("mpOnlineChoice").style.display = "none";
      $("mpOnlineLobby").style.display = "";
      $("mpRoomCode").textContent = code;
      setLobbyStatus("online.connectedWaiting");
      $("mpLobbyStatus").classList.add("waiting");
    });
  });
  p.on("error", (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    $("mpOnlineError").textContent = t("online.couldntConnect", { err: err.type });
  });
}

// Guest side: a single connection to the host.
function wireConnection() {
  disconnectHandled = false;
  conn.on("data", handleGuestMessage);
  conn.on("close", handleUnexpectedDisconnect);
  conn.on("error", handleUnexpectedDisconnect);
  conn.on("open", () => {
    // PeerJS's "close" event only fires on a *graceful* shutdown (the other
    // side calling conn.close()). If the opponent's tab is closed, their
    // app is backgrounded (common on mobile), or the network just drops,
    // the WebRTC connection dies silently and neither "close" nor "error"
    // ever fires, leaving this side stuck on the game screen forever with
    // no way home. Watch the underlying RTCPeerConnection's ICE state too,
    // so an abrupt disappearance is treated the same as a graceful one.
    const pc = conn.peerConnection;
    if (pc) {
      pc.addEventListener("iceconnectionstatechange", () => {
        if (["disconnected", "failed", "closed"].includes(pc.iceConnectionState)) {
          handleUnexpectedDisconnect();
        }
      });
    }
  });
}

let disconnectHandled = false;
function handleUnexpectedDisconnect() {
  if (disconnectHandled) return;
  disconnectHandled = true;
  if (game) {
    toast(t("online.opponentDisconnected", { name: peerName || t("online.opponentFallback") }));
    quitToHome();
  }
}

// Guest side: everything arriving from the host (lobby + in-game).
function handleGuestMessage(msg) {
  if (msg.type === "welcome") {
    myPlayerIdx = msg.idx;
    peerName = msg.name;
    lobbyRoster = msg.roster;
    lastPackChoiceId = msg.packId;
    renderRoster();
    renderPackChoice();
    $("mpLobbyStatus").classList.remove("waiting");
    setLobbyStatus("online.playersJoined", { count: lobbyRoster.length });
  } else if (msg.type === "roster") {
    lobbyRoster = msg.roster;
    renderRoster();
    setLobbyStatus("online.playersJoined", { count: lobbyRoster.length });
  } else if (msg.type === "packChosen") {
    lastPackChoiceId = msg.packId;
    renderPackChoice();
  } else if (msg.type === "start") {
    startFromNetwork(msg);
  } else if (msg.type === "roundResult") {
    applyRoundResult(msg.winnerIdx);
  } else if (msg.type === "skipAnnounce") {
    announceSkip(msg.idx);
  } else if (msg.type === "turnStart") {
    applyTurnStart(msg.idx, msg.deadline);
  } else if (msg.type === "quit") {
    toast(t("online.opponentLeft", { name: peerName || t("online.opponentFallback") }));
    quitToHome();
  }
}

// Host side: one connection per guest, tagged with its assigned idx.
function wireHostConnection(c, idx) {
  hostConns.push({ idx, conn: c, name: "" });
  c.on("data", (msg) => handleHostMessage(msg, idx));
  c.on("close", () => handleGuestDisconnect(idx));
  c.on("error", () => handleGuestDisconnect(idx));
  c.on("open", () => {
    const pc = c.peerConnection;
    if (pc) {
      pc.addEventListener("iceconnectionstatechange", () => {
        if (["disconnected", "failed", "closed"].includes(pc.iceConnectionState)) {
          handleGuestDisconnect(idx);
        }
      });
    }
  });
}

function handleGuestDisconnect(idx) {
  const i = hostConns.findIndex((e) => e.idx === idx);
  if (i === -1) return; // already cleaned up
  hostConns.splice(i, 1);
  const ri = lobbyRoster.findIndex((e) => e.idx === idx);
  if (ri !== -1) lobbyRoster.splice(ri, 1);
  if (game) {
    // Treat a departed player as having skipped, so a live round doesn't
    // hang forever waiting on someone who's gone.
    if (!skippedIdxs.has(idx)) {
      skippedIdxs.add(idx);
      broadcast({ type: "skipAnnounce", idx });
      announceSkip(idx);
      if (game.mode === "turns") hostAdvanceTurnAfterSkip(idx);
      else checkAllSkipped();
    }
  } else {
    renderRoster();
    broadcast({ type: "roster", roster: lobbyRoster });
    if (lobbyRoster.length <= 1) {
      $("mpOnlineConfig").style.display = "none";
      $("mpOnlineStartBtn").style.display = "none";
      setLobbyStatus("online.waitingShare", { code: $("mpRoomCode").textContent });
      $("mpLobbyStatus").classList.add("waiting");
    } else {
      setLobbyStatus("online.playersJoined", { count: lobbyRoster.length });
    }
  }
}

// Host side: messages sent by a specific guest.
function handleHostMessage(msg, idx) {
  if (msg.type === "hello") {
    const entry = hostConns.find((e) => e.idx === idx);
    if (!entry) return;
    entry.name = msg.name;
    const isFirstGuest = lobbyRoster.length === 1;
    lobbyRoster.push({ idx, name: msg.name });
    if (isFirstGuest) {
      lastPackChoiceId = $("mpOnlinePackSelect").value;
      $("mpOnlineConfig").style.display = "";
      $("mpOnlineStartBtn").style.display = "";
    }
    entry.conn.send({ type: "welcome", idx, name: myName, roster: lobbyRoster, packId: lastPackChoiceId });
    broadcast({ type: "roster", roster: lobbyRoster }, idx);
    renderRoster();
    $("mpLobbyStatus").classList.remove("waiting");
    setLobbyStatus("online.playersJoined", { count: lobbyRoster.length });
  } else if (msg.type === "attempt") {
    handlePeerAttempt(idx, msg.correct);
  } else if (msg.type === "passTurn") {
    if (activeIdx === idx) hostHandleTurnSkip(idx);
  }
}

function hostStart() {
  const packId = $("mpOnlinePackSelect").value;
  const pack = packs[packId];
  const rounds = Math.max(1, Math.min(20, parseInt($("mpOnlineRoundsInput").value, 10) || 5));
  const deckIndices = buildDeckIndices(pack.players.length, rounds);
  const names = lobbyRoster.map((p) => p.name);
  const mode = $("mpModeTurnsRadio").checked ? "turns" : "race";

  broadcast({ type: "start", packId, rounds, deckIndices, names, mode });
  beginGame(packId, deckIndices, names, rounds, mode);
}

function startFromNetwork(msg) {
  beginGame(msg.packId, msg.deckIndices, msg.names, msg.rounds, msg.mode);
}

function beginGame(packId, deckIndices, names, rounds, mode) {
  const pack = packs[packId];
  game = {
    players: names.map((n) => ({ name: n, score: 0 })),
    deck: deckIndices.map((i) => pack.players[i]),
    roundIndex: 0,
    rounds,
    packId,
    mode: mode || "race",
  };
  showScreen("screenMpoGame");
  buildRound();
}

/* ============================================================
   IN-GAME
============================================================ */
function renderScoreboard() {
  const el = $("mpoScoreboard");
  el.innerHTML = game.players
    .map((p, i) => {
      const cls = i === winnerFlashIdx ? " winner-flash" : "";
      return (
        '<div class="mp-score-chip' + cls + '">' +
        '<span class="mp-score-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="mp-score-value">' + p.score + "</span>" +
        "</div>"
      );
    })
    .join("");
  $("mpoRoundLabel").textContent = t("mp.round", { round: game.roundIndex + 1, total: game.rounds });
}

function buildRound() {
  locked = false;
  roundDecided = false;
  skippedIdxs = new Set();
  skippedNames = [];
  winnerFlashIdx = null;
  clearHostTurnTimeout();
  clearTurnCountdown();
  turnOrder = game.players.map((_, i) => i);
  activeIdx = null;
  turnDeadline = null;
  const p = game.deck[game.roundIndex];
  resolved = resolvePlayer(p, getLang());
  $("mpoSticker").classList.remove("win");
  $("mpoStickerNum").textContent = "#" + (game.roundIndex + 1);
  $("screenMpoGame").classList.toggle("spectating", game.mode === "turns");
  $("mpoTurnProgress").style.display = game.mode === "turns" ? "" : "none";
  $("mpoTurnBanner").textContent = game.mode === "turns" ? "" : t("mp.raceBanner");
  $("mpoSkipBtn").textContent = t("mp.skip");
  $("mpoAnswer").classList.remove("correct", "wrong", "rtl");

  const answerEl = $("mpoAnswer");
  answerEl.classList.toggle("rtl", !!resolved.rtl);
  slots = [];
  renderAnswerLayout(resolved.answer, answerEl, slots, removeFromSlot);

  const bankLetters = buildBankLetters(resolved.answer, resolved.alphabet);
  const bankEl = $("mpoBank");
  bankEl.innerHTML = "";
  bankEl.classList.toggle("rtl", !!resolved.rtl);
  tiles = bankLetters.map((ch) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.textContent = ch;
    const tileObj = { char: ch, el: b, used: false };
    b.addEventListener("click", () => placeTile(tileObj));
    bankEl.appendChild(b);
    return tileObj;
  });

  loadPhoto(p, $("mpoPhoto"));
  prefetchPhotos(game.deck.slice(game.roundIndex + 1, game.roundIndex + 3));
  renderScoreboard();
  if (game.mode === "turns" && myPlayerIdx === 0) startTurn(turnOrder[0]);
}

function isMyTurn() {
  return game.mode !== "turns" || activeIdx === myPlayerIdx;
}

function placeTile(tile) {
  if (locked || tile.used || !isMyTurn()) return;
  const empty = slots.find((s) => s.tileIdx === null);
  if (!empty) return;
  empty.tileIdx = tiles.indexOf(tile);
  empty.el.textContent = tile.char;
  empty.el.classList.add("filled");
  tile.used = true;
  tile.el.classList.add("used");
  if (slots.every((s) => s.tileIdx !== null)) checkNow();
}

function removeFromSlot(slot) {
  if (locked || slot.confirmed || slot.tileIdx === null) return;
  const tile = tiles[slot.tileIdx];
  tile.used = false;
  tile.el.classList.remove("used");
  slot.tileIdx = null;
  slot.el.textContent = "";
  slot.el.classList.remove("filled");
  $("mpoAnswer").classList.remove("wrong");
}

function checkNow() {
  if (locked) return;
  const guess = slots.map((s) => tiles[s.tileIdx].char).join("");
  if (checkAnswer(guess, resolved.answer)) {
    locked = true;
    reportAttempt(true);
    return;
  }
  $("mpoAnswer").classList.add("wrong");
  setTimeout(() => $("mpoAnswer").classList.remove("wrong"), 600);

  // Same per-letter lock feedback as single-player: correctly placed
  // letters turn green and lock, wrong ones flash red then free back to
  // the bank so only the wrong letters need retrying.
  const toFree = applyPerLetterLockFeedback(slots, tiles);
  slots.forEach((s) => s.el.classList.toggle("slot-correct", s.confirmed));
  toFree.forEach((s) => s.el.classList.add("slot-wrong"));
  clearTimeout(wrongFreeTimer);
  wrongFreeTimer = setTimeout(() => {
    toFree.forEach((s) => {
      const tile = tiles[s.tileIdx];
      tile.used = false;
      tile.el.classList.remove("used");
      s.tileIdx = null;
      s.el.textContent = "";
      s.el.classList.remove("filled", "slot-wrong");
    });
  }, 650);
}

function skipTurn() {
  if (locked || !isMyTurn()) return;
  if (game.mode === "turns") {
    locked = true;
    if (myPlayerIdx === 0) hostHandleTurnSkip(0);
    else if (conn) conn.send({ type: "passTurn" });
    return;
  }
  locked = true;
  reportAttempt(false);
}

/* ------------------------------------------------------------
   "turns" mode: players answer one at a time, in a fixed order.
   The host is the sole authority on whose turn it is (mirrors how
   it's the sole authority on round winners) — it broadcasts every
   turn change, and runs a fallback timer per turn so a stalled or
   backgrounded device can't hang the whole round.
------------------------------------------------------------- */
function clearHostTurnTimeout() {
  if (hostTurnTimeoutHandle) {
    clearTimeout(hostTurnTimeoutHandle);
    hostTurnTimeoutHandle = null;
  }
}

function clearTurnCountdown() {
  if (turnCountdownHandle) {
    clearInterval(turnCountdownHandle);
    turnCountdownHandle = null;
  }
}

// Host-only: assigns the turn to `idx`, broadcasts it, and arms the
// fallback timeout that force-passes the turn if nobody acts in time.
function startTurn(idx) {
  turnDeadline = Date.now() + TURN_MS;
  broadcast({ type: "turnStart", idx, deadline: turnDeadline });
  applyTurnStart(idx, turnDeadline);
}

// Runs on every client (host included) when a turn starts or changes.
function applyTurnStart(idx, deadline) {
  activeIdx = idx;
  turnDeadline = deadline;
  locked = false;
  renderTurnBanner();
  clearTurnCountdown();
  tickTurnCountdown();
  turnCountdownHandle = setInterval(tickTurnCountdown, 200);
  if (myPlayerIdx === 0) {
    clearHostTurnTimeout();
    const ms = Math.max(0, deadline - Date.now()) + 1000; // grace for network latency
    hostTurnTimeoutHandle = setTimeout(() => {
      if (roundDecided || activeIdx !== idx) return;
      hostHandleTurnSkip(idx);
    }, ms);
  }
}

function renderTurnBanner() {
  if (!game || game.mode !== "turns" || activeIdx === null) return;
  $("screenMpoGame").classList.toggle("spectating", activeIdx !== myPlayerIdx);
  const seconds = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
  const name = game.players[activeIdx] ? game.players[activeIdx].name : "";
  $("mpoTurnBanner").textContent = activeIdx === myPlayerIdx ? t("mp.yourTurn", { seconds }) : t("mp.waitingTurn", { name, seconds });
  $("mpoSkipBtn").textContent = t("mp.passTurn");
}

function tickTurnCountdown() {
  if (!game || game.mode !== "turns" || activeIdx === null || turnDeadline === null) return;
  const remainingMs = turnDeadline - Date.now();
  const pct = Math.max(0, Math.min(100, (remainingMs / TURN_MS) * 100));
  const fill = $("mpoTurnProgressFill");
  fill.style.width = pct + "%";
  fill.classList.toggle("urgent", remainingMs < TURN_MS * 0.25);
  renderTurnBanner();
}

// Host-only: idx passed (explicitly, or via the fallback timeout) — mark
// it skipped and either resolve the round (everyone's had a turn) or hand
// the turn to the next player in the fixed order who hasn't gone yet.
function hostHandleTurnSkip(idx) {
  if (roundDecided || skippedIdxs.has(idx)) return;
  skippedIdxs.add(idx);
  broadcast({ type: "skipAnnounce", idx });
  announceSkip(idx);
  hostAdvanceTurnAfterSkip(idx);
}

function hostAdvanceTurnAfterSkip(idx) {
  if (roundDecided) return;
  if (skippedIdxs.size >= turnOrder.length) {
    resolveRound(null);
    return;
  }
  if (activeIdx === idx) {
    const next = turnOrder.find((i) => !skippedIdxs.has(i));
    if (next !== undefined) startTurn(next);
  }
}

// Host is the single authority that decides who won a round — its own
// correctness check has zero network latency, so ties resolve in the
// host's favor; acceptable for a casual multiplayer game with no server.
function reportAttempt(correct) {
  if (myPlayerIdx === 0) {
    if (correct) {
      resolveRound(0);
    } else {
      skippedIdxs.add(0);
      broadcast({ type: "skipAnnounce", idx: 0 });
      announceSkip(0);
      checkAllSkipped();
    }
  } else if (conn) {
    conn.send({ type: "attempt", correct });
    if (!correct) announceSkip(myPlayerIdx);
  }
}

// Host side only: a specific guest (identified by idx) reported an attempt.
function handlePeerAttempt(idx, correct) {
  if (correct) {
    if (!roundDecided) resolveRound(idx);
  } else {
    skippedIdxs.add(idx);
    broadcast({ type: "skipAnnounce", idx }, idx);
    announceSkip(idx);
    checkAllSkipped();
  }
}

function checkAllSkipped() {
  if (!roundDecided && game && skippedIdxs.size >= game.players.length) resolveRound(null);
}

// Shows a running "so-and-so skipped" banner as skips trickle in, ahead of
// the round's full resolution (which still waits on every player).
function announceSkip(idx) {
  if (roundDecided || !game || !game.players[idx]) return;
  const name = game.players[idx].name;
  if (!skippedNames.includes(name)) skippedNames.push(name);
  $("mpoTurnBanner").textContent = t("online.skipAnnounce", { name });
}

function resolveRound(winnerIdx) {
  if (roundDecided) return;
  roundDecided = true;
  if (winnerIdx !== null) game.players[winnerIdx].score += MP_POINTS;
  broadcast({ type: "roundResult", winnerIdx });
  showRoundOutcome(winnerIdx);
}

function applyRoundResult(winnerIdx) {
  if (roundDecided) return;
  roundDecided = true;
  if (winnerIdx !== null) game.players[winnerIdx].score += MP_POINTS;
  showRoundOutcome(winnerIdx);
}

function showRoundOutcome(winnerIdx) {
  locked = true;
  clearHostTurnTimeout();
  clearTurnCountdown();
  $("screenMpoGame").classList.remove("spectating");
  $("mpoTurnProgress").style.display = "none";
  if (winnerIdx === null) {
    $("mpoAnswer").classList.add("wrong");
    $("mpoTurnBanner").textContent = t("online.roundSkipped");
  } else if (winnerIdx === myPlayerIdx) {
    $("mpoAnswer").classList.add("correct");
    $("mpoTurnBanner").textContent = t("online.youGotIt");
    winnerFlashIdx = winnerIdx;
  } else {
    $("mpoAnswer").classList.add("wrong");
    $("mpoTurnBanner").textContent = t("online.opponentGotIt", { name: game.players[winnerIdx].name });
    winnerFlashIdx = winnerIdx;
  }
  $("mpoSticker").classList.add("win");
  renderScoreboard();
  setTimeout(advanceRound, 900);
}

function advanceRound() {
  game.roundIndex += 1;
  if (game.roundIndex >= game.rounds) {
    showResults();
    return;
  }
  buildRound();
}

function showResults() {
  $("screenMpoGame").style.display = "none";
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0].score;
  const winners = ranked.filter((p) => p.score === topScore);
  $("mpoWinnerName").textContent =
    winners.length > 1
      ? t("mp.tie", { names: winners.map((p) => p.name).join(" & ") })
      : t("mp.wins", { name: winners[0].name });
  $("mpoFinalScores").innerHTML = ranked
    .map(
      (p, i) =>
        '<div class="mp-final-row' + (p.score === topScore ? " winner" : "") + '">#' + (i + 1) + " " + escapeHtml(p.name) + " — <b>" + p.score + "</b> " + t("game.pts") + "</div>"
    )
    .join("");
  $("mpoResultsOverlay").classList.add("show");

  // Each device only knows its own local history (there's no backend), so
  // both host and guest independently record this match's winner(s) into
  // their own on-device champions log.
  if (recordChampion) {
    winners.forEach((w) =>
      recordChampion({ name: w.name, score: w.score, packId: game.packId, mode: "online", date: Date.now() })
    );
  }
  // A 0-0 stalemate (every round skipped by everyone) isn't a meaningful
  // win or loss for the device-level global win-streak — skip it entirely.
  if (topScore > 0) {
    recordMatchResult({ won: winners.includes(game.players[myPlayerIdx]) });
  }
  recordRun({ score: game.players[myPlayerIdx].score, mode: "online-multiplayer", packId: game.packId });
  bumpGamesPlayedCounter();
}

function quitSilently() {
  clearHostTurnTimeout();
  clearTurnCountdown();
  if (conn) {
    try {
      conn.close();
    } catch (e) {}
  }
  hostConns.forEach(({ conn: c }) => {
    try {
      c.close();
    } catch (e) {}
  });
  hostConns = [];
  if (peer) peer.destroy();
  conn = null;
  peer = null;
}

function quitToHome() {
  if (myPlayerIdx === 0) {
    broadcast({ type: "quit" });
  } else if (conn) {
    try {
      conn.send({ type: "quit" });
    } catch (e) {}
  }
  quitSilently();
  game = null;
  $("screenMpoGame").style.display = "none";
  $("screenMpOnline").style.display = "none";
  $("mpoResultsOverlay").classList.remove("show");
  if (onExit) onExit();
}

/* ============================================================
   INIT
============================================================ */
export function init(context) {
  packs = context.packs;
  packOrder = context.packOrder;
  onExit = context.onExit;
  recordChampion = context.recordChampion;

  $("mpHostBtn").addEventListener("click", hostRoom);
  $("mpJoinToggleBtn").addEventListener("click", () => {
    $("mpJoinRow").style.display = $("mpJoinRow").style.display === "none" ? "" : "none";
  });
  $("mpJoinBtn").addEventListener("click", joinRoom);
  $("mpOnlinePackSelect").addEventListener("change", () => {
    if (myPlayerIdx !== 0) return;
    lastPackChoiceId = $("mpOnlinePackSelect").value;
    broadcast({ type: "packChosen", packId: lastPackChoiceId });
  });
  $("mpOnlineStartBtn").addEventListener("click", hostStart);
  $("mpOnlineBackBtn").addEventListener("click", () => {
    quitSilently();
    if (onExit) onExit();
  });
  $("mpoQuitBtn").addEventListener("click", quitToHome);
  $("mpoSkipBtn").addEventListener("click", skipTurn);
  $("mpoPlayAgainBtn").addEventListener("click", quitToHome);
  $("mpOnlineLangBtn").addEventListener("click", showLangPicker);

  // Re-render the lobby's dynamic bits (translated pack names, the last
  // status message) if the language changes while it's on-screen — static
  // chrome (buttons/labels/placeholders) is already covered by
  // applyStaticTranslations.
  onLangChange(() => {
    if ($("screenMpOnline").style.display !== "none") {
      populatePackSelect();
      if (lastStatusKey) $("mpLobbyStatus").textContent = t(lastStatusKey, lastStatusVars);
      renderPackChoice();
    }
    if ($("screenMpoGame").style.display !== "none" && game) buildRound();
  });
}
