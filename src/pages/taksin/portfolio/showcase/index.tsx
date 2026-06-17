import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Play, Volume2 } from "lucide-react";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { Reveal, RevealItem } from "../../anim";
import { profile, contact } from "../../data";
import {
  showcaseSections,
  showcaseCredit,
  type ShowcaseSection,
  type ShowcaseVideo,
} from "./showcaseData";

/* ───────────────────────────────────────────────────────────────────────────
 * /taksin/portfolio/showcase — "ผลงานทีม & งานกราฟิกให้ลูกค้า"
 * A companion gallery to /taksin/portfolio that showcases the COLLABORATIVE
 * team work — commercial creative & graphic work produced for clients, led on
 * the creative/graphic side by teammate Kritsarut Wongsakorn ("Gun"). Content
 * is sourced from Gun's deck (Showcase.pptx): 147 optimised stills across 7
 * sections + 9 curated, compressed AI hero videos.
 *
 * Same WHITE-background system as the portfolio page. Images render at their
 * natural pixel size (never upscaled past native) to stay crisp under the
 * 1.455 desktop ui-scale.
 * ──────────────────────────────────────────────────────────────────────────*/

const scStyles = `
  .sc-root {
    background:
      radial-gradient(60rem 60rem at 0% -10%, rgba(244,255,0,0.07), transparent 60%),
      #ffffff;
  }
  .sc-dot-grid {
    background-image: radial-gradient(rgba(10,10,10,0.06) 1px, transparent 1px);
    background-size: 22px 22px;
  }
  .sc-shot { transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), box-shadow 0.5s; }
  .sc-shot:hover { transform: translateY(-4px); }
  /* Entrance polish that never hides content: only a subtle rise animates, so a
     paused/hidden tab still shows every image. */
  .sc-fade { animation: sc-rise 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes sc-rise {
    from { transform: translateY(14px); }
    to   { transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sc-shot, .sc-shot:hover { transition: none; transform: none; }
    .sc-fade { animation: none; }
  }
`;

/* ── AI hero video: a muted WEBM preview autoplays/loops while on screen;
 *    clicking loads the full-quality MP4 and plays it WITH sound. The light
 *    webm keeps the gallery alive without downloading every heavy mp4. ─────── */
function ReelCard({ video }: { video: ShowcaseVideo }) {
  const [playing, setPlaying] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Autoplay the muted preview only while visible (and not when reduced-motion
  // is requested). Disconnected once the user opts into the full mp4.
  useEffect(() => {
    if (playing) return;
    const el = previewRef.current;
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
  }, [playing]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-neutral-950 ring-1 ring-neutral-200">
      {playing ? (
        <video
          className="aspect-video h-full w-full object-cover"
          src={video.src}
          poster={video.poster}
          controls
          autoPlay
          playsInline
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="group relative block w-full"
          aria-label={`เล่นวิดีโอพร้อมเสียง ${video.label}`}
        >
          <video
            ref={previewRef}
            className="aspect-video w-full object-cover"
            poster={video.poster}
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src={video.preview} type="video/webm" />
          </video>
          {/* play-with-sound affordance (preview keeps animating underneath) */}
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F4FF00] text-black shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-7 w-7 translate-x-0.5 fill-black" />
            </span>
          </span>
          {/* hint that clicking enables sound + full quality */}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-wide text-white backdrop-blur">
            <Volume2 className="h-3 w-3" /> กดเพื่อฟังเสียง
          </span>
          <span className="absolute bottom-3 left-3 right-3 truncate rounded-full bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wide text-white">
            {video.label}
          </span>
        </button>
      )}
    </div>
  );
}

/* ── Numbered section label (light theme) ───────────────────────────────── */
function ScLabel({ index, children }: { index: string; children: React.ReactNode }) {
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

/* ── One deck-sourced section: optional videos + masonry image gallery ───── */
function Section({ section }: { section: ShowcaseSection }) {
  return (
    <section id={section.id} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
      <Reveal>
        <ScLabel index={section.index}>{section.titleEn}</ScLabel>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-prompt text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            {section.title}
            <span className="mt-2 block h-1 w-12 rounded-full bg-[#F4FF00]" />
          </h2>
          <span className="font-mono text-xs text-neutral-400">
            {section.images.length} ชิ้นงาน
            {section.videos.length > 0 ? ` · ${section.videos.length} วิดีโอ` : ""}
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">{section.blurb}</p>
      </Reveal>

      {/* Curated AI hero videos (click to play) */}
      {section.videos.length > 0 && (
        <Reveal
          staggerChildren
          amount={0.1}
          className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {section.videos.map((v) => (
            <RevealItem key={v.src}>
              <ReelCard video={v} />
            </RevealItem>
          ))}
        </Reveal>
      )}

      {/* Masonry image gallery. Natural-size imgs (no w-full) never upscale past
          native, so they stay crisp under the 1.455 desktop ui-scale; width /
          height attrs reserve aspect ratio to avoid layout shift. */}
      <div className="mt-10 columns-2 gap-4 sm:columns-3 lg:columns-4 [&>*]:mb-4">
        {section.images.map((img) => (
          <figure
            key={img.src}
            className="sc-shot sc-fade mx-auto w-fit max-w-full break-inside-avoid overflow-hidden rounded-xl ring-1 ring-neutral-200 shadow-sm"
          >
            <img
              src={img.src}
              alt=""
              width={img.w}
              height={img.h}
              loading="lazy"
              decoding="async"
              className="block h-auto max-w-full"
            />
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function TaksinShowcase() {
  useDocumentTitle(`ผลงานทีม & งานกราฟิก — ${profile.nameLatin}`);

  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "th";
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.lang = prev;
    };
  }, []);

  const totalImages = showcaseSections.reduce((n, s) => n + s.images.length, 0);
  const totalVideos = showcaseSections.reduce((n, s) => n + s.videos.length, 0);

  return (
    <MotionConfig reducedMotion="user">
      <style>{scStyles}</style>
      <div className="sc-root min-h-screen font-prompt text-neutral-900 antialiased">
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
              to="/taksin/portfolio"
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับหน้าผลงาน
            </Link>
          </nav>
        </header>

        {/* hero header */}
        <section className="relative overflow-hidden">
          <div className="sc-dot-grid pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full bg-[#cfd800]" />
                Team & Client Work · Creative / Graphic
              </div>
              <h1 className="mt-6 font-prompt text-5xl font-extrabold leading-[0.98] tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl">
                ผลงานทีม
                <span className="relative ml-2 inline-block">
                  & กราฟิก
                  <span className="absolute -bottom-1 left-0 -z-0 h-3 w-full bg-[#F4FF00]" />
                </span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-neutral-600">
                งานครีเอทีฟและกราฟิกเชิงพาณิชย์ที่ทีมของเราผลิตให้กับลูกค้า — ตั้งแต่อาร์ตเวิร์กโฆษณา
                แพ็กเกจจิ้ง สื่อ ณ จุดขาย ไปจนถึงคอนเทนต์และวิดีโอที่สร้างด้วย AI workflow
                ดูแลด้านครีเอทีฟ/กราฟิกโดย{" "}
                <span className="font-semibold text-neutral-900">
                  {showcaseCredit.name} ({showcaseCredit.nickname})
                </span>{" "}
                — {showcaseCredit.roleTh} ของทีม
              </p>

              {/* credit + stat strip */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F4FF00]" />
                  {showcaseCredit.name} · {showcaseCredit.role}
                </span>
                <span className="rounded-full bg-neutral-100 px-4 py-2 font-mono text-xs text-neutral-600">
                  {totalImages} ชิ้นงาน · {totalVideos} วิดีโอ AI
                </span>
              </div>

              {/* section nav chips */}
              <div className="mt-9 flex flex-wrap gap-2.5">
                {showcaseSections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                  >
                    {s.title}
                  </a>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* deck-sourced sections, alternating subtle bg for separation */}
        <main>
          {showcaseSections.map((section, i) => (
            <div key={section.id} className={i % 2 === 1 ? "bg-neutral-50/70" : ""}>
              <Section section={section} />
            </div>
          ))}

          {/* footer CTA */}
          <section className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
              <Reveal>
                <h2 className="font-prompt text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
                  อยากได้งานครีเอทีฟแบบนี้บ้าง?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600">
                  ทีมของเราผลิตงานกราฟิก คอนเทนต์ และวิดีโอ AI สำหรับแบรนด์และแคมเปญจริง —
                  คุยโจทย์กับเราได้เลย
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                  <a
                    href={`mailto:${contact.email}`}
                    className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-105"
                  >
                    ติดต่อ {contact.email}
                  </a>
                  <Link
                    to="/taksin/portfolio"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    กลับหน้าผลงาน
                  </Link>
                  <a
                    href="https://mediaforge.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#F4FF00] px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-105"
                  >
                    เปิด mediaforge.co
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </MotionConfig>
  );
}
