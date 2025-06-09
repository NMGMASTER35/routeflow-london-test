import React from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import FeatureCards from "../components/FeatureCards";
import ServiceStatusBanner from "../components/ServiceStatusBanner";
import QuickTiles from "../components/QuickTiles";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div>
      <Navbar />
      <Hero />
      <FeatureCards />
      <ServiceStatusBanner />
      <QuickTiles />
      <Footer />
    </div>
  );
}
