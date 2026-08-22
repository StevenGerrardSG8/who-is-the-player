import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const PORT = process.env.ADMIN_PORT || 5175;

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage() });

// Packs that aren't real player lists (composed only of imports) are skipped.
const SKIP_FILES = new Set(["packs.js"]);

async function listPackFiles() {
  const files = await fs.readdir(DATA_DIR);
  return files.filter((f) => f.endsWith(".js") && !SKIP_FILES.has(f));
}

async function loadPack(file) {
  const full = path.join(DATA_DIR, file);
  // Cache-bust so edits made by this server (or externally) are always picked up.
  const mod = await import(pathToFileURL(full).href + "?t=" + Date.now());
  return mod.default;
}

function serializeString(s) {
  return JSON.stringify(s ?? "");
}

function serializePlayer(p) {
  const career = JSON.stringify(p.career || []);
  return (
    `{answer:${serializeString(p.answer)}, wiki:${serializeString(p.wiki)}, ` +
    `pos:${serializeString(p.pos)}, country:${serializeString(p.country)},\n` +
    `     career:${career}},`
  );
}

function serializePack(pack) {
  const lines = ["export default {"];
  for (const [key, value] of Object.entries(pack)) {
    if (key === "players") continue;
    lines.push(`  ${key}: ${JSON.stringify(value)},`);
  }
  lines.push("  players: [");
  for (const p of pack.players) {
    lines.push(serializePlayer(p));
  }
  lines.push("  ]");
  lines.push("}");
  return lines.join("\n") + "\n";
}

async function savePack(file, pack) {
  const full = path.join(DATA_DIR, file);
  await fs.writeFile(full, serializePack(pack), "utf-8");
}

// --- Routes ---

app.get("/api/packs", async (req, res) => {
  try {
    const files = await listPackFiles();
    const packs = [];
    for (const file of files) {
      try {
        const pack = await loadPack(file);
        if (!pack || !Array.isArray(pack.players)) continue;
        packs.push({
          file,
          id: pack.id,
          name: pack.name,
          icon: pack.icon,
          count: pack.players.length,
        });
      } catch (e) {
        // Not a plain player-array pack (e.g. a helper module) — skip it.
      }
    }
    packs.sort((a, b) => a.name.localeCompare(b.name));
    res.json(packs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/packs/:file/players", async (req, res) => {
  try {
    const pack = await loadPack(req.params.file);
    res.json(pack.players);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post("/api/packs/:file/players", async (req, res) => {
  try {
    const pack = await loadPack(req.params.file);
    const player = normalizePlayer(req.body);
    if (!player.answer || !player.wiki) {
      return res.status(400).json({ error: "answer and wiki are required" });
    }
    pack.players.push(player);
    await savePack(req.params.file, pack);
    res.json({ ok: true, count: pack.players.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/packs/:file/players/:index", async (req, res) => {
  try {
    const pack = await loadPack(req.params.file);
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= pack.players.length) {
      return res.status(400).json({ error: "invalid index" });
    }
    const [removed] = pack.players.splice(idx, 1);
    await savePack(req.params.file, pack);
    res.json({ ok: true, removed, count: pack.players.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizePlayer(row) {
  let career = row.career;
  if (typeof career === "string") {
    // Accept "years|club; years|club" as a plain-text shorthand from the UI/import.
    career = career
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [years, club] = s.split("|").map((x) => x.trim());
        return [years || "", club || ""];
      });
  }
  return {
    answer: String(row.answer || "").trim(),
    wiki: String(row.wiki || "").trim(),
    pos: String(row.pos || "").trim(),
    country: String(row.country || "").trim(),
    career: Array.isArray(career) ? career : [],
  };
}

// Bulk import from an uploaded spreadsheet. Expected columns (header row, any order):
// answer, wiki, pos, country, career (career as "years|club; years|club").
app.post("/api/packs/:file/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file uploaded" });
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const pack = await loadPack(req.params.file);
    const existingAnswers = new Set(pack.players.map((p) => p.answer));
    const added = [];
    const skipped = [];

    for (const row of rows) {
      const normalized = {
        answer: row.answer || row["שם"] || row["שם בעברית"] || row["Name"] || "",
        wiki: row.wiki || row["English"] || row["Name in English"] || row["שם באנגלית"] || "",
        pos: row.pos || row["עמדה"] || "",
        country: row.country || row["לאום"] || row["מדינה"] || "",
        career: row.career || row["קבוצות"] || "",
      };
      const player = normalizePlayer(normalized);
      if (!player.answer || !player.wiki) {
        skipped.push({ row, reason: "missing answer/wiki" });
        continue;
      }
      if (existingAnswers.has(player.answer)) {
        skipped.push({ row, reason: "duplicate answer already in pack" });
        continue;
      }
      pack.players.push(player);
      existingAnswers.add(player.answer);
      added.push(player);
    }

    await savePack(req.params.file, pack);
    res.json({ ok: true, added: added.length, skipped: skipped.length, skippedDetails: skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Admin panel running at http://localhost:${PORT}`);
});
