// Récupère l'export complet de "Que Faire à Paris" et le charge dans SQLite.
// Lancer : npm run ingest
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, nowIso } from "../server/db.js";
import { stripHtml } from "../server/text.js";
import { parisDate } from "../server/time.js";

const EXPORT_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/exports/json";
const NOISE_GROUPS = new Set(["Bibliothèques", "Conservatoires", "Activités DJS", "Centres d'animations"]);

// L'API encode l'heure locale de Paris avec un décalage +02:00 fixe, faux en hiver.
// On garde l'heure "murale" et on la réinterprète en heure de Paris.
function toParisIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  return parisDate(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString();
}

function parseOccurrences(raw) {
  const out = [];
  for (const seg of String(raw || "").split(";")) {
    const [a, b] = seg.split("_").map(toParisIso);
    if (a && b) out.push([a, b]);
  }
  return out;
}

function isNoise(r) {
  const tags = r.qfap_tags || "";
  if (NOISE_GROUPS.has(r.group)) return 1;
  if (/^Enfants(;|$)/.test(tags) || /;Enfants(;|$)/.test(tags)) return 1;
  if (/^Public tout-petits/.test(r.audience || "")) return 1;
  return 0;
}

async function fetchExport() {
  const cache = path.join(DATA_DIR, "raw.json");
  if (process.env.USE_CACHE && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  console.log("Téléchargement de l'export Que Faire à Paris…");
  const res = await fetch(EXPORT_URL);
  if (!res.ok) throw new Error(`export HTTP ${res.status}`);
  const json = await res.json();
  fs.writeFileSync(cache, JSON.stringify(json));
  return json;
}

const upsertEvent = db.prepare(`
INSERT INTO events (id, title, lead, description, cover_url, url, address_name, address_street, zip, city, lat, lon,
  price_type, price_detail, access_type, access_link, indoor, city_tags, audience, date_description, group_name, noise,
  first_start, last_end, occurrence_count, updated_at, ingested_at)
VALUES (@id, @title, @lead, @description, @cover_url, @url, @address_name, @address_street, @zip, @city, @lat, @lon,
  @price_type, @price_detail, @access_type, @access_link, @indoor, @city_tags, @audience, @date_description, @group_name, @noise,
  @first_start, @last_end, @occurrence_count, @updated_at, @ingested_at)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, lead=excluded.lead, description=excluded.description, cover_url=excluded.cover_url, url=excluded.url,
  address_name=excluded.address_name, address_street=excluded.address_street, zip=excluded.zip, city=excluded.city,
  lat=excluded.lat, lon=excluded.lon, price_type=excluded.price_type, price_detail=excluded.price_detail,
  access_type=excluded.access_type, access_link=excluded.access_link, indoor=excluded.indoor, city_tags=excluded.city_tags,
  audience=excluded.audience, date_description=excluded.date_description, group_name=excluded.group_name, noise=excluded.noise,
  first_start=excluded.first_start, last_end=excluded.last_end, occurrence_count=excluded.occurrence_count,
  updated_at=excluded.updated_at, ingested_at=excluded.ingested_at
`);
const delOcc = db.prepare("DELETE FROM occurrences WHERE event_id = ?");
const insOcc = db.prepare("INSERT INTO occurrences (event_id, start, end) VALUES (?, ?, ?)");

const run = db.transaction((rows) => {
  const seen = new Set();
  let kept = 0;
  const now = nowIso();
  for (const r of rows) {
    let occ = parseOccurrences(r.occurrences);
    if (!occ.length && r.date_start && r.date_end) { const a = toParisIso(r.date_start), b = toParisIso(r.date_end); if (a && b) occ = [[a, b]]; }
    if (!occ.length) continue;
    occ.sort((a, b) => a[0].localeCompare(b[0]));
    const lastEnd = occ.reduce((m, o) => (o[1] > m ? o[1] : m), occ[0][1]);
    if (Date.parse(lastEnd) < Date.now() - 86400e3) continue; // déjà passé
    const id = Number(r.id);
    seen.add(id);
    kept++;
    upsertEvent.run({
      id,
      title: stripHtml(r.title),
      lead: stripHtml(r.lead_text),
      description: stripHtml(r.description),
      cover_url: r.cover_url,
      url: r.url,
      address_name: r.address_name,
      address_street: r.address_street,
      zip: r.address_zipcode,
      city: r.address_city,
      lat: r.lat_lon?.lat ?? null,
      lon: r.lat_lon?.lon ?? null,
      price_type: r.price_type,
      price_detail: stripHtml(r.price_detail),
      access_type: r.access_type,
      access_link: r.access_link,
      indoor: r.event_indoor == null ? null : Number(r.event_indoor),
      city_tags: r.qfap_tags,
      audience: r.audience,
      date_description: stripHtml(r.date_description),
      group_name: r.group,
      noise: isNoise(r),
      first_start: occ[0][0],
      last_end: lastEnd,
      occurrence_count: occ.length,
      updated_at: r.updated_at,
      ingested_at: now,
    });
    delOcc.run(id);
    for (const [a, b] of occ) insOcc.run(id, a, b);
  }
  // Les événements absents de l'export ont disparu du site : on les retire.
  const ids = db.prepare("SELECT id FROM events").all().map((x) => x.id);
  let removed = 0;
  const del = db.prepare("DELETE FROM events WHERE id = ?");
  for (const id of ids) if (!seen.has(id)) { del.run(id); removed++; }
  return { kept, removed };
});

const rows = await fetchExport();
const { kept, removed } = run(rows);
const noise = db.prepare("SELECT count(*) c FROM events WHERE noise=1").get().c;
console.log(`Ingestion : ${kept} événements (${noise} marqués bruit), ${removed} retirés.`);
