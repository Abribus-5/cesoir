// Rafraîchissement des données intégré au serveur : pas besoin de cron côté hébergeur.
// - au démarrage, si la base est vide, on charge tout de suite ;
// - ensuite chaque nuit à REFRESH_HOUR (heure de Paris, 4h par défaut).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { parisParts } from "./time.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HOUR = Number(process.env.REFRESH_HOUR ?? 4);
let running = false, lastRun = null, lastResult = null;

function runScript(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", name)], { stdio: "inherit", env: process.env });
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function refresh(reason = "manuel") {
  if (running) return false;
  running = true;
  console.log(`[refresh] démarrage (${reason})`);
  const t0 = Date.now();
  const ok = (await runScript("ingest.js")) && (await runScript("tag.js"));
  running = false; lastRun = new Date().toISOString(); lastResult = ok ? "ok" : "erreur";
  console.log(`[refresh] ${lastResult} en ${Math.round((Date.now() - t0) / 1000)} s`);
  return ok;
}

export function refreshStatus() { return { running, lastRun, lastResult }; }

export function startScheduler() {
  if (process.env.NO_SCHEDULER) return;
  const count = db.prepare("SELECT count(*) c FROM events").get().c;
  if (count === 0) refresh("base vide");
  setInterval(() => {
    const p = parisParts();
    const sinceLast = lastRun ? Date.now() - Date.parse(lastRun) : Infinity;
    if (p.h === HOUR && sinceLast > 20 * 3600e3) refresh("nocturne");
  }, 10 * 60e3);
}
