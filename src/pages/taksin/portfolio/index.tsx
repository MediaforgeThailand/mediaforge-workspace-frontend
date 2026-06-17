import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Play } from "lucide-react";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { Reveal, RevealItem } from "../anim";
import { profile, contact } from "../data";
import {
  workSections,
  studio,
  mira,
  platform,
  type WorkSection,
  type VentureClip,
} from "./works";

/* ───────────────────────────────────────────────────────────────────────────
 * /taksin/portfolio — "ผลงานบางส่วน" (Selected Works)
 * A long-scroll, WHITE-background gallery of real work extracted from Taksin's
 * portfolio PDF (Ads / Data / Clinic / Campaigns / Design / Brand) plus the
 * live Mediaforge products (Studio cinematic reels + Mira AI product screens).
 * Light theme on purpose — the dark #F4FF00 brand accent is used as blocks and
 * markers, never as text on white.
 * ──────────────────────────────────────────────────────────────────────────*/

const pfStyles = `
  .pf-root {
    background:
      radial-gradient(60rem 60rem at 100% -10%, rgba(244,255,0,0.07), transparent 60%),
      #ffffff;
  }
  .pf-dot-grid {
    background-image: radial-gradient(rgba(10,10,10,0.06) 1px, transparent 1px);
    background-size: 22px 22px;
  }
  .pf-shot { transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), box-shadow 0.5s; }
  .pf-shot:hover { transform: translateY(-4px); }
  @media (prefers-reduced-motion: reduce) {
    .pf-shot, .pf-shot:hover { transition: none; transform: none; }
  }
`;

/* ── A muted, looping clip that only plays while on screen ──────────────── */
function WorkVideo({
  src,
  poster,
  label,
  fit = "cover",
}: {
  src: string;
  poster?: string;
  label?: string;
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduced) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-neutral-950 ring-1 ring-neutral-200">
      <video
        ref={ref}
        className={`aspect-video h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
      >
        <source src={src} type="video/mp4" />
      </video>
      {label && (
        <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wide text-white backdrop-blur">
          {label}
        </span>
      )}
    </div>
  );
}

/* ── Heavy cross-origin showreel: poster until clicked, then streams ─────── */
function FeatureReel({ poster, src, label }: { poster: string; src: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-neutral-950 ring-1 ring-neutral-200">
      {playing ? (
        <video
          className="aspect-video h-full w-full object-cover"
          src={src}
          controls
          autoPlay
          playsInline
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="group relative block w-full"
          aria-label={`เล่นวิดีโอ ${label}`}
        >
          <img
            src={poster}
            alt={label}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F4FF00] text-black shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-7 w-7 translate-x-0.5 fill-black" />
            </span>
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wide text-white">
            {label}
          </span>
        </button>
      )}
    </div>
  );
}

/* ── Numbered section label (light theme) ───────────────────────────────── */
function PfLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-neutral-500">
      <span className="inline-flex h-6 items-center rounded-md bg-neutral-900 px-2 font-bold text-white">
        {index}
      </span>
      <span className="h-px w-8 bg-neutral-300" />
      <span>{children}</span>
    </div>
  );
}

/* ── One PDF-sourced work section ───────────────────────────────────────── */
function Section({ section }: { section: WorkSection }) {
  const isStack = section.layout === "stack";
  return (
    <section id={section.id} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
      <Reveal>
        <PfLabel index={section.index}>{section.titleEn}</PfLabel>
        <h2 className="mt-4 font-prompt text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {section.title}
          <span className="mt-2 block h-1 w-12 rounded-full bg-[#F4FF00]" />
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">{section.blurb}</p>
      </Reveal>

      {isStack ? (
        <Reveal staggerChildren amount={0.1} className="mt-10 space-y-6">
          {section.shots.map((shot) => (
            <RevealItem key={shot.src}>
              <figure className="pf-shot overflow-hidden rounded-2xl ring-1 ring-neutral-200 shadow-sm">
                <img
                  src={shot.src}
                  alt={shot.caption}
                  loading="lazy"
                  decoding="async"
                  className="w-full"
                />
                <figcaption className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 font-mono text-[12px] text-neutral-500">
                  {shot.caption}
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </Reveal>
      ) : (
        <Reveal
          staggerChildren
          amount={0.05}
          className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5"
        >
          {section.shots.map((shot) => (
            <RevealItem key={shot.src} className="break-inside-avoid">
              <figure className="pf-shot overflow-hidden rounded-2xl ring-1 ring-neutral-200 shadow-sm">
                <img
                  src={shot.src}
                  alt={shot.caption}
                  loading="lazy"
                  decoding="async"
                  className="w-full"
                />
                <figcaption className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 font-mono text-[11px] text-neutral-500">
                  {shot.caption}
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </Reveal>
      )}
    </section>
  );
}

export default function TaksinWorks() {
  useDocumentTitle(`ผลงานบางส่วน — ${profile.nameLatin}`);

  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "th";
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.lang = prev;
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <style>{pfStyles}</style>
      <div className="pf-root min-h-screen font-prompt text-neutral-900 antialiased">
        {/* sticky top bar */}
        <header className="sticky top-0 z-50 border-b border-neutral-200/70 bg-white/80 backdrop-blur-xl">
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Link to="/taksin" className="flex items-baseline gap-1">
              <span className="font-prompt text-lg font-extrabold tracking-tight text-neutral-900">
                taksin
              </span>
              <span className="text-lg font-extrabold leading-none text-[#cfd800]">.</span>
            </Link>
            <Link
              to="/taksin"
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับหน้าหลัก
            </Link>
          </nav>
        </header>

        {/* hero header */}
        <section className="relative overflow-hidden">
          <div className="pf-dot-grid pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full bg-[#cfd800]" />
                Selected Works · 2019—2025
              </div>
              <h1 className="mt-6 font-prompt text-5xl font-extrabold leading-[0.98] tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl">
                ผลงาน
                <span className="relative ml-2 inline-block">
                  บางส่วน
                  <span className="absolute -bottom-1 left-0 -z-0 h-3 w-full bg-[#F4FF00]" />
                </span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-neutral-600">
                ตัวอย่างงานจริงด้านการยิงแอด ดาต้า แคมเปญ ดีไซน์ และแบรนด์ พร้อมผลิตภัณฑ์ AI
                ที่สร้างในเครือ <span className="font-semibold text-neutral-900">Mediaforge</span> —
                ทั้ง Mediaforge Studio และ Mira AI
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                {workSections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                  >
                    {s.title}
                  </a>
                ))}
                <a
                  href="#ventures"
                  className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  Mediaforge
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PDF-sourced sections, alternating subtle bg for separation */}
        <main>
          {workSections.map((section, i) => (
            <div key={section.id} className={i % 2 === 1 ? "bg-neutral-50/70" : ""}>
              <Section section={section} />
            </div>
          ))}

          {/* ── Mediaforge ventures ─────────────────────────────────────── */}
          <section id="ventures" className="scroll-mt-24 border-t border-neutral-200 bg-neutral-950">
            <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
              <Reveal>
                <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-neutral-400">
                  <span className="inline-flex h-6 items-center rounded-md bg-[#F4FF00] px-2 font-bold text-black">
                    07
                  </span>
                  <span className="h-px w-8 bg-neutral-700" />
                  <span>Live Products · Mediaforge</span>
                </div>
                <h2 className="mt-4 font-prompt text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  ผลิตภัณฑ์ที่สร้างและดูแลเอง
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-400">
                  จากงานบริการสู่การสร้างผลิตภัณฑ์ของตัวเอง — แพลตฟอร์ม Generative AI, โปรดักชันเฮาส์สาย AI
                  และผู้ช่วย AI ที่ใช้งานจริง
                </p>
              </Reveal>

              {/* Mediaforge Studio */}
              <div className="mt-16">
                <Reveal className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={studio.logo}
                      alt={studio.name}
                      className="h-12 w-12 rounded-xl object-contain ring-1 ring-white/10"
                    />
                    <div>
                      <h3 className="font-prompt text-xl font-bold text-white">{studio.name}</h3>
                      <p className="font-mono text-xs text-neutral-500">{studio.domain}</p>
                    </div>
                  </div>
                  <a
                    href={studio.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/20"
                  >
                    เยี่ยมชม
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Reveal>
                <Reveal>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400">
                    {studio.blurb}
                  </p>
                </Reveal>

                <Reveal staggerChildren amount={0.1} className="mt-8 grid gap-5 sm:grid-cols-2">
                  {studio.reels.map((reel) => (
                    <RevealItem key={reel.src}>
                      <FeatureReel poster={reel.poster} src={reel.src} label={reel.label} />
                    </RevealItem>
                  ))}
                </Reveal>

                <Reveal
                  staggerChildren
                  amount={0.1}
                  className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
                >
                  {studio.clips.map((clip: VentureClip) => (
                    <RevealItem key={clip.src}>
                      <WorkVideo src={clip.src} label={clip.label} fit="cover" />
                    </RevealItem>
                  ))}
                </Reveal>
              </div>

              {/* Mira AI */}
              <div className="mt-20 border-t border-white/10 pt-16">
                <Reveal className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={mira.wordmark}
                      alt={mira.name}
                      className="h-9 w-auto object-contain"
                    />
                    <p className="font-mono text-xs text-neutral-500">{mira.domain}</p>
                  </div>
                  <a
                    href={mira.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/20"
                  >
                    เยี่ยมชม
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Reveal>
                <Reveal>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400">
                    {mira.blurb}
                  </p>
                </Reveal>

                <Reveal
                  staggerChildren
                  amount={0.05}
                  className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {mira.clips.map((clip: VentureClip) => (
                    <RevealItem key={clip.src}>
                      <WorkVideo src={clip.src} label={clip.label} fit="contain" />
                    </RevealItem>
                  ))}
                </Reveal>
              </div>

              {/* Mediaforge platform */}
              <div className="mt-20 border-t border-white/10 pt-16">
                <Reveal className="overflow-hidden rounded-3xl bg-gradient-to-br from-white/[0.07] to-transparent p-8 ring-1 ring-white/10 sm:p-10">
                  <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <img
                        src={platform.logo}
                        alt={platform.name}
                        className="h-14 w-14 object-contain"
                      />
                      <div>
                        <h3 className="font-prompt text-2xl font-bold text-white">
                          {platform.name}
                        </h3>
                        <p className="font-mono text-xs text-neutral-500">{platform.domain}</p>
                      </div>
                    </div>
                    <a
                      href={platform.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#F4FF00] px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-105"
                    >
                      เปิด mediaforge.co
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                  <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300">
                    {platform.blurb}
                  </p>
                </Reveal>
              </div>
            </div>
          </section>

          {/* footer CTA */}
          <section className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
              <Reveal>
                <h2 className="font-prompt text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
                  สนใจร่วมงานกัน?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600">
                  เปลี่ยนโจทย์ธุรกิจที่ไม่ชัดเจน ให้กลายเป็นระบบและผลลัพธ์ที่วัดผลได้
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                  <a
                    href={`mailto:${contact.email}`}
                    className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-105"
                  >
                    ติดต่อ {contact.email}
                  </a>
                  <Link
                    to="/taksin"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    กลับหน้าหลัก
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </MotionConfig>
  );
}
