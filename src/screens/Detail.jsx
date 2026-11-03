import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { get, act, dayLabel } from "../api.js";

function occLabel(o) {
  const d = new Date(o.start), e = new Date(o.end);
  const hm = (x) => `${String(x.getHours()).padStart(2, "0")}h${x.getMinutes() ? String(x.getMinutes()).padStart(2, "0") : ""}`;
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const allDay = hm(d) === "00h" && (hm(e) === "23h59" || hm(e) === "00h");
  return `${dayLabel(key)} · ${allDay ? "toute la journée" : `${hm(d)} – ${hm(e)}`}`;
}

export default function Detail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const [me, setMe] = useState({});
  useEffect(() => { get(`/events/${id}`).then((r) => { setE(r); setMe(r.me || {}); }); }, [id]);
  if (!e) return <div className="detail"><div className="skeletons"><div className="sk" /></div></div>;

  const saved = !!(me.saved || me.later) && !me.unsaved;
  const toggle = async (action) => {
    if (action === "saved" && saved) { await act(e.id, "unsaved"); setMe((m) => ({ ...m, saved: null, later: null })); return; }
    await act(e.id, action); setMe((m) => ({ ...m, [action]: new Date().toISOString() }));
    if (action === "hide") nav(-1);
  };
  const maps = e.lat ? `https://maps.apple.com/?daddr=${e.lat},${e.lon}` : null;

  return (
    <div className="detail">
      <button type="button" className="back" onClick={() => nav(-1)}>‹ Retour</button>
      {e.home ? <div className="hero emoji big">{e.emoji}</div> : <div className="hero" style={{ backgroundImage: `url(${e.cover})` }} />}
      <div className="detail-body">
        <div className="badges">
          <span className="badge">{e.genre_label}</span>
          {e.vibes?.map((v) => <span key={v} className="badge soft">{v}</span>)}
          {e.ends_soon && <span className="badge urgent">{e.days_left <= 1 ? "Dernier jour" : `Plus que ${e.days_left} j`}</span>}
        </div>
        <h1>{e.title}</h1>
        <p className="hook">{e.hook}</p>
        {!e.home && (
          <dl className="facts">
            <div><dt>Quand</dt><dd>{e.occurrences?.length ? occLabel(e.occurrences[0]) : e.when}{e.occurrences?.length > 1 && <span className="muted"> · {e.occurrences.length > 29 ? "et bien d'autres dates" : `et ${e.occurrences.length - 1} autre${e.occurrences.length > 2 ? "s" : ""} date${e.occurrences.length > 2 ? "s" : ""}`}</span>}</dd></div>
            <div><dt>Où</dt><dd>{e.place}{e.street && <span className="muted"><br />{e.street}, {e.zip} {e.city}</span>}</dd></div>
            <div><dt>Prix</dt><dd>{e.price}{e.price_detail && e.price_detail.length < 160 && e.price_detail !== e.price && <span className="muted"><br />{e.price_detail}</span>}</dd></div>
            <div><dt>Accès</dt><dd>{e.access === "obligatoire" ? "Réservation obligatoire" : e.access === "conseillée" ? "Réservation conseillée" : "Entrée libre"}{e.indoor === 0 && <span className="muted"> · en extérieur</span>}</dd></div>
          </dl>
        )}
        <div className="actions sticky">
          <button type="button" className={"btn primary" + (saved ? " done" : "")} onClick={() => toggle("saved")}>{saved ? "♥ Gardé" : "♥ Envie"}</button>
          <button type="button" className={"btn ghost" + (me.done ? " done" : "")} onClick={() => toggle("done")}>{me.done ? "✓ Fait" : "Fait"}</button>
          <button type="button" className="btn ghost" onClick={() => toggle("hide")}>Pas pour moi</button>
        </div>
        {!e.home && (
          <div className="links">
            {e.booking_url && <a className="btn link" href={e.booking_url} target="_blank" rel="noreferrer">Réserver</a>}
            {maps && <a className="btn link" href={maps} target="_blank" rel="noreferrer">Itinéraire</a>}
            {e.url && <a className="btn link" href={e.url} target="_blank" rel="noreferrer">Sur paris.fr</a>}
          </div>
        )}
        {e.description && <div className="desc">{e.description.split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>}
        {e.lead && e.home && <div className="desc"><p>{e.lead}</p></div>}
        {e.occurrences?.length > 1 && (
          <details className="dates"><summary>Toutes les dates</summary><ul>{e.occurrences.map((o, i) => <li key={i}>{occLabel(o)}</li>)}</ul></details>
        )}
        {e.date_description && <p className="muted small">{e.date_description}</p>}
      </div>
    </div>
  );
}
