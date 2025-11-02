import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "items.json");

const app = express();
app.use(express.json());

// tiny helper to read/write JSON file
function readItems() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
function writeItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

// GET all items
app.get("/api/items", (req, res) => {
  const items = readItems();
  res.json(items);
});

// PATCH item by id (partial update)
app.patch("/api/items/:id", (req, res) => {
  const id = req.params.id;
  const patch = req.body; // {assignee?, status?, startTime?, endTime?, spentMs? ...}
  const items = readItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const updated = { ...items[idx], ...patch };
  items[idx] = updated;
  writeItems(items);
  res.json(updated);
});

// POST a comment
app.post("/api/items/:id/comments", (req, res) => {
  const id = req.params.id;
  const { ts, author, text } = req.body || {};
  if (!text) return res.status(400).json({ error: "Comment text required" });
  const items = readItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const it = items[idx];
  const comments = it.comments || [];
  comments.push({ ts: ts ?? Date.now(), author: author ?? "unknown", text: text.trim() });
  items[idx] = { ...it, comments };
  writeItems(items);
  res.json(items[idx]);
});

// Transition helper (optional): validate a -> b on the server later.
// For now we just accept a requested status and timing fields.
app.post("/api/items/:id/transition", (req, res) => {
  const id = req.params.id;
  const { status, startTime, endTime, spentMs } = req.body || {};
  if (!status) return res.status(400).json({ error: "status required" });
  const items = readItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const updated = {
    ...items[idx],
    status,
    ...(startTime !== undefined ? { startTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    ...(spentMs !== undefined ? { spentMs } : {})
  };
  items[idx] = updated;
  writeItems(items);
  res.json(updated);
});

const PORT = process.env.PORT || 5174; // dev API on 5174
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
