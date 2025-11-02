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
const PORT = process.env.PORT || 5174;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"], // Vite dev
    credentials: false,
  })
);
app.use(express.json());
app.use(morgan("dev"));

// data file
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

// health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "workflow-api" });
});

// list
app.get("/api/items", async (_req, res, next) => {
  try {
    res.json(await readItems());
  } catch (e) {
    next(e);
  }
});

// create
app.post("/api/items", async (req, res, next) => {
  try {
    const payload = req.body || {};
    const id =
      payload.id ||
      `W-${Math.floor(Math.random() * 9000 + 1000).toString()}`;
    const items = await readItems();
    const newItem = { ...payload, id };
    items.push(newItem);
    await writeItems(items);
    res.status(201).json(newItem);
  } catch (e) {
    next(e);
  }
});

// update
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

// delete
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

// basic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
