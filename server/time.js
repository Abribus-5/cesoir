// Fenêtres temporelles en heure de Paris, sans dépendance.
const TZ = "Europe/Paris";

export function parisParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."].indexOf(p.weekday) };
}

// Décalage Paris/UTC à une date donnée (minutes), via le formatteur.
function offsetMinutes(d) {
  const p = parisParts(d);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - d.getTime()) / 60000 / 15) * 15;
}

// Construit une Date à partir d'une heure locale Paris.
export function parisDate(y, m, d, h = 0, min = 0) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60000);
}

export function dayKey(iso) {
  const p = parisParts(new Date(iso));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function hhmm(iso) {
  const p = parisParts(new Date(iso));
  return `${String(p.h).padStart(2, "0")}h${p.min ? String(p.min).padStart(2, "0") : ""}`;
}

// Retourne {start, end, label} pour une intention.
export function window(when, now = new Date()) {
  const p = parisParts(now);
  const today = (h, m) => parisDate(p.y, p.m, p.d, h, m);
  const addDays = (n) => { const x = new Date(today(12, 0).getTime() + n * 86400e3); const q = parisParts(x); return q; };
  if (when === "tomorrow") {
    const q = addDays(1);
    return { start: parisDate(q.y, q.m, q.d, 0, 0), end: parisDate(q.y, q.m, q.d, 23, 59), label: "demain" };
  }
  if (when === "weekend") {
    const toSat = p.wd === 0 ? -1 : (6 - p.wd); // dimanche : le weekend en cours
    const s = addDays(toSat), e = addDays(toSat + 1);
    const start = toSat <= 0 ? now : parisDate(s.y, s.m, s.d, 0, 0);
    return { start, end: parisDate(e.y, e.m, e.d, 23, 59), label: "ce weekend" };
  }
  if (when === "week") {
    const q = addDays(7);
    return { start: now, end: parisDate(q.y, q.m, q.d, 23, 59), label: "cette semaine" };
  }
  if (when === "later") {
    const q = addDays(7);
    return { start: parisDate(q.y, q.m, q.d, 0, 0), end: new Date(now.getTime() + 120 * 86400e3), label: "plus tard" };
  }
  // tonight (par défaut) : de maintenant à la fin de la journée ; avant 17h on parle de "aujourd'hui"
  return { start: now, end: today(23, 59), label: p.h < 17 ? "aujourd'hui" : "ce soir" };
}
