import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = join(__dirname, "data");
const LOG_FILE = join(DATA_DIR, "expeditions.json");
const MAX_ENTRIES = 25;

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

async function readLog() {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLog(entries) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LOG_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function sanitizeName(name) {
  return (
    String(name ?? "rider")
      .replace(/[^\w \-']/g, "")
      .trim()
      .slice(0, 18) || "rider"
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", game: "the-long-ride", time: new Date().toISOString() });
});

// Journal of completed expeditions (ranked by bond, then distance).
app.get("/api/expeditions", async (_req, res) => {
  res.json(await readLog());
});

app.post("/api/expeditions", async (req, res) => {
  const { name, horse, days, distanceKm, bond, waypoints, outcome } = req.body ?? {};
  const entry = {
    name: sanitizeName(name),
    horse: sanitizeName(horse ?? "companion"),
    days: Math.max(0, Math.floor(Number(days) || 0)),
    distanceKm: Math.max(0, Math.round(Number(distanceKm) || 0)),
    bond: Math.min(100, Math.max(0, Math.round(Number(bond) || 0))),
    waypoints: Math.max(0, Math.floor(Number(waypoints) || 0)),
    outcome: outcome === "lost" ? "lost" : "arrived",
    at: new Date().toISOString(),
  };
  const entries = await readLog();
  entries.push(entry);
  entries.sort((a, b) => b.bond - a.bond || b.distanceKm - a.distanceKm);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  await writeLog(trimmed);
  const rank = trimmed.indexOf(entry) + 1;
  res.status(201).json({ saved: true, rank: rank > 0 ? rank : null, log: trimmed });
});

app.listen(PORT, HOST, () => {
  console.log(`[the-long-ride] server listening on http://${HOST}:${PORT}`);
});
