// Polls for new bug reports and pings Telegram, run by GitHub Actions on a
// short cron schedule (.github/workflows/bug-report-notify.yml) instead of a
// paid Firebase Cloud Function — reuses the same free Admin SDK + service
// account key setup as send-daily-reminder.js, so no bot token ever has to
// live in client-side code or in git history.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
initializeApp({ credential: cert(serviceAccount) });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
}

async function main() {
  const db = getFirestore();
  const stateRef = db.collection("meta").doc("bugReportNotifyState");
  const stateSnap = await stateRef.get();
  const lastCheckedAt = stateSnap.exists ? stateSnap.data().lastCheckedAt : Timestamp.fromMillis(0);

  const snap = await db.collection("bugReports").where("createdAt", ">", lastCheckedAt).orderBy("createdAt", "asc").get();

  for (const doc of snap.docs) {
    const report = doc.data();
    const text = "🐛 New bug report" + (report.name ? `\nFrom: ${report.name}` : "") + `\n${report.text || "(no text)"}`;
    await sendTelegram(text);
  }

  await stateRef.set({ lastCheckedAt: Timestamp.now() });
  console.log(`Checked ${snap.size} new bug report(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
