import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar__logo">🗺️ RouteFlow London</div>
      <div className="navbar__links">
        <Link to="/">Live Map</Link>
        <Link to="/find">Find My Bus</Link>
        <Link to="/routes">Routes</Link>
        <Link to="/buses">Bus Profiles</Link>
        <Link to="/withdrawn">Withdrawn</Link>
        <Link to="/rare">Rare Sightings</Link>
        <Link to="/history">Route History</Link>
        <Link to="/community">Community</Link>
        <Link to="/discord">Discord</Link>
        <Link to="/settings">Settings</Link>
      </div>
      <div className="navbar__account">
        <Link to="/login">👤</Link>
      </div>
      <button className="navbar__hamburger">☰</button>
    </nav>
  );
}
