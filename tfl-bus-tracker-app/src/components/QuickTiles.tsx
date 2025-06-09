import React from "react";

const tiles = [
  { icon: "📍", label: "Nearby Stops", link: "/nearby" },
  { icon: "🧭", label: "Rare Workings Log", link: "/rare" },
  { icon: "🕰️", label: "Withdrawn Bus Archive", link: "/withdrawn" },
  { icon: "🧾", label: "Route History Timeline", link: "/history" },
  { icon: "🧪", label: "Try RouteFlow AI", link: "/ai" },
];

export default function QuickTiles() {
  return (
    <section className="quick-tiles">
      {tiles.map(t => (
        <a href={t.link} className="quick-tile" key={t.label}>
          <span>{t.icon}</span>
          <span>{t.label}</span>
        </a>
      ))}
    </section>
  );
}
