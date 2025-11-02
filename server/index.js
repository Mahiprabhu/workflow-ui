// server/index.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Respect host environment port, default to dev port
const PORT = process.env.PORT || 5174;

/* --------------------------- CORS (flexible) --------------------------- */
/**
 * In production, Amplify will proxy /api/... to your API host so the browser
 * origin will be your Amplify app itself. CORS won’t be needed then, but it
 * doesn’t hurt to keep it liberal.
 *
 * You can also add your own domains via env:
 *   ALLOWED_ORIGINS="https://app.example.com,https://www.example.com"
 */
const extraOrigins =
  process.env.ALLOWED_ORIGINS?.split(",").map(s => s.trim()).filter(Boolean) || [];

const corsOrigin = (origin, cb) => {
  // Allow SSR, curl, health checks (no origin)
  if (!origin) return cb(null, true);

  const allowList = [
    "http://localhost:5173",
    // If your Amplify app uses a custom domain, add it here or via env
    ...extraOrigins,
  ];

  // Allow any *.amplifyapp.com
  const isAmplify = /\.amplifyapp\.com$/.test(new URL(origin).hostname);

  if (allowList.includes(origin) || isAmplify) return cb(null, true);
  return cb(null, false);
};

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  })
);

app.use(express.json());

// Only log in dev to keep prod clean; flip if you like
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* ------------------------------ Data file ------------------------------ */
const DATA_FILE = path.join(__dirname, "items.json");

async function readItems() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function writeItems(items) {
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), "utf8");
}

/* -------------------------------- Health ------------------------------- */
// Convenience health (useful for platform health checks)
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "workflow-api", time: Date.now() });
});

// API health (the one we typically wire to)
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "workflow-api", time: Date.now() });
});

/* ------------------------------- API CRUD ------------------------------ */
// GET /api/items
app.get("/api/items", async (_req, res, next) => {
  try {
    res.json(await readItems());
  } catch (e) {
    next(e);
  }
});

// POST /api/items
app.post("/api/items", async (req, res, next) => {
  try {
    const payload = req.body || {};
    const id =
      payload.id ||
      `W-${Math.floor(Math.random() * 9000 + 1000).toString()}`;

    // You can ensure some defaults if not provided
    const newItem = {
      id,
      title: payload.title ?? "Untitled",
      assignee: payload.assignee ?? null,
      status: payload.status ?? "ch_review",
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
      spentMs: payload.spentMs ?? 0,
      comments: payload.comments ?? [],
      receivedDate: payload.receivedDate ?? Date.now(),
      loggedDate: payload.loggedDate ?? Date.now(),
    };

    const items = await readItems();
    items.push(newItem);
    await writeItems(items);
    res.status(201).json(newItem);
  } catch (e) {
    next(e);
  }
});

// PUT /api/items/:id
app.put("/api/items/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const items = await readItems();
    const idx = items.findIndex((i) => String(i.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const updated = { ...items[idx], ...patch };
    items[idx] = updated;
    await writeItems(items);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/items/:id
app.delete("/api/items/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const items = await readItems();
    const nextItems = items.filter((i) => String(i.id) !== String(id));
    await writeItems(nextItems);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/* ------------------------- 404 for unknown /api/* ----------------------- */
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* ------------------------------ Error handler -------------------------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

/* -------------------------------- Listen ------------------------------- */
// Bind on 0.0.0.0 so hosted platforms can reach it
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
