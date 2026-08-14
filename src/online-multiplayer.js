// Real cross-device multiplayer for exactly 2 players, using PeerJS
// (WebRTC data channel, free public signaling broker — no account/server
// needed). The host generates a short room code; the guest connects to it.
// Game state (deck/turns) is agreed once at "start" and then only turn
// RESULTS are sent over the wire, so both sides stay in lockstep.
import { buildBankLetters, checkAnswer } from "./game.js";
import { loadPhoto, prefetchPhotos } from "./photo.js";
import { showScreen } from "./screens.js";
import { t } from "./i18n/index.js";

const $ = (id) => document.getElementById(id);
const MP_POINTS = 100;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

let packs = null;
let packOrder = null;
let onExit = null;

let peer = null;
let conn = null;
let myName = "";
let peerName = "";
let myPlayerIdx = 0; // 0 = host, 1 = guest

let game = null; // {players:[{name,score}], deck:[player,...], turns:[{playerIdx,round}], turnIndex, rounds}
let tiles = [];
let slots = [];
let locked = false;

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
}

export function showLobby() {
  showScreen("screenMpOnline");
  resetLobbyUI();

  const select = $("mpOnlinePackSelect");
  if (!select.dataset.filled) {
    packOrder.forEach((packId) => {
      const pack = packs[packId];
      if (!pack) return;
      const opt = document.createElement("option");
      opt.value = packId;
      opt.textContent = pack.icon + " " + pack.name;
      select.appendChild(opt);
    });
    select.dataset.filled = "1";
  }
}

function hostRoom() {
  myName = $("mpOnlineNameInput").value.trim() || "Host";
  myPlayerIdx = 0;
  attemptHost(0);
}

function attemptHost(tries) {
  if (tries >= 6) {
    $("mpOnlineError").textContent = t("online.couldntCreate");
    return;
  }
  const code = genRoomCode();
  const p = new Peer("wtp-" + code);
  p.on("open", () => {
    peer = p;
    $("mpOnlineChoice").style.display = "none";
    $("mpOnlineLobby").style.display = "";
    $("mpRoomCode").textContent = code;
    $("mpLobbyStatus").textContent = t("online.waitingShare", { code });
  });
  p.on("error", (err) => {
    if (err.type === "unavailable-id") {
      p.destroy();
      attemptHost(tries + 1);
    } else {
      $("mpOnlineError").textContent = "Connection error: " + err.type;
    }
  });
  p.on("connection", (c) => {
    conn = c;
    wireConnection();
  });
}

function joinRoom() {
  myName = $("mpOnlineNameInput").value.trim() || "Guest";
  const code = $("mpJoinCodeInput").value.trim().toUpperCase();
  if (!code) {
    $("mpOnlineError").textContent = t("online.enterCode");
    return;
  }
  myPlayerIdx = 1;
  const p = new Peer();
  p.on("open", () => {
    peer = p;
    conn = p.connect("wtp-" + code, { reliable: true });
    wireConnection();
    conn.on("open", () => {
      conn.send({ type: "hello", name: myName });
      $("mpOnlineChoice").style.display = "none";
      $("mpOnlineLobby").style.display = "";
      $("mpRoomCode").textContent = code;
      $("mpLobbyStatus").textContent = t("online.connectedWaiting");
    });
  });
  p.on("error", (err) => {
    $("mpOnlineError").textContent = t("online.couldntConnect", { err: err.type });
  });
}

function wireConnection() {
  conn.on("data", handleMessage);
  conn.on("close", () => {
    if (game) {
      alert(t("online.opponentDisconnected", { name: peerName || "Opponent" }));
      quitToHome();
    }
  });
  conn.on("open", () => {
    if (myPlayerIdx === 0) conn.send({ type: "welcome", name: myName });
  });
}

function handleMessage(msg) {
  if (msg.type === "hello") {
    peerName = msg.name;
    conn.send({ type: "welcome", name: myName });
    $("mpLobbyStatus").textContent = t("online.joinedPickPack", { name: peerName });
    $("mpOnlineConfig").style.display = "";
    $("mpOnlineStartBtn").style.display = "";
  } else if (msg.type === "welcome") {
    peerName = msg.name;
    $("mpLobbyStatus").textContent = t("online.connectedTo", { name: peerName });
  } else if (msg.type === "start") {
    startFromNetwork(msg);
  } else if (msg.type === "result") {
    applyResult(msg.points, false);
  } else if (msg.type === "quit") {
    alert(t("online.opponentLeft", { name: peerName || "Opponent" }));
    quitToHome();
  }
}

function hostStart() {
  const packId = $("mpOnlinePackSelect").value;
  const pack = packs[packId];
  const rounds = Math.max(1, Math.min(20, parseInt($("mpOnlineRoundsInput").value, 10) || 5));
  const totalTurns = 2 * rounds;
  const deckIndices = buildDeckIndices(pack.players.length, totalTurns);
  const turns = [];
  for (let r = 0; r < rounds; r++) for (let p2 = 0; p2 < 2; p2++) turns.push({ playerIdx: p2, round: r + 1 });
  const names = [myName, peerName];

  conn.send({ type: "start", packId, rounds, deckIndices, names });
  beginGame(packId, deckIndices, turns, names, rounds);
}

function startFromNetwork(msg) {
  const turns = [];
  for (let r = 0; r < msg.rounds; r++) for (let p2 = 0; p2 < 2; p2++) turns.push({ playerIdx: p2, round: r + 1 });
  beginGame(msg.packId, msg.deckIndices, turns, msg.names, msg.rounds);
}

function beginGame(packId, deckIndices, turns, names, rounds) {
  const pack = packs[packId];
  game = {
    players: names.map((n) => ({ name: n, score: 0 })),
    deck: deckIndices.map((i) => pack.players[i]),
    turns,
    turnIndex: 0,
    rounds,
  };
  showScreen("screenMpoGame");
  buildTurn();
}

/* ============================================================
   IN-GAME
============================================================ */
function isMyTurn() {
  return game.turns[game.turnIndex].playerIdx === myPlayerIdx;
}

function renderScoreboard() {
  const el = $("mpoScoreboard");
  el.innerHTML = game.players
    .map((p, i) => {
      const active = i === game.turns[game.turnIndex].playerIdx;
      return (
        '<div class="mp-score-chip' + (active ? " active" : "") + '">' +
        '<span class="mp-score-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="mp-score-value">' + p.score + "</span>" +
        "</div>"
      );
    })
    .join("");
  $("mpoRoundLabel").textContent = t("mp.round", { round: game.turns[game.turnIndex].round, total: game.rounds });
}

function buildTurn() {
  locked = !isMyTurn();
  const p = game.deck[game.turnIndex];
  $("mpoSticker").classList.remove("win");
  $("mpoStickerNum").textContent = "#" + (game.turnIndex + 1);
  const turnPlayerName = game.players[game.turns[game.turnIndex].playerIdx].name;
  $("mpoTurnBanner").textContent = isMyTurn() ? t("online.yourTurn") : t("mp.turnOf", { name: turnPlayerName });
  $("mpoAnswer").classList.remove("correct", "wrong");

  const answerEl = $("mpoAnswer");
  answerEl.innerHTML = "";
  slots = [];
  p.answer.split(" ").forEach((word) => {
    const w = document.createElement("div");
    w.className = "word";
    word.split("").forEach((ch) => {
      const s = document.createElement("div");
      s.className = "slot";
      const slotObj = { char: ch, el: s, tileIdx: null };
      s.addEventListener("click", () => removeFromSlot(slotObj));
      w.appendChild(s);
      slots.push(slotObj);
    });
    answerEl.appendChild(w);
  });

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

  $("mpoSkipBtn").style.display = isMyTurn() ? "" : "none";

  loadPhoto(p, $("mpoPhoto"));
  prefetchPhotos(game.deck.slice(game.turnIndex + 1, game.turnIndex + 3));
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
  const guess = slots.map((s) => tiles[s.tileIdx].char).join("");
  if (checkAnswer(guess, game.deck[game.turnIndex].answer)) {
    applyResult(MP_POINTS, true);
  } else {
    $("mpoAnswer").classList.add("wrong");
    setTimeout(() => $("mpoAnswer").classList.remove("wrong"), 600);
  }
}

function skipTurn() {
  if (locked) return;
  applyResult(0, true);
}

function applyResult(points, sendToNet) {
  locked = true;
  const idx = game.turns[game.turnIndex].playerIdx;
  game.players[idx].score += points;
  $("mpoAnswer").classList.add(points > 0 ? "correct" : "wrong");
  $("mpoSticker").classList.add("win");
  renderScoreboard();
  if (sendToNet && conn) conn.send({ type: "result", points });
  setTimeout(advanceTurn, 700);
}

function advanceTurn() {
  game.turnIndex += 1;
  if (game.turnIndex >= game.turns.length) {
    showResults();
    return;
  }
  buildTurn();
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
    .map((p, i) => '<div class="mp-final-row">#' + (i + 1) + " " + escapeHtml(p.name) + " — <b>" + p.score + "</b> pts</div>")
    .join("");
  $("mpoResultsOverlay").classList.add("show");
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
}
