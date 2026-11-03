// Petits utilitaires texte partagés par l'ingestion, le tagging et l'API.
const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&eacute;": "é", "&egrave;": "è", "&agrave;": "à" };

export function stripHtml(s) {
  if (!s) return "";
  let t = String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? " ");
  t = t.replace(/ /g, " ");
  return t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// Extrait les montants en euros d'un texte de prix libre. Retourne [min, max] ou null.
export function parsePrices(text) {
  const t = stripHtml(text).replace(/,/g, ".");
  const found = [];
  const re = /(\d{1,3}(?:\.\d{1,2})?)\s*(?:€|euros?|eur\b)/gi;
  let m;
  while ((m = re.exec(t))) found.push(parseFloat(m[1]));
  // "de 0 à 19 euros" : le "0" n'est pas suivi de € mais compte quand même
  const range = /de\s+(\d{1,3}(?:\.\d{1,2})?)\s*(?:€|euros?)?\s*(?:à|a|-)\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:€|euros?)/i.exec(t);
  if (range) found.push(parseFloat(range[1]), parseFloat(range[2]));
  if (!found.length) return null;
  return [Math.floor(Math.min(...found)), Math.ceil(Math.max(...found))];
}
