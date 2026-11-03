import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Tonight from "./screens/Tonight.jsx";
import Explore from "./screens/Explore.jsx";
import Saved from "./screens/Saved.jsx";
import Detail from "./screens/Detail.jsx";

export default function App() {
  return (
    <div className="app">
      <main className="screen">
        <Routes>
          <Route path="/" element={<Tonight />} />
          <Route path="/explorer" element={<Explore />} />
          <Route path="/envies" element={<Saved />} />
          <Route path="/e/:id" element={<Detail />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end><span className="ico">✦</span>Ce soir</NavLink>
        <NavLink to="/explorer"><span className="ico">◎</span>Explorer</NavLink>
        <NavLink to="/envies"><span className="ico">♥</span>Envies</NavLink>
      </nav>
    </div>
  );
}
