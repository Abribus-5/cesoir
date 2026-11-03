// Idées maison : un petit catalogue curé, servi par le même moteur quand il pleut, qu'il est tard, ou que tu n'as pas envie de sortir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HOME = JSON.parse(fs.readFileSync(path.join(__dirname, "home-ideas.json"), "utf8"));

const safeJson = (s) => { try { return JSON.parse(s || "[]") || []; } catch { return []; } };

export function homeIdeas({ with: withWho, vibe, exclude, prof, hist, count = 1 }) {
  const scored = HOME.filter((h) => !exclude.has(h.id)).map((h) => {
    let s = h.quality;
    if (withWho) s += h.good_for.includes(withWho) ? 1 : -2;
    if (vibe) s += h.vibes.includes(vibe) ? 1.5 : -0.5;
    s += h.vibes.reduce((a, v) => a + (prof.vibe[v] || 0) * 0.3, 0);
    const hh = hist[h.id] || {};
    if (hh.skip || hh.hide) s -= 6;
    if (hh.done) s -= 2;
    if (hh.saved) s += 2;
    if (hh.seen) s -= 0.6;
    s += Math.random() * 1.2;
    return { h, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, count).map(({ h, s }) => ({
    id: h.id, title: h.title, hook: h.hook, lead: h.detail, cover: null, emoji: h.emoji, genre: "maison", genre_label: "Chez toi",
    vibes: h.vibes, good_for: h.good_for, when: `${h.duration_min} min`, price: h.cost || "Gratuit", duration_min: h.duration_min,
    home: true, why: "maison", score: s,
  }));
}
