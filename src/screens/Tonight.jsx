import React, { useEffect, useState, useCallback } from "react";
import { get, act } from "../api.js";
import Chips from "../components/Chips.jsx";
import { BigCard } from "../components/EventCard.jsx";

const WHEN = [["tonight", "Ce soir"], ["tomorrow", "Demain"], ["weekend", "Ce weekend"], ["home", "Chez moi"]];
const WITH = [["seul", "Seul·e"], ["couple", "À deux"], ["potes", "Potes"], ["date", "Date"], ["famille", "Famille"]];
const VIBE = [["chill", "Chill"], ["curieux", "Curieux"], ["festif", "Festif"], ["bouger", "Bouger"], ["intello", "Intello"], ["creatif", "Créatif"], ["frisson", "Frisson"]];
const BUDGET = [["free", "Gratuit"], ["cheap", "< 20 €"]];

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export default function Tonight() {
  const [when, setWhen] = useState(() => load("ctx.when", "tonight"));
  const [who, setWho] = useState(() => load("ctx.with", null));
  const [vibe, setVibe] = useState(() => load("ctx.vibe", null));
  const [budget, setBudget] = useState(() => load("ctx.budget", null));
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState([]);
  const [shown, setShown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => { localStorage.setItem("ctx.when", JSON.stringify(when)); localStorage.setItem("ctx.with", JSON.stringify(who)); localStorage.setItem("ctx.vibe", JSON.stringify(vibe)); localStorage.setItem("ctx.budget", JSON.stringify(budget)); }, [when, who, vibe, budget]);

  const fetchReco = useCallback(async (exclude = []) => {
    setLoading(true); setErr(null);
    try {
      const r = await get("/reco", { when, with: who, vibe, budget, exclude: exclude.join(",") });
      setData(r);
      setPicks(r.picks);
      setShown((s) => [...s, ...r.picks.map((p) => p.id)]);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [when, who, vibe, budget]);

  useEffect(() => { setShown([]); fetchReco([]); }, [fetchReco]);

  const ctx = { when, with: who, vibe, budget };
  const onSave = async (e) => {
    setPicks((ps) => ps.map((p) => (p.id === e.id ? { ...p, saved: !p.saved } : p)));
    await act(e.id, e.saved ? "unsaved" : "saved", ctx);
  };
  const onSkip = async (e) => {
    await act(e.id, "skip", ctx);
    // on remplace la carte par une autre du même type
    const r = await get("/reco", { when, with: who, vibe, budget, exclude: [...shown, e.id].join(",") });
    const repl = r.picks.find((p) => p.why === e.why) || r.picks[0];
    setPicks((ps) => ps.map((p) => (p.id === e.id ? (repl || null) : p)).filter(Boolean));
    if (repl) setShown((s) => [...s, repl.id]);
  };

  const wx = data?.weather;
  const wxLine = wx ? `${wx.temp}°${wx.rainy ? ", pluie probable" : wx.rain >= 25 ? ", risque d'averses" : ", pas de pluie"}` : null;

  return (
    <div className="tonight">
      <header className="top">
        <h1>{when === "home" ? "Chez toi ?" : when === "tomorrow" ? "Demain ?" : when === "weekend" ? "Ce weekend ?" : "Ce soir ?"}</h1>
        {wxLine && when !== "home" && <p className="sub">Paris, {wxLine}</p>}
      </header>
      <section className="context">
        <Chips options={WHEN} value={when} onChange={(v) => setWhen(v || "tonight")} allowNone={false} />
        <Chips options={WITH} value={who} onChange={setWho} />
        <Chips options={VIBE} value={vibe} onChange={setVibe} />
        {when !== "home" && <Chips options={BUDGET} value={budget} onChange={setBudget} />}
      </section>
      {err && <p className="empty">Impossible de charger les idées. {err}</p>}
      {loading && !picks.length && <div className="skeletons"><div className="sk" /><div className="sk" /><div className="sk" /></div>}
      <section className="picks">
        {picks.map((p) => <BigCard key={p.id} e={p} onSave={onSave} onSkip={onSkip} showDay={when === "weekend"} />)}
      </section>
      {!loading && !picks.length && !err && <p className="empty">Rien trouvé avec ces filtres. Enlève une puce ou deux.</p>}
      {picks.length > 0 && (
        <div className="more">
          <button type="button" className="btn big" disabled={loading} onClick={() => fetchReco(shown)}>{loading ? "…" : "Autres idées"}</button>
          {data?.profile_size === 0 && <p className="hint">Plus tu gardes ou écartes d'idées, plus elles te ressemblent.</p>}
        </div>
      )}
    </div>
  );
}
