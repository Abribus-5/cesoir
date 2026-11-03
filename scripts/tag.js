// Tague les événements non encore tagués (ou modifiés depuis) : genre, vibes, pour qui, prix, accroche, désirabilité.
// Avec une clé Anthropic (ANTHROPIC_API_KEY ou profil `ant auth login`) : Claude Haiku 5.5.
// Sans clé : un tagging par règles à partir des tags de la Ville, moins fin mais suffisant pour tourner.
// Lancer : npm run tag          (TAGGER=rules pour forcer les règles, LIMIT=50 pour un essai)
import Anthropic from "@anthropic-ai/sdk";
import { db, nowIso } from "../server/db.js";
import { parsePrices } from "../server/text.js";
import { GENRES, VIBES, GOOD_FOR, DEFAULT_DURATION } from "../server/taxonomy.js";

const LIMIT = Number(process.env.LIMIT || 0);
const CONCURRENCY = 6;
const MODEL = "claude-haiku-5-5";

const pending = db.prepare(`
  SELECT e.* FROM events e LEFT JOIN tags t ON t.event_id = e.id
  WHERE e.noise = 0 AND (t.event_id IS NULL OR t.source_updated_at IS NOT e.updated_at OR (t.source = 'rules' AND ? = 'llm'))
  ORDER BY e.first_start
`);
const upsert = db.prepare(`
  INSERT INTO tags (event_id, keep, keep_reason, genre, vibes, good_for, duration_min, price_min, price_max, price_reduced, hook, quality, confidence, source, source_updated_at, tagged_at)
  VALUES (@event_id, @keep, @keep_reason, @genre, @vibes, @good_for, @duration_min, @price_min, @price_max, @price_reduced, @hook, @quality, @confidence, @source, @source_updated_at, @tagged_at)
  ON CONFLICT(event_id) DO UPDATE SET keep=excluded.keep, keep_reason=excluded.keep_reason, genre=excluded.genre, vibes=excluded.vibes,
    good_for=excluded.good_for, duration_min=excluded.duration_min, price_min=excluded.price_min, price_max=excluded.price_max,
    price_reduced=excluded.price_reduced, hook=excluded.hook, quality=excluded.quality, confidence=excluded.confidence,
    source=excluded.source, source_updated_at=excluded.source_updated_at, tagged_at=excluded.tagged_at
`);

// ---------- Tagging par règles ----------
const GENRE_FROM_CITY = [
  ["Humour", "humour"], ["Cirque", "spectacle"], ["Spectacle musical", "spectacle"], ["Concert", "concert"], ["Théâtre", "theatre"],
  ["Ecrans", "cinema"], ["Danse", "danse"], ["Expo", "expo"], ["Art contemporain", "expo"], ["Photo", "expo"], ["Peinture", "expo"],
  ["Balade urbaine", "balade"], ["Sport", "sport"], ["Gourmand", "gastronomie"], ["Nuit", "soiree"], ["Atelier", "atelier"],
  ["Conférence", "conference"], ["Littérature", "conference"], ["Histoire", "conference"], ["Sciences", "conference"], ["Loisirs", "jeux"], ["Enfants", "enfants"],
];
const VIBES_FROM_GENRE = { concert: ["festif"], theatre: ["curieux"], humour: ["festif", "chill"], expo: ["curieux", "chill"], cinema: ["chill"], danse: ["creatif"], conference: ["intello"], atelier: ["creatif"], balade: ["curieux", "bouger"], sport: ["bouger"], jeux: ["festif"], soiree: ["festif"], gastronomie: ["chill"], spectacle: ["curieux"], enfants: ["famille"], autre: ["curieux"] };
const EXCLUDE_RE = /groupe de parole|victimes|formation professionnelle|réunion d'information|permanence|assemblée générale|inscription scolaire|réservé aux adhérents/i;

function rulesTag(e) {
  const city = (e.city_tags || "").split(";");
  let genre = "autre";
  for (const [c, g] of GENRE_FROM_CITY) if (city.includes(c)) { genre = g; break; }
  const vibes = [...VIBES_FROM_GENRE[genre]];
  if (/Nuit/.test(e.city_tags || "")) vibes.push("festif");
  const good_for = genre === "enfants" ? ["famille"] : genre === "sport" || genre === "atelier" ? ["seul", "potes"] : ["seul", "couple", "potes"];
  if (["concert", "theatre", "humour", "cinema", "balade", "gastronomie", "soiree"].includes(genre)) good_for.push("date");
  const free = e.price_type === "gratuit" || e.price_type === "gratuit sous condition";
  const prices = free ? [0, 0] : parsePrices(e.price_detail);
  const bad = EXCLUDE_RE.test(e.title + " " + e.lead);
  const hook = (e.lead || "").replace(/\s+/g, " ").slice(0, 110).replace(/[,;:\s]+\S*$/, "") || e.title;
  return {
    keep: bad ? 0 : 1, keep_reason: bad ? "Pas une sortie (règle)" : null, genre, vibes: JSON.stringify([...new Set(vibes)].slice(0, 3)),
    good_for: JSON.stringify([...new Set(good_for)]), duration_min: DEFAULT_DURATION[genre],
    price_min: prices ? prices[0] : null, price_max: prices ? prices[1] : null, price_reduced: null,
    hook, quality: 3, confidence: 2, source: "rules",
  };
}

// ---------- Tagging LLM ----------
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["keep", "keep_reason", "genre", "vibes", "good_for", "duration_min", "price_full", "price_min", "price_reduced", "hook", "quality", "confidence"],
  properties: {
    keep: { type: "boolean" }, keep_reason: { type: "string" },
    genre: { type: "string", enum: GENRES },
    vibes: { type: "array", items: { type: "string", enum: VIBES }, minItems: 1, maxItems: 3 },
    good_for: { type: "array", items: { type: "string", enum: GOOD_FOR } },
    duration_min: { type: "integer" },
    price_full: { type: ["integer", "null"] }, price_min: { type: ["integer", "null"] }, price_reduced: { type: ["integer", "null"] },
    hook: { type: "string" }, quality: { type: "integer", minimum: 1, maximum: 5 }, confidence: { type: "integer", minimum: 1, maximum: 5 },
  },
};
const SYSTEM = `Tu tagues des événements parisiens pour une app qui répond à "je sais pas quoi faire ce soir". Réponds uniquement avec le JSON demandé.
Règles :
- keep=false si ce n'est pas une sortie qu'on proposerait à quelqu'un qui s'ennuie (groupe de parole, réunion interne, formation pro, activité réservée à un public très spécifique, activité réservée aux tout-petits). keep_reason en une phrase.
- genre : un seul. vibes : 1 à 3. good_for : seulement ce qui est vraiment adapté.
- duration_min : durée d'une séance ou d'une visite, pas de la période d'exposition.
- price_full : le plein tarif adulte en euros (entier), price_min : le prix le plus bas réellement accessible à tous (0 si gratuit), price_reduced : tarif réduit s'il existe. null si inconnu, ne jamais inventer.
- hook : une phrase d'accroche en français, 60 à 90 caractères, ton direct et chaleureux, sans point d'exclamation ni superlatif creux. Elle dit concrètement ce qu'on va vivre, elle ne répète pas le titre.
- quality : désirabilité pour un adulte parisien de 25 à 40 ans (5 = très désirable, 1 = anecdotique). confidence : ta confiance dans ce tagging.
Ne t'appuie que sur le texte fourni.`;

function eventPrompt(e) {
  return JSON.stringify({
    titre: e.title, accroche: e.lead, description: (e.description || "").slice(0, 1200), tags_ville: e.city_tags, public: e.audience,
    type_prix: e.price_type, detail_prix: (e.price_detail || "").slice(0, 300), dates: (e.date_description || "").slice(0, 200), nb_occurrences: e.occurrence_count, lieu: e.address_name, zip: e.zip,
  });
}

async function llmTag(client, e) {
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1024, system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: eventPrompt(e) }],
  });
  if (res.stop_reason === "refusal") throw new Error("refusal");
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const o = JSON.parse(text);
  return {
    keep: o.keep ? 1 : 0, keep_reason: o.keep_reason, genre: o.genre, vibes: JSON.stringify(o.vibes), good_for: JSON.stringify(o.good_for),
    duration_min: o.duration_min, price_min: o.price_min, price_max: o.price_full ?? o.price_min, price_reduced: o.price_reduced,
    hook: o.hook, quality: o.quality, confidence: o.confidence, source: "llm",
  };
}

async function main() {
  const wantLlm = process.env.TAGGER !== "rules" && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || process.env.TAGGER === "llm");
  let rows = pending.all(wantLlm ? "llm" : "rules");
  if (LIMIT) rows = rows.slice(0, LIMIT);
  console.log(`${rows.length} événements à taguer (${wantLlm ? "LLM " + MODEL : "règles"})`);
  let client = null;
  if (wantLlm) {
    client = new Anthropic();
    try { await client.models.retrieve(MODEL); } catch (err) { console.warn("Clé Anthropic inutilisable, repli sur les règles :", err.message); client = null; }
  }
  let done = 0, failed = 0;
  const save = (e, t) => upsert.run({ event_id: e.id, ...t, source_updated_at: e.updated_at, tagged_at: nowIso() });
  if (!client) { for (const e of rows) save(e, rulesTag(e)); console.log(`Tagging par règles : ${rows.length} événements.`); return; }
  const queue = [...rows];
  async function worker() {
    while (queue.length) {
      const e = queue.shift();
      try { save(e, await llmTag(client, e)); done++; }
      catch (err) { failed++; save(e, rulesTag(e)); if (failed <= 5) console.warn(`#${e.id} ${err.message} -> règles`); }
      if ((done + failed) % 100 === 0) console.log(`… ${done + failed}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Tagging LLM : ${done} ok, ${failed} repliés sur les règles.`);
}
main();
