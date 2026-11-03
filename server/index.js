import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, nowIso } from "./db.js";
import { recommend, decorate, profile, arrondissement } from "./reco.js";
import { window as timeWindow } from "./time.js";
import { weatherFor } from "./weather.js";
import { GENRE_LABELS, VIBE_LABELS } from "./taxonomy.js";
import { HOME } from "./home.js";
import { startScheduler, refreshStatus } from "./refresh.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 5173);
const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// --- Identité : un cookie anonyme par appareil (les comptes viendront après) ---
app.use((req, res, next) => {
  const cookies = Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((x) => x[0]));
  let uid = cookies.uid;
  if (!uid || !/^[a-f0-9]{32}$/.test(uid)) {
    uid = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `uid=${uid}; Path=/; Max-Age=${3600 * 24 * 365 * 2}; SameSite=Lax; HttpOnly${PROD ? "; Secure" : ""}`);
  }
  db.prepare("INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)").run(uid, nowIso());
  req.uid = uid;
  next();
});

const api = express.Router();

api.get("/reco", async (req, res) => {
  const { when, with: w, vibe, budget, exclude } = req.query;
  const out = await recommend({ userId: req.uid, when, with: w || undefined, vibe: vibe || undefined, budget: budget || undefined, exclude: exclude ? String(exclude).split(",") : [] });
  // on note ce qui a été montré, pour apprendre et pour varier
  const ins = db.prepare("INSERT INTO interactions (user_id, event_id, action, ctx, ts) VALUES (?, ?, 'seen', ?, ?)");
  for (const p of out.picks) ins.run(req.uid, p.id, JSON.stringify({ when, with: w, vibe, budget, genre: p.genre, vibes: p.vibes }), nowIso());
  res.json(out);
});

// Catalogue par temps : tonight | tomorrow | weekend | week | ending | later
api.get("/events", async (req, res) => {
  const { when = "week", genre, free, q, page = 0 } = req.query;
  const win = timeWindow(when === "ending" ? "week" : when);
  const params = [win.end.toISOString(), win.start.toISOString()];
  let where = "e.noise = 0 AND t.keep = 1 AND o.start <= ? AND o.end >= ?";
  if (when === "ending") { where += " AND e.last_end <= ?"; params.push(win.end.toISOString()); }
  if (genre) { where += " AND t.genre = ?"; params.push(genre); }
  if (free) where += " AND t.price_min = 0";
  if (q) { where += " AND (e.title LIKE ? OR e.lead LIKE ? OR e.address_name LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = db.prepare(`
    SELECT e.*, t.genre, t.vibes, t.good_for, t.duration_min, t.price_min, t.price_max, t.hook, t.quality, t.source AS tag_source,
      min(o.start) AS occ_start, min(o.end) AS occ_end
    FROM occurrences o JOIN events e ON e.id = o.event_id JOIN tags t ON t.event_id = e.id
    WHERE ${where} GROUP BY e.id
    ORDER BY ${when === "ending" ? "e.last_end ASC" : "t.quality DESC, occ_start ASC"} LIMIT 40 OFFSET ?
  `).all(...params, Number(page) * 40);
  const saved = new Set(db.prepare("SELECT DISTINCT event_id FROM interactions WHERE user_id = ? AND action = 'saved'").all(req.uid).map((r) => r.event_id));
  res.json({ window: win.label, items: rows.map((r) => ({ ...decorate(r, win.start), saved: saved.has(r.id) })) });
});

api.get("/events/:id", (req, res) => {
  const id = Number(req.params.id);
  if (id < 0) {
    const h = HOME.find((x) => x.id === id);
    if (!h) return res.status(404).json({ error: "introuvable" });
    return res.json({ id: h.id, title: h.title, hook: h.hook, lead: h.detail, emoji: h.emoji, genre: "maison", genre_label: "Chez toi", vibes: h.vibes, good_for: h.good_for, when: `${h.duration_min} min`, price: h.cost || "Gratuit", home: true, occurrences: [] });
  }
  const e = db.prepare("SELECT e.*, t.genre, t.vibes, t.good_for, t.duration_min, t.price_min, t.price_max, t.hook, t.quality, t.source AS tag_source FROM events e JOIN tags t ON t.event_id = e.id WHERE e.id = ?").get(id);
  if (!e) return res.status(404).json({ error: "introuvable" });
  const occ = db.prepare("SELECT start, end FROM occurrences WHERE event_id = ? AND end >= ? ORDER BY start LIMIT 30").all(id, nowIso());
  const next = occ[0] || { start: e.first_start, end: e.last_end };
  const inter = db.prepare("SELECT action, max(ts) ts FROM interactions WHERE user_id = ? AND event_id = ? GROUP BY action").all(req.uid, id);
  res.json({ ...decorate({ ...e, occ_start: next.start, occ_end: next.end }, new Date()), description: e.description, occurrences: occ, me: Object.fromEntries(inter.map((i) => [i.action, i.ts])), price_detail: e.price_detail, audience: e.audience, phone: null });
});

// Actions : saved | unsaved | skip | done | later | hide
api.post("/interactions", (req, res) => {
  const { event_id, action, ctx } = req.body || {};
  const ok = ["saved", "unsaved", "skip", "done", "later", "hide"];
  if (!ok.includes(action) || typeof event_id !== "number") return res.status(400).json({ error: "action invalide" });
  if (action === "unsaved") {
    db.prepare("DELETE FROM interactions WHERE user_id = ? AND event_id = ? AND action IN ('saved','later')").run(req.uid, event_id);
  } else {
    let c = ctx || {};
    if (event_id < 0) { const h = HOME.find((x) => x.id === event_id); if (h) c = { ...c, genre: "maison", vibes: h.vibes }; }
    db.prepare("INSERT INTO interactions (user_id, event_id, action, ctx, ts) VALUES (?, ?, ?, ?, ?)").run(req.uid, event_id, action, JSON.stringify(c), nowIso());
  }
  res.json({ ok: true });
});

// Mes envies : sauvegardés, encore à venir, triés par urgence
api.get("/me", (req, res) => {
  const ids = db.prepare("SELECT event_id, max(ts) ts FROM interactions WHERE user_id = ? AND action IN ('saved','later') GROUP BY event_id ORDER BY ts DESC").all(req.uid);
  const unsaved = new Set(db.prepare("SELECT event_id FROM interactions WHERE user_id = ? AND action = 'unsaved'").all(req.uid).map((r) => r.event_id));
  const items = [];
  for (const { event_id } of ids) {
    if (event_id < 0) { const h = HOME.find((x) => x.id === event_id); if (h) items.push({ id: h.id, title: h.title, hook: h.hook, emoji: h.emoji, genre: "maison", genre_label: "Chez toi", home: true, when: `${h.duration_min} min`, price: h.cost || "Gratuit" }); continue; }
    const e = db.prepare("SELECT e.*, t.genre, t.vibes, t.good_for, t.duration_min, t.price_min, t.price_max, t.hook, t.quality, t.source AS tag_source FROM events e JOIN tags t ON t.event_id = e.id WHERE e.id = ?").get(event_id);
    if (!e) continue; // l'événement est passé et a disparu : la liste se purge seule
    const next = db.prepare("SELECT start, end FROM occurrences WHERE event_id = ? AND end >= ? ORDER BY start LIMIT 1").get(event_id, nowIso());
    if (!next) continue;
    items.push({ ...decorate({ ...e, occ_start: next.start, occ_end: next.end }, new Date()), saved: true });
  }
  items.sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999));
  const prof = profile(req.uid);
  const top = Object.entries(prof.genre).sort((a, b) => b[1] - a[1]).filter(([, w]) => w > 0).slice(0, 3).map(([g]) => GENRE_LABELS[g] || g);
  res.json({ items, profile: { n: prof.n, top_genres: top } });
});

api.get("/meta", async (req, res) => {
  const win = timeWindow("tonight");
  const wx = await weatherFor(win.start, win.end);
  const counts = db.prepare("SELECT count(*) c FROM events WHERE noise = 0").get().c;
  res.json({ genres: GENRE_LABELS, vibes: VIBE_LABELS, weather: wx, events: counts, updated: db.prepare("SELECT max(ingested_at) m FROM events").get().m, refresh: refreshStatus() });
});

app.use("/api", api);

if (PROD) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.use((req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa", root: path.join(__dirname, "..") });
  app.use(vite.middlewares);
}

app.listen(PORT, () => console.log(`Ce soir ? → http://localhost:${PORT} (${PROD ? "prod" : "dev"})`));
startScheduler();
