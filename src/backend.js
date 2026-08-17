// Optional global backend (Firebase): anonymous per-device identity, opt-in
// name, and cross-device leaderboards. Everything here fails soft — the
// game is fully playable offline/without a name; this module only adds to
// the experience once a player opts in by setting a global name in the
// Hall of Fame screen (see showHallOfFame in ui.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  arrayUnion,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getMessaging, getToken, isSupported as isMessagingSupported } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";
import { storage } from "./storage.js";
import { GLOBAL_NAME_STORAGE_KEY, PUSH_TOKEN_STORAGE_KEY } from "./config.js";

// Generated in the Firebase console (Project settings → Cloud Messaging →
// Web Push certificates) — public by nature, like the rest of firebaseConfig.
const VAPID_KEY = "BPF2ao3rU6YUgGcB0fgkOj3CE2vRs74l8pOIUQRUTjhrqDo0ICzCXieT3-NQsRtKHQsy2nTVTqIOBjqO2coRFEc";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let uid = null;
let readyResolve;
const ready = new Promise((resolve) => {
  readyResolve = resolve;
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    readyResolve();
  }
});
signInAnonymously(auth).catch(() => {
  // Offline or blocked (e.g. no network, third-party-cookie restrictions) —
  // every function below checks `uid` and no-ops if it's still null.
});

let cachedName = null;

export async function initBackend() {
  cachedName = (await storage.get(GLOBAL_NAME_STORAGE_KEY)) || null;
  return Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
}

export function getGlobalName() {
  return cachedName;
}

export async function setGlobalName(name) {
  cachedName = name;
  await storage.set(GLOBAL_NAME_STORAGE_KEY, name);
  if (!uid) return;
  try {
    await setDoc(doc(db, "players", uid), { name, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {}
}

// Call after a solo pack completion or an online-multiplayer match this
// device's player finished, once a global name is set. Feeds the
// daily/weekly/monthly score leaderboards.
export async function recordRun({ score, mode, packId }) {
  if (!uid || !cachedName) return;
  try {
    await addDoc(collection(db, "runs"), {
      uid,
      name: cachedName,
      score,
      mode,
      packId,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "players", uid), { name: cachedName, lastPlayedAt: serverTimestamp() }, { merge: true });
  } catch (e) {}
}

// Mirrors the local daily-play streak (src/state.js's updateDailyStreak)
// onto this device's global player doc, for the day-streak leaderboard.
export async function syncDayStreak({ current, longest }) {
  if (!uid || !cachedName) return;
  try {
    await setDoc(
      doc(db, "players", uid),
      { name: cachedName, currentDayStreak: current, longestDayStreak: longest },
      { merge: true }
    );
  } catch (e) {}
}

// Online-multiplayer win/loss for *this* device's player only — local
// pass-and-play is deliberately excluded since one shared device can
// represent several different physical players, so there's no single
// identity a win-streak could attach to.
export async function recordMatchResult({ won }) {
  if (!uid || !cachedName) return;
  try {
    const snap = await getDoc(doc(db, "players", uid));
    const prev = snap.exists() ? snap.data() : {};
    const current = won ? (prev.currentWinStreak || 0) + 1 : 0;
    const longest = Math.max(prev.longestWinStreak || 0, current);
    await setDoc(
      doc(db, "players", uid),
      { name: cachedName, currentWinStreak: current, longestWinStreak: longest },
      { merge: true }
    );
  } catch (e) {}
}

const PERIOD_MS = { daily: 86400000, weekly: 7 * 86400000, monthly: 30 * 86400000 };

// kind: "daily" | "weekly" | "monthly" | "dayStreak" | "winStreak"
export async function fetchLeaderboard(kind) {
  try {
    if (kind === "dayStreak" || kind === "winStreak") {
      const field = kind === "dayStreak" ? "currentDayStreak" : "currentWinStreak";
      const snap = await getDocs(query(collection(db, "players"), orderBy(field, "desc"), limit(20)));
      return snap.docs
        .map((d) => ({ name: d.data().name, value: d.data()[field] || 0 }))
        .filter((row) => row.name && row.value > 0);
    }
    // Firestore requires any orderBy to start with the field used in a range
    // filter (createdAt here), so a direct "top score in this window" query
    // isn't expressible server-side — fetch the window (newest-first, capped)
    // and rank by score client-side instead.
    const since = new Date(Date.now() - PERIOD_MS[kind]);
    const snap = await getDocs(
      query(collection(db, "runs"), where("createdAt", ">=", since), orderBy("createdAt", "desc"), limit(500))
    );
    return snap.docs
      .map((d) => ({ name: d.data().name, value: d.data().score }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  } catch (e) {
    return [];
  }
}

/* ============================================================
   PUSH NOTIFICATIONS — "come back and play" reminder
   Opt-in only: never requested automatically, only from an explicit
   button click (see enablePushNotifications callers in ui.js). A daily
   Cloud Function (functions/index.js) does the actual "did they play
   today?" check and sends to whatever's in players/{uid}.fcmTokens.
============================================================ */
export function getPushPermission() {
  return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
}

export async function isPushAlreadyEnabled() {
  return !!(await storage.get(PUSH_TOKEN_STORAGE_KEY));
}

export async function enablePushNotifications() {
  if (!uid || !cachedName) return false;
  if (!("serviceWorker" in navigator) || !(await isMessagingSupported().catch(() => false))) return false;
  try {
    const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return false;
    await setDoc(doc(db, "players", uid), { name: cachedName, fcmTokens: arrayUnion(token) }, { merge: true });
    await storage.set(PUSH_TOKEN_STORAGE_KEY, token);
    return true;
  } catch (e) {
    return false;
  }
}
