import React, { useEffect, useState } from "react";
import { get } from "../api.js";
import Chips from "../components/Chips.jsx";
import { RowCard } from "../components/EventCard.jsx";

const WHEN = [["tonight", "Ce soir"], ["tomorrow", "Demain"], ["weekend", "Weekend"], ["ending", "Derniers jours"], ["later", "Plus tard"]];
const GENRES = [["concert", "Concert"], ["expo", "Expo"], ["theatre", "Théâtre"], ["humour", "Humour"], ["cinema", "Cinéma"], ["danse", "Danse"], ["balade", "Balade"], ["jeux", "Jeux"], ["soiree", "Soirée"], ["conference", "Rencontre"], ["atelier", "Atelier"], ["sport", "Sport"], ["gastronomie", "Gourmand"], ["spectacle", "Spectacle"]];

export default function Explore() {
  const [when, setWhen] = useState("weekend");
  const [genre, setGenre] = useState(null);
  const [free, setFree] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => get("/events", { when, genre, free: free ? 1 : "", q }).then((r) => { if (alive) { setItems(r.items); setLoading(false); } }), q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [when, genre, free, q]);

  return (
    <div className="explore">
      <header className="top"><h1>Explorer</h1></header>
      <section className="context">
        <Chips options={WHEN} value={when} onChange={(v) => setWhen(v || "weekend")} allowNone={false} />
        <Chips options={GENRES} value={genre} onChange={setGenre} />
        <div className="chips">
          <button type="button" className={"chip" + (free ? " on" : "")} onClick={() => setFree(!free)}>Gratuit</button>
          <input className="search" placeholder="Chercher un lieu, un titre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </section>
      <section className="list">
        {items.map((e) => <RowCard key={e.id} e={e} showDay={when !== "tonight"} />)}
        {!loading && !items.length && <p className="empty">Rien ici pour l'instant.</p>}
      </section>
    </div>
  );
}
