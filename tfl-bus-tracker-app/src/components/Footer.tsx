import React from "react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-row">
        <span className="footer-logo">🗺️ RouteFlow London</span>
        <nav>
          <a href="/about">About</a> | <a href="/privacy">Privacy</a> | <a href="/terms">Terms</a> | <a href="/contact">Contact</a>
        </nav>
        <select className="footer-lang">
          <option>EN</option>
          <option>FR</option>
          <option>ES</option>
        </select>
      </div>
      <div className="footer-row">
        <span>
          <a href="https://discord.gg/">Discord</a> | <a href="https://twitter.com/">Twitter</a> | <a href="https://instagram.com/">Instagram</a> | <a href="https://github.com/">GitHub</a>
        </span>
        <span>Built for London. Built from scratch.</span>
      </div>
    </footer>
  );
}
