import React from "react";
import { Link } from "react-router-dom";
import { dayLabel } from "../api.js";

const WHY = { pour_toi: "Pour toi", a_cote: "Pas de chez toi", maison: "Chez toi" };

export function BigCard({ e, onSave, onSkip, showDay }) {
  return (
    <article className={"card big" + (e.home ? " home" : "")}>
      <Link to={`/e/${e.id}`} className="card-link">
        {e.home ? <div className="hero emoji">{e.emoji}</div> : <div className="hero" style={{ backgroundImage: `url(${e.cover})` }} />}
        <div className="card-body">
          <div className="badges">
            {e.why && <span className={"badge why " + e.why}>{WHY[e.why]}</span>}
            <span className="badge">{e.genre_label}</span>
            {e.ends_soon && !e.home && <span className="badge urgent">{e.days_left <= 1 ? "Dernier jour" : `Plus que ${e.days_left} j`}</span>}
          </div>
          <h2>{e.title}</h2>
          <p className="hook">{e.hook}</p>
          <p className="meta">
            {showDay && e.day && <span>{dayLabel(e.day)} · </span>}
            <span>{e.when}</span>{e.arr && <span> · {e.arr}</span>}<span> · {e.price}</span>
          </p>
        </div>
      </Link>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => onSkip(e)}>Pas pour moi</button>
        <button type="button" className={"btn primary" + (e.saved ? " done" : "")} onClick={() => onSave(e)}>{e.saved ? "♥ Gardé" : "♥ Envie"}</button>
      </div>
    </article>
  );
}

export function RowCard({ e, showDay = true }) {
  return (
    <Link to={`/e/${e.id}`} className="card row">
      {e.home ? <div className="thumb emoji">{e.emoji}</div> : <div className="thumb" style={{ backgroundImage: `url(${e.cover})` }} />}
      <div className="row-body">
        <div className="badges small">
          <span className="badge">{e.genre_label}</span>
          {e.ends_soon && <span className="badge urgent">{e.days_left <= 1 ? "Dernier jour" : `Plus que ${e.days_left} j`}</span>}
          {e.saved && <span className="badge saved">♥</span>}
        </div>
        <h3>{e.title}</h3>
        <p className="meta">{showDay && e.day && <span>{dayLabel(e.day)} · </span>}{e.when}{e.arr && ` · ${e.arr}`} · {e.price}</p>
      </div>
    </Link>
  );
}
