// Météo Paris via Open-Meteo (gratuit, sans clé). Cache 30 minutes.
let cache = { at: 0, data: null };
const URL = "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&hourly=precipitation_probability,temperature_2m,weather_code&timezone=Europe%2FParis&forecast_days=4";

export async function getWeather() {
  if (Date.now() - cache.at < 30 * 60e3 && cache.data) return cache.data;
  try {
    const res = await fetch(URL);
    const j = await res.json();
    const hours = j.hourly.time.map((t, i) => ({ t, rain: j.hourly.precipitation_probability[i], temp: j.hourly.temperature_2m[i], code: j.hourly.weather_code[i] }));
    cache = { at: Date.now(), data: hours };
  } catch (e) {
    if (!cache.data) cache.data = [];
  }
  return cache.data;
}

// Résumé sur une fenêtre : proba de pluie max, température moyenne.
export async function weatherFor(start, end) {
  const hours = await getWeather();
  const s = start.getTime(), e = end.getTime();
  const inWin = hours.filter((h) => { const t = Date.parse(h.t + ":00+01:00"); return t >= s - 3600e3 && t <= e; });
  if (!inWin.length) return null;
  const rain = Math.max(...inWin.map((h) => h.rain ?? 0));
  const temp = Math.round(inWin.reduce((a, h) => a + (h.temp ?? 0), 0) / inWin.length);
  return { rain, temp, rainy: rain >= 50, cold: temp <= 5 };
}
