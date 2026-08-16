// Real cross-device multiplayer for exactly 2 players, using PeerJS
// (WebRTC data channel, free public signaling broker — no account/server
// needed). The host generates a short room code; the guest connects to it.
// Both players race the same target each round; the host is the sole
// authority on who answered first (see reportAttempt/resolveRound).
import { buildBankLetters, checkAnswer, renderAnswerLayout } from "./game.js";
import { loadPhoto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t, getLang, showLangPicker, onLangChange } from "./i18n/index.js";
import { translatePackName } from "./i18n/content/leagues.js";

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

let peer = null;
let conn = null;
let myName = "";
let peerName = "";
let myPlayerIdx = 0; // 0 = host, 1 = guest

let game = null; // {players:[{name,score}], deck:[player,...], roundIndex, rounds}
let tiles = [];
let slots = [];
let locked = false;
let roundDecided = false;
let hostGaveUp = false;
let guestGaveUp = false;
let winnerFlashIdx = null; // briefly highlights the round's winning chip

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
  lastStatusKey = null;
  lastStatusVars = null;
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
    conn = c;
    wireConnection();
  });
}

function joinRoom() {
  myName = $("mpOnlineNameInput").value.trim() || t("online.defaultGuestName");
  const code = $("mpJoinCodeInput").value.trim().toUpperCase();
  if (!code) {
    $("mpOnlineError").textContent = t("online.enterCode");
    return;
  }
  myPlayerIdx = 1;
  const p = new Peer({ config: ICE_CONFIG });
  p.on("open", () => {
    peer = p;
    conn = p.connect("wtp-" + code, { reliable: true });
    wireConnection();
    conn.on("open", () => {
      conn.send({ type: "hello", name: myName });
      $("mpOnlineChoice").style.display = "none";
      $("mpOnlineLobby").style.display = "";
      $("mpRoomCode").textContent = code;
      setLobbyStatus("online.connectedWaiting");
      $("mpLobbyStatus").classList.add("waiting");
    });
  });
  p.on("error", (err) => {
    $("mpOnlineError").textContent = t("online.couldntConnect", { err: err.type });
  });
}

function wireConnection() {
  disconnectHandled = false;
  conn.on("data", handleMessage);
  conn.on("close", handleUnexpectedDisconnect);
  conn.on("error", handleUnexpectedDisconnect);
  conn.on("open", () => {
    if (myPlayerIdx === 0) conn.send({ type: "welcome", name: myName });
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
    alert(t("online.opponentDisconnected", { name: peerName || t("online.opponentFallback") }));
    quitToHome();
  }
}

function handleMessage(msg) {
  if (msg.type === "hello") {
    peerName = msg.name;
    conn.send({ type: "welcome", name: myName });
    $("mpLobbyStatus").classList.remove("waiting");
    setLobbyStatus("online.joinedPickPack", { name: peerName });
    $("mpOnlineConfig").style.display = "";
    $("mpOnlineStartBtn").style.display = "";
  } else if (msg.type === "welcome") {
    peerName = msg.name;
    $("mpLobbyStatus").classList.remove("waiting");
    setLobbyStatus("online.connectedTo", { name: peerName });
  } else if (msg.type === "start") {
    startFromNetwork(msg);
  } else if (msg.type === "attempt") {
    handlePeerAttempt(msg.correct);
  } else if (msg.type === "roundResult") {
    applyRoundResult(msg.winnerIdx);
  } else if (msg.type === "quit") {
    alert(t("online.opponentLeft", { name: peerName || t("online.opponentFallback") }));
    quitToHome();
  }
}

function hostStart() {
  const packId = $("mpOnlinePackSelect").value;
  const pack = packs[packId];
  const rounds = Math.max(1, Math.min(20, parseInt($("mpOnlineRoundsInput").value, 10) || 5));
  const deckIndices = buildDeckIndices(pack.players.length, rounds);
  const names = [myName, peerName];

  conn.send({ type: "start", packId, rounds, deckIndices, names });
  beginGame(packId, deckIndices, names, rounds);
}

function startFromNetwork(msg) {
  beginGame(msg.packId, msg.deckIndices, msg.names, msg.rounds);
}

function beginGame(packId, deckIndices, names, rounds) {
  const pack = packs[packId];
  game = {
    players: names.map((n) => ({ name: n, score: 0 })),
    deck: deckIndices.map((i) => pack.players[i]),
    roundIndex: 0,
    rounds,
    packId,
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
  hostGaveUp = false;
  guestGaveUp = false;
  winnerFlashIdx = null;
  const p = game.deck[game.roundIndex];
  $("mpoSticker").classList.remove("win");
  $("mpoStickerNum").textContent = "#" + (game.roundIndex + 1);
  $("mpoTurnBanner").textContent = t("mp.raceBanner");
  $("mpoAnswer").classList.remove("correct", "wrong");

  const answerEl = $("mpoAnswer");
  slots = [];
  renderAnswerLayout(p.answer, answerEl, slots, removeFromSlot);

  const bankLetters = buildBankLetters(p.answer);
  const bankEl = $("mpoBank");
  bankEl.innerHTML = "";
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
}

function placeTile(tile) {
  if (locked || tile.used) return;
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
  if (locked || slot.tileIdx === null) return;
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
  if (checkAnswer(guess, game.deck[game.roundIndex].answer)) {
    locked = true;
    reportAttempt(true);
  } else {
    $("mpoAnswer").classList.add("wrong");
    setTimeout(() => $("mpoAnswer").classList.remove("wrong"), 600);
  }
}

function skipTurn() {
  if (locked) return;
  locked = true;
  reportAttempt(false);
}

// Host is the single authority that decides who won a round — its own
// correctness check has zero network latency, so ties resolve in the
// host's favor; acceptable for a casual 2-player game with no server.
function reportAttempt(correct) {
  if (myPlayerIdx === 0) {
    if (correct) {
      resolveRound(0);
    } else {
      hostGaveUp = true;
      if (guestGaveUp) resolveRound(null);
    }
  } else if (conn) {
    conn.send({ type: "attempt", correct });
  }
}

function handlePeerAttempt(correct) {
  if (correct) {
    if (!roundDecided) resolveRound(1);
  } else {
    guestGaveUp = true;
    if (hostGaveUp) resolveRound(null);
  }
}

function resolveRound(winnerIdx) {
  if (roundDecided) return;
  roundDecided = true;
  if (winnerIdx !== null) game.players[winnerIdx].score += MP_POINTS;
  if (conn) conn.send({ type: "roundResult", winnerIdx });
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
}

function quitSilently() {
  if (conn) {
    try {
      conn.close();
    } catch (e) {}
  }
  if (peer) peer.destroy();
  conn = null;
  peer = null;
}

function quitToHome() {
  if (conn) {
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
    if ($("screenMpOnline").style.display === "none") return;
    populatePackSelect();
    if (lastStatusKey) $("mpLobbyStatus").textContent = t(lastStatusKey, lastStatusVars);
  });
}
