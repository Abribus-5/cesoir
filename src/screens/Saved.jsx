import React, { useEffect, useState } from "react";
import { get } from "../api.js";
import { RowCard } from "../components/EventCard.jsx";

export default function Saved() {
  const [data, setData] = useState(null);
  useEffect(() => { get("/me").then(setData); }, []);
  const items = data?.items || [];
  const soon = items.filter((e) => e.ends_soon), rest = items.filter((e) => !e.ends_soon);
  return (
    <div className="saved">
      <header className="top">
        <h1>Mes envies</h1>
        {data?.profile?.top_genres?.length > 0 && <p className="sub">En ce moment tu penches vers : {data.profile.top_genres.join(", ").toLowerCase()}.</p>}
      </header>
      {soon.length > 0 && <><h2 className="section">À faire vite</h2><section className="list">{soon.map((e) => <RowCard key={e.id} e={e} />)}</section></>}
      {rest.length > 0 && <><h2 className="section">{soon.length ? "Et plus tard" : "Gardées"}</h2><section className="list">{rest.map((e) => <RowCard key={e.id} e={e} />)}</section></>}
      {data && !items.length && <p className="empty">Rien de gardé pour l'instant. Appuie sur ♥ sur une idée qui te tente : elle atterrit ici, et disparaît toute seule quand c'est passé.</p>}
    </div>
  );
}
