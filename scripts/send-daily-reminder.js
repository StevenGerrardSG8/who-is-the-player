// Daily "come back and play" reminder, run by GitHub Actions on a cron
// schedule (.github/workflows/daily-reminder.yml) instead of a paid Firebase
// Cloud Function/Scheduler — this needs only the free Firestore/Auth/FCM
// APIs (Spark plan), not Blaze, since it's just a Node script using the
// Admin SDK with a service account key, not a hosted Cloud Function.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
initializeApp({ credential: cert(serviceAccount) });

async function main() {
  const db = getFirestore();
  const messaging = getMessaging();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const snap = await db.collection("players").get();
  const staleTokens = [];
  let sent = 0;

  for (const docSnap of snap.docs) {
    const player = docSnap.data();
    const tokens = Array.isArray(player.fcmTokens) ? player.fcmTokens : [];
    if (!tokens.length) continue;

    const lastPlayedAt = player.lastPlayedAt ? player.lastPlayedAt.toDate() : null;
    if (lastPlayedAt && lastPlayedAt >= startOfToday) continue; // already played today

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Guess The Baller ⚽",
        body: "You haven't played today — come guess a few players!",
      },
    });
    sent += response.successCount;
    response.responses.forEach((r, i) => {
      // A dead/expired token fails with one of these codes — drop it so
      // future runs don't keep retrying a device that's gone for good.
      if (!r.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(r.error && r.error.code)) {
        staleTokens.push({ uid: docSnap.id, token: tokens[i] });
      }
    });
  }

  for (const { uid, token } of staleTokens) {
    await db.collection("players").doc(uid).update({ fcmTokens: FieldValue.arrayRemove(token) });
  }

  console.log(`Sent ${sent} reminder(s), pruned ${staleTokens.length} stale token(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
