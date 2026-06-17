import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { profile } from "../data";
import { HeroSystemMap } from "../diagrams";
import { easeOutExpo } from "../anim";

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) videoRef.current?.play().catch(() => {});
  }, [hasVideo]);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOutExpo } },
  };

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pt-16">
      {/* ambient grid + glow */}
      <div className="tk-grid absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/5 blur-[100px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="mb-5 flex items-center gap-3 font-mono text-xs tracking-[0.3em] text-primary uppercase">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Portfolio · 2025
          </motion.div>

          <motion.h1
            variants={item}
            className="font-prompt text-5xl font-extrabold leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
          >
            {profile.nameLatin}
          </motion.h1>

          <motion.div variants={item} className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm text-muted-foreground">
            {profile.roleLine.map((r, i) => (
              <span key={r} className="flex items-center gap-3">
                {i > 0 && <span className="text-primary/60">·</span>}
                {r}
              </span>
            ))}
          </motion.div>

          <motion.h2
            variants={item}
            className="mt-8 whitespace-pre-line text-2xl font-bold leading-snug text-foreground sm:text-3xl"
          >
            {profile.heroHeadline}
          </motion.h2>

          <motion.p variants={item} className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {profile.heroSub}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={() => document.getElementById("pillars")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
            >
              ดูความเชี่ยวชาญ
            </button>
            <button
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-full px-6 py-3 text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-accent"
            >
              ร่วมงานกัน
            </button>
          </motion.div>
        </motion.div>

        {/* hero system map / video monitor */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: easeOutExpo, delay: 0.3 }}
          className="relative mx-auto aspect-square w-full max-w-md"
        >
          <div className="absolute inset-0 rounded-3xl bg-[#0d0f10] ring-1 ring-primary/15" />
          <div className="absolute inset-0 p-6">
            <HeroSystemMap />
          </div>
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full rounded-3xl object-cover transition-opacity duration-700"
            style={{ opacity: hasVideo ? 1 : 0 }}
            muted
            loop
            playsInline
            preload="metadata"
            poster="/videos/taksin/hero.jpg"
            onCanPlay={() => setHasVideo(true)}
            onError={() => setHasVideo(false)}
          >
            <source src="/videos/taksin/hero.mp4" type="video/mp4" />
          </video>
        </motion.div>
      </div>

      {/* scroll cue */}
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <div className="flex flex-col items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground">
          SCROLL
          <span className="h-8 w-px animate-pulse bg-gradient-to-b from-primary to-transparent" />
        </div>
      </div>
    </section>
  );
}
