// Le moteur : trois recos (deux dans tes goûts, une à côté) pour un contexte donné.
import { db } from "./db.js";
import { window as timeWindow, hhmm, dayKey } from "./time.js";
import { weatherFor } from "./weather.js";
import { GENRE_LABELS } from "./taxonomy.js";
import { homeIdeas } from "./home.js";

const ACTION_WEIGHT = { done: 3, saved: 2, later: 1, seen: -0.15, skip: -2, hide: -3 };

// Profil = poids par genre et par vibe, appris des interactions.
export function profile(userId) {
  const rows = db.prepare(`
    SELECT i.action, t.genre, t.vibes FROM interactions i JOIN tags t ON t.event_id = i.event_id WHERE i.user_id = ?
    UNION ALL SELECT i.action, json_extract(i.ctx, '$.genre'), json_extract(i.ctx, '$.vibes') FROM interactions i WHERE i.user_id = ? AND i.event_id < 0
  `).all(userId, userId);
  const genre = {}, vibe = {};
  let n = 0;
  for (const r of rows) {
    const w = ACTION_WEIGHT[r.action] ?? 0;
    if (!w) continue;
    n++;
    if (r.genre) genre[r.genre] = (genre[r.genre] || 0) + w;
    for (const v of safeJson(r.vibes)) vibe[v] = (vibe[v] || 0) + w * 0.6;
  }
  return { genre, vibe, n };
}

const safeJson = (s) => { try { return JSON.parse(s || "[]") || []; } catch { return []; } };
const squash = (x) => Math.tanh(x / 4) * 2; // borne l'affinité à [-2, 2]

function candidatesFor(win, excludeIds) {
  const rows = db.prepare(`
    SELECT e.*, t.genre, t.vibes, t.good_for, t.duration_min, t.price_min, t.price_max, t.hook, t.quality, t.source AS tag_source,
      o.start AS occ_start, o.end AS occ_end
    FROM occurrences o JOIN events e ON e.id = o.event_id JOIN tags t ON t.event_id = e.id
    WHERE e.noise = 0 AND t.keep = 1 AND o.start <= ? AND o.end >= ?
    ORDER BY o.start
  `).all(win.end.toISOString(), new Date(win.start.getTime() + 30 * 60e3).toISOString());
  // une seule occurrence par événement (la première qui tombe dans la fenêtre)
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.id) || excludeIds.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function userHistory(userId) {
  const rows = db.prepare("SELECT event_id, action, max(ts) ts FROM interactions WHERE user_id = ? GROUP BY event_id, action").all(userId);
  const h = {};
  for (const r of rows) (h[r.event_id] ||= {})[r.action] = r.ts;
  return h;
}

export function score(c, ctx, prof, hist, wx) {
  const vibes = safeJson(c.vibes), goodFor = safeJson(c.good_for);
  let s = (c.quality ?? 3) * 1.0;
  if (c.tag_source === "rules") s -= 0.3; // tagué grossièrement : un peu moins de confiance
  // affinité apprise
  s += squash((prof.genre[c.genre] || 0) + vibes.reduce((a, v) => a + (prof.vibe[v] || 0), 0));
  // contexte explicite
  if (ctx.with && goodFor.length) s += goodFor.includes(ctx.with) ? 1 : -1.5;
  if (ctx.vibe) s += vibes.includes(ctx.vibe) ? 1.5 : -0.5;
  if (ctx.budget === "free") s += c.price_min === 0 ? 1 : c.price_min == null ? -1 : -4;
  else if (ctx.budget === "cheap") s += c.price_min != null && c.price_min <= 20 ? 0.5 : c.price_min == null ? -0.3 : -2;
  // météo
  if (wx?.rainy && c.indoor === 0) s -= 2.5;
  if (wx?.cold && c.indoor === 0) s -= 1;
  // urgence
  const daysLeft = (Date.parse(c.last_end) - Date.now()) / 86400e3;
  if (daysLeft <= 7) s += 1;
  if (c.occurrence_count === 1) s += 0.5;
  // historique
  const h = hist[c.id] || {};
  if (h.hide || h.skip) s -= 6;
  if (h.done) s -= 4;
  if (h.saved) s += 2.5;
  if (h.seen) s -= 0.6;
  // un peu de variété d'un jour à l'autre
  s += ((c.id * 9301 + dayKey(new Date().toISOString()).length * 49297) % 233) / 233 * 0.4;
  return s;
}

export function decorate(c, floor = null) {
  let start = c.occ_start;
  const end = c.occ_end;
  // Une occurrence qui a commencé avant la fenêtre (expo en cours) s'affiche au jour de la fenêtre.
  const spansDays = Date.parse(end) - Date.parse(start) >= 20 * 3600e3;
  const allDay = hhmm(start) === "00h" && (hhmm(end) === "23h59" || hhmm(end) === "00h");
  if (floor && Date.parse(start) < floor.getTime()) start = floor.toISOString();
  const whenLabel = allDay ? "Toute la journée" : spansDays ? "Sur plusieurs jours" : `${hhmm(start)}${end ? " – " + hhmm(end) : ""}`;
  const price = c.price_min == null ? (c.price_type === "gratuit" ? "Gratuit" : c.price_type === "gratuit sous condition" ? "Gratuit sur inscription" : "Prix non précisé")
    : c.price_min === 0 && (c.price_max ?? 0) === 0 ? "Gratuit" : c.price_min === c.price_max || c.price_max == null ? `${c.price_min} €` : `${c.price_min} à ${c.price_max} €`;
  const daysLeft = Math.ceil((Date.parse(c.last_end) - Date.now()) / 86400e3);
  return {
    id: c.id, title: c.title, hook: c.hook || c.lead, lead: c.lead, cover: c.cover_url, url: c.url,
    genre: c.genre, genre_label: GENRE_LABELS[c.genre] || c.genre, vibes: safeJson(c.vibes), good_for: safeJson(c.good_for),
    place: c.address_name, street: c.address_street, zip: c.zip, city: c.city, lat: c.lat, lon: c.lon, arr: arrondissement(c.zip, c.city),
    indoor: c.indoor, price, price_min: c.price_min, price_max: c.price_max, access: c.access_type, booking_url: c.access_link,
    when: whenLabel, day: dayKey(start), start, end, ongoing: spansDays,
    duration_min: c.duration_min, ends_soon: daysLeft <= 7, days_left: daysLeft, last_day: dayKey(c.last_end), one_off: c.occurrence_count === 1,
    date_description: c.date_description, tag_source: c.tag_source,
  };
}

export function arrondissement(zip, city) {
  if (!zip) return city || "";
  if (/^75\d{3}$/.test(zip)) { const n = Number(zip.slice(3)); if (zip === "75116") return "16e"; return n === 1 ? "1er" : `${n}e`; }
  return city || zip;
}

export async function recommend({ userId, when = "tonight", with: withWho, vibe, budget, exclude = [] }) {
  const win = timeWindow(when);
  const wx = await weatherFor(win.start, win.end);
  const prof = profile(userId);
  const hist = userHistory(userId);
  const ctx = { with: withWho, vibe, budget };
  const excl = new Set(exclude.map(Number));
  const cands = candidatesFor(win, excl);
  const scored = cands.map((c) => ({ c, s: score(c, ctx, prof, hist, wx) })).sort((a, b) => b.s - a.s);

  const picks = [];
  const usedGenres = new Set();
  // Deux recos "dans tes goûts" : on évite deux fois le même genre
  for (const x of scored) {
    if (picks.length >= 2) break;
    if (usedGenres.has(x.c.genre)) continue;
    picks.push({ ...decorate(x.c), why: "pour_toi", score: x.s });
    usedGenres.add(x.c.genre);
  }
  // La troisième : à côté de la zone de confort. Genre différent, pas (ou peu) aimé, mais désirable.
  const favGenres = Object.entries(prof.genre).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  const far = scored.filter((x) => !usedGenres.has(x.c.genre) && !favGenres.includes(x.c.genre) && (x.c.quality ?? 3) >= 3 && !(hist[x.c.id]?.skip || hist[x.c.id]?.hide));
  if (far.length) {
    // on reste proche sur le reste du contexte : le score tient déjà compte du budget, de la météo, de l'horaire
    const pick = far[Math.floor(Math.random() * Math.min(3, far.length))];
    picks.push({ ...decorate(pick.c), why: "a_cote", score: pick.s });
  } else if (scored.length > picks.length) {
    const next = scored.find((x) => !picks.some((p) => p.id === x.c.id));
    if (next) picks.push({ ...decorate(next.c), why: "pour_toi", score: next.s });
  }
  // Chez soi : s'il pleut, s'il est tard, ou s'il n'y a rien, une idée maison remplace ou complète.
  const p = new Date();
  const lateTonight = when === "tonight" && new Date().getHours() >= 21;
  if (when === "home" || picks.length < 3 || wx?.rainy || lateTonight) {
    const ideas = homeIdeas({ with: withWho, vibe, exclude: excl, prof, hist, count: when === "home" ? 3 : 1 });
    if (when === "home") return { window: win.label, weather: wx, picks: ideas, profile_size: prof.n };
    if (ideas.length) picks.splice(Math.min(2, picks.length), picks.length >= 3 ? 1 : 0, ideas[0]);
  }
  return { window: win.label, weather: wx, picks: picks.slice(0, 3), profile_size: prof.n, candidates: cands.length };
}
