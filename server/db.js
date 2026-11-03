import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  lead TEXT,
  description TEXT,
  cover_url TEXT,
  url TEXT,
  address_name TEXT,
  address_street TEXT,
  zip TEXT,
  city TEXT,
  lat REAL,
  lon REAL,
  price_type TEXT,
  price_detail TEXT,
  access_type TEXT,
  access_link TEXT,
  indoor INTEGER,
  city_tags TEXT,
  audience TEXT,
  date_description TEXT,
  group_name TEXT,
  noise INTEGER DEFAULT 0,
  first_start TEXT,
  last_end TEXT,
  occurrence_count INTEGER DEFAULT 0,
  updated_at TEXT,
  ingested_at TEXT
);
CREATE TABLE IF NOT EXISTS occurrences (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  start TEXT NOT NULL,
  end TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS occ_start ON occurrences(start);
CREATE INDEX IF NOT EXISTS occ_event ON occurrences(event_id);
CREATE TABLE IF NOT EXISTS tags (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  keep INTEGER DEFAULT 1,
  keep_reason TEXT,
  genre TEXT,
  vibes TEXT,
  good_for TEXT,
  duration_min INTEGER,
  price_min INTEGER,
  price_max INTEGER,
  price_reduced INTEGER,
  hook TEXT,
  quality INTEGER,
  confidence INTEGER,
  source TEXT,
  source_updated_at TEXT,
  tagged_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  name TEXT
);
CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  ctx TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inter_user ON interactions(user_id, ts);
CREATE INDEX IF NOT EXISTS inter_event ON interactions(user_id, event_id);
`);

export const nowIso = () => new Date().toISOString();
