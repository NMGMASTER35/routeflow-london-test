import React from "react";

const features = [
  { icon: "🗺️", title: "Live Bus Map", desc: "Track moving buses in real time" },
  { icon: "🧾", title: "Fleet Database", desc: "Find any bus by reg or fleet number" },
  { icon: "🧠", title: "Smart Suggestions", desc: "Personalized route help (Coming Soon)" },
  { icon: "👤", title: "Custom Profiles", desc: "Save favorites & get alerts" },
  { icon: "🔄", title: "Rare Sightings", desc: "Discover unusual bus workings" },
  { icon: "🕰️", title: "Bus History", desc: "Explore withdrawn vehicles & old routes" },
];

export default function FeatureCards() {
  return (
    <section className="features">
      {features.map(f => (
        <div className="feature-card" key={f.title}>
          <span className="feature-icon">{f.icon}</span>
          <h3>{f.title}</h3>
          <p>{f.desc}</p>
        </div>
      ))}
    </section>
  );
}
