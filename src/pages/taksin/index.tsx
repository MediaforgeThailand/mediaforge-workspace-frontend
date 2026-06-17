import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { taksinStyles } from "./styles";
import { profile } from "./data";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Profile from "./components/Profile";
import Ventures from "./components/Ventures";
import Pillars from "./components/Pillars";
import Timeline from "./components/Timeline";
import Results from "./components/Results";
import Skills from "./components/Skills";
import Contact from "./components/Contact";

/**
 * /taksin — Taksin Taeprasert portfolio landing page.
 * Self-contained Thai-only microsite: own nav/footer, scoped `tk-*` styles,
 * and the MediaForge dark theme. framer-motion honours prefers-reduced-motion
 * via MotionConfig reducedMotion="user".
 */
export default function TaksinPortfolio() {
  useDocumentTitle(`${profile.nameLatin} — AI Product Designer & Systems`);

  // Mark the document as Thai while this page is mounted (a11y / font shaping),
  // restore the previous value on unmount so other routes are unaffected.
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "th";
    return () => {
      document.documentElement.lang = prev;
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <style>{taksinStyles}</style>
      <div className="tk-root min-h-screen bg-background font-sans text-foreground antialiased">
        <Nav />
        <main>
          <Hero />
          <Profile />
          <Ventures />
          <Pillars />
          <Timeline />
          <Results />
          <Skills />
          <Contact />
        </main>
      </div>
    </MotionConfig>
  );
}
