import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = join(__dirname, "data");
const SCORES_FILE = join(DATA_DIR, "scores.json");
const MAX_SCORES = 20;

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

async function readScores() {
  try {
    const raw = await readFile(SCORES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeScores(scores) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SCORES_FILE, JSON.stringify(scores, null, 2), "utf8");
}

function sanitizeName(name) {
  return String(name ?? "anon")
    .replace(/[^\w \-]/g, "")
    .trim()
    .slice(0, 16) || "anon";
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", game: "cr4ck_em_4ll", time: new Date().toISOString() });
});

app.get("/api/scores", async (_req, res) => {
  const scores = await readScores();
  res.json(scores);
});

app.post("/api/scores", async (req, res) => {
  const { name, score, level, attempts } = req.body ?? {};
  const numScore = Number(score);
  if (!Number.isFinite(numScore) || numScore < 0) {
    return res.status(400).json({ error: "invalid score" });
  }
  const entry = {
    name: sanitizeName(name),
    score: Math.floor(numScore),
    level: Math.max(1, Math.floor(Number(level) || 1)),
    attempts: Math.max(0, Math.floor(Number(attempts) || 0)),
    at: new Date().toISOString(),
  };
  const scores = await readScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_SCORES);
  await writeScores(trimmed);
  const rank = trimmed.findIndex((s) => s === entry) + 1;
  res.status(201).json({ saved: true, rank: rank > 0 ? rank : null, top: trimmed });
});

app.listen(PORT, HOST, () => {
  console.log(`[cr4ck_em_4ll] server listening on http://${HOST}:${PORT}`);
});
