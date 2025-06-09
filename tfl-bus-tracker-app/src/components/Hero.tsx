import React from "react";

export default function Hero() {
  return (
    <section className="hero">
      <h1>Live Tracking, Built from Scratch</h1>
      <p>Experience London's buses in real time like never before.</p>
      <form className="hero__search">
        <input type="text" placeholder="Search by route, stop, reg, or fleet number" />
        <button type="submit">🔍</button>
      </form>
      <div className="hero__cta">
        <button className="cta-primary">🔴 Explore Map</button>
        <button className="cta-secondary">⚪ Learn More</button>
      </div>
    </section>
  );
}
