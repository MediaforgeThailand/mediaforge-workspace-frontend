import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Play } from "lucide-react";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { Reveal, RevealItem } from "../anim";
import { profile, contact } from "../data";
import {
  workSections,
  techVideos,
  studio,
  mira,
  platform,
  type WorkSection,
  type TechVideo,
  type VentureClip,
} from "./works";

/* ───────────────────────────────────────────────────────────────────────────
 * /taksin/portfolio — "ผลงานบางส่วน" (Selected Works)
 * A long-scroll, WHITE-background gallery focused on Performance & Ads + Data
 * (real screenshots from Taksin's portfolio PDF) and a Technical · Systems
 * block of HyperFrames motion-graphic explainers (LINE DEV, AI-in-LINE,
 * Website, Org systems, Automation), plus the live Mediaforge products (Studio
 * cinematic reels + Mira AI product screens). Pure graphic / branding work
 * lives on the companion /showcase page, linked from here.
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
  /* Entrance polish that never hides content: opacity stays 1, only a subtle
     rise animates. If the animation never runs (paused/hidden tab), the image
     is still fully visible. */
  .pf-fade { animation: pf-rise 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes pf-rise {
    from { transform: translateY(14px); }
    to   { transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pf-shot, .pf-shot:hover { transition: none; transform: none; }
    .pf-fade { animation: none; }
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

      {/* Images render as soon as they load — never gated behind a scroll/JS
          reveal, so they can't be trapped invisible (background tab, slow IO,
          stale cache). A light CSS fade-in keeps the entrance polished. */}
      {isStack ? (
        <div className="mt-10 space-y-6">
          {section.shots.map((shot) => (
            <figure
              key={shot.src}
              /* w-fit + natural-size img: the card hugs the image at its real
                 pixel size and is never upscaled past native (the source
                 screenshots are 538–1080px). This kills the pixelation that the
                 1.455 ui-scale + w-full was causing on desktop. */
              className="pf-shot pf-fade mx-auto w-fit max-w-full overflow-hidden rounded-2xl ring-1 ring-neutral-200 shadow-sm"
            >
              <img
                src={shot.src}
                alt={shot.caption}
                loading="lazy"
                decoding="async"
                className="block h-auto max-w-full"
              />
              <figcaption className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 font-mono text-[12px] text-neutral-500">
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
          {section.shots.map((shot) => (
            <figure
              key={shot.src}
              /* Natural-size img (never upscaled): caps each creative at its real
                 pixel width so the smaller ones don't get blown up by the column
                 width under the 1.455 ui-scale. */
              className="pf-shot pf-fade mx-auto w-fit max-w-full break-inside-avoid overflow-hidden rounded-2xl ring-1 ring-neutral-200 shadow-sm"
            >
              <img
                src={shot.src}
                alt={shot.caption}
                loading="lazy"
                decoding="async"
                className="block h-auto max-w-full"
              />
              <figcaption className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 font-mono text-[11px] text-neutral-500">
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── One technical motion-graphic card (video + supporting text) ────────── */
function TechCard({ v, wide = false }: { v: TechVideo; wide?: boolean }) {
  return (
    <figure className={wide ? "" : "h-full"}>
      <WorkVideo src={v.src} poster={v.poster} label={v.title} fit="cover" />
      <figcaption className="mt-3.5 px-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          <span className="font-bold text-neutral-900">{v.index}</span>
          <span className="mx-2 text-neutral-300">/</span>
          {v.titleEn}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{v.blurb}</p>
      </figcaption>
    </figure>
  );
}

/* ── Technical / Systems section — HyperFrames motion-graphic explainers ─── */
function TechShowcase() {
  const [feature, ...rest] = techVideos;
  return (
    <section id="tech" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
      <Reveal>
        <PfLabel index="02">Technical · Systems · Motion</PfLabel>
        <h2 className="mt-4 font-prompt text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          งานเชิงเทคนิค &amp; ระบบ
          <span className="mt-2 block h-1 w-12 rounded-full bg-[#F4FF00]" />
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">
          งานสายเทคนิคที่อยู่เบื้องหลังผลลัพธ์ — ตั้งค่า LINE OA เชิงลึก / LINE DEV, นำ AI มาตอบแชตอัตโนมัติ,
          สร้างเว็บไซต์, วางระบบองค์กร และระบบ Automation อธิบายทั้งหมดเป็น motion graphic
        </p>
      </Reveal>

      {/* feature explainer (full width) */}
      <Reveal className="mt-10">
        <TechCard v={feature} wide />
      </Reveal>

      {/* remaining explainers (2-col) */}
      <Reveal staggerChildren amount={0.1} className="mt-7 grid gap-x-6 gap-y-9 sm:grid-cols-2">
        {rest.map((v) => (
          <RevealItem key={v.id}>
            <TechCard v={v} />
          </RevealItem>
        ))}
      </Reveal>
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
                ตัวอย่างงานจริงด้าน Performance &amp; Ads และดาต้า พร้อมงานเชิงเทคนิค/ระบบ —
                LINE DEV, AI ตอบแชต, เว็บไซต์, ระบบองค์กร และ Automation — และผลิตภัณฑ์ AI
                ที่สร้างในเครือ <span className="font-semibold text-neutral-900">Mediaforge</span> —
                ทั้ง Mediaforge Studio และ Mira AI
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a
                  href="#ads"
                  className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  Performance &amp; Ads
                </a>
                <a
                  href="#tech"
                  className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  เทคนิค &amp; ระบบ
                </a>
                <a
                  href="#client"
                  className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  ลูกค้า &amp; พาร์ตเนอร์
                </a>
                <a
                  href="#ventures"
                  className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  Mediaforge
                </a>
                <Link
                  to="/taksin/portfolio/showcase"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#F4FF00] px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-105"
                >
                  ผลงานทีม & กราฟิก
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <main>
          {/* 01 — Performance & Ads / Data (real PDF screenshots) */}
          <Section section={workSections[0]} />

          {/* 02 — Technical / Systems motion graphics (the deeper engineering work) */}
          <div className="bg-neutral-50/70">
            <TechShowcase />
          </div>

          {/* 03+ — remaining work blocks (clients & partners) */}
          {workSections.slice(1).map((section) => (
            <Section key={section.id} section={section} />
          ))}

          {/* ── Mediaforge ventures ─────────────────────────────────────── */}
          <section id="ventures" className="scroll-mt-24 border-t border-neutral-200 bg-neutral-950">
            <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
              <Reveal>
                <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-neutral-400">
                  <span className="inline-flex h-6 items-center rounded-md bg-[#F4FF00] px-2 font-bold text-black">
                    04
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

          {/* ── Team & client graphic work — link to companion showcase ──── */}
          <section className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
              <Reveal>
                <Link
                  to="/taksin/portfolio/showcase"
                  className="group relative block overflow-hidden rounded-3xl bg-neutral-950 p-8 ring-1 ring-neutral-200 transition-transform hover:scale-[1.01] sm:p-12"
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.18]"
                    style={{
                      backgroundImage:
                        "radial-gradient(40rem 40rem at 100% 0%, rgba(244,255,0,0.45), transparent 60%)",
                    }}
                  />
                  <div className="relative flex flex-wrap items-end justify-between gap-6">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-neutral-400">
                        <span className="inline-flex h-6 items-center rounded-md bg-[#F4FF00] px-2 font-bold text-black">
                          05
                        </span>
                        <span className="h-px w-8 bg-neutral-700" />
                        <span>Team & Client Work</span>
                      </div>
                      <h2 className="mt-4 font-prompt text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                        ผลงานทีม &amp; งานกราฟิกให้ลูกค้า
                      </h2>
                      <p className="mt-4 text-base leading-relaxed text-neutral-300">
                        งานครีเอทีฟและกราฟิกเชิงพาณิชย์ที่ทีมของเราผลิตให้ลูกค้าจริง — อาร์ตเวิร์กโฆษณา
                        แพ็กเกจจิ้ง สื่อ ณ จุดขาย และคอนเทนต์/วิดีโอที่สร้างด้วย AI workflow
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#F4FF00] px-6 py-3 text-sm font-semibold text-black transition-transform group-hover:scale-105">
                      ดูผลงานทีม
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              </Reveal>
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
