import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  CheckCircle2,
  Globe2,
  Image,
  LayoutTemplate,
  Layers3,
  Music,
  Play,
  Sparkles,
  Video,
  Zap,
} from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { FinalCTA, MarketingNavbar } from "./MarketingShell";
import mockArtworkCreate from "@/assets/mock-artwork-create.jpg";
import mockArtworkFuture from "@/assets/mock-artwork-future.jpg";
import mockPackshot from "@/assets/mock-packshot-perfume.jpg";
import featureImage from "@/assets/feature-image-gen.jpg";
import featureVideo from "@/assets/feature-video-gen.jpg";
import featureAudio from "@/assets/feature-audio-gen.jpg";

const oneClickItems = [
  {
    title: "Prompt to image",
    desc: "Describe a mood, product, or scene and get polished art direction fast.",
    image: featureImage,
  },
  {
    title: "Image to video",
    desc: "Turn a still frame into cinematic motion for ads, reels, and concepts.",
    image: featureVideo,
  },
  {
    title: "Brand-ready assets",
    desc: "Generate product, packshot, and campaign visuals that stay on direction.",
    image: mockPackshot,
  },
];

const featureItems = [
  { title: "AI Image", desc: "GPT, Nano Banana, Recraft, and more.", icon: Image },
  { title: "AI Video", desc: "Cinematic shots from one prompt.", icon: Video },
  { title: "AI Audio", desc: "Voice-overs and music in 30+ languages.", icon: Music },
  { title: "AI 3D", desc: "Turn text into 3D-ready assets.", icon: Box },
  { title: "Worlds", desc: "Build characters and environments.", icon: Globe2 },
  { title: "Templates", desc: "Start from pro campaign formats.", icon: LayoutTemplate },
];

const proof = ["DMD", "Creator Labs", "Studio Teams", "Brand Houses", "Campus Media", "Launch Pods", "AI Artists"];

export default function Landing() {
  useReveal();

  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[var(--bg-app)] text-white">
      <MarketingNavbar />
      <Hero />
      <OneClick />
      <ColorShiftSection />
      <Features />
      <SocialProof />
      <FinalCTA />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 pb-20 pt-28 text-center">
      <video
        src="/videos/hero_home.webm"
        poster="/videos/hero_home_poster.jpg"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full scale-105 object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,11,.82),rgba(10,10,11,.48)_45%,rgba(10,10,11,.94))]" />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(70% 70% at 20% 10%, rgba(244,255,0,.20), transparent 62%), radial-gradient(65% 60% at 88% 34%, rgba(238,255,0,.38), transparent 64%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <p className="reveal mx-auto mb-6 inline-flex h-[34px] items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-[13px] font-semibold uppercase tracking-[.22em] text-white/72 backdrop-blur-xl">
          <Sparkles className="h-4 w-4 text-[var(--brand-soft)]" aria-hidden="true" />
          MediaForge
        </p>
        <h1 className="reveal text-[clamp(54px,8.8vw,128px)] font-bold leading-[.94] tracking-normal">
          Where Ideas
          <br />
          Become{" "}
          <span className="bg-[linear-gradient(110deg,#fff_22%,var(--brand-soft)_48%,#fff_74%)] bg-[length:220%_100%] bg-clip-text text-transparent animate-[mf-shimmer_4.5s_linear_infinite]">
            Visual Stories.
          </span>
        </h1>
        <p className="reveal mx-auto mt-8 max-w-2xl text-[20px] leading-8 text-[var(--text-default)]">
          Turn imagination into visual stories from idea to final frame, with one workspace for images, video, audio,
          and brand-ready content.
        </p>
        <div className="reveal mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/auth"
            className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-primary)] px-7 text-[15px] font-semibold text-white shadow-[0_12px_32px_-10px_rgba(238,255,0,.8)] transition hover:scale-[1.03] hover:bg-[var(--brand-hover)] sm:w-auto"
          >
            Start for Free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#one-click"
            className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/7 px-7 text-[15px] font-semibold text-white transition hover:bg-white/12 sm:w-auto"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Watch Demo
          </a>
        </div>
        <div className="reveal mx-auto mt-8 flex w-fit flex-col items-center gap-2 text-[12px] text-white/50 animate-[mf-float_2.6s_ease-in-out_infinite]">
          Scroll
          <span className="h-8 w-px bg-gradient-to-b from-white/60 to-transparent" />
        </div>

        <div className="reveal mx-auto mt-8 grid max-w-4xl grid-cols-3 gap-3 text-left">
          {[mockArtworkCreate, mockArtworkFuture, featureAudio].map((image, index) => (
            <div key={image} className="h-[120px] overflow-hidden rounded-lg border border-white/10 bg-white/8 md:h-[180px]">
              <img src={image} alt="" className="h-full w-full object-cover" />
              <div className="-mt-12 h-12 bg-gradient-to-t from-black/70 to-transparent" />
              <p className="relative px-3 pb-3 text-[12px] font-semibold text-white/82">
                {index === 0 ? "Image" : index === 1 ? "Story" : "Audio"}
              </p>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

function OneClick() {
  return (
    <section id="one-click" className="mx-auto max-w-7xl px-5 py-28">
      <div className="mb-12 grid gap-8 md:grid-cols-[.86fr_1.14fr] md:items-end">
        <div>
          <p className="reveal mb-4 text-[13px] font-semibold uppercase tracking-[.22em] text-[var(--brand-soft)]">
            One Click
          </p>
          <h2 className="reveal text-[clamp(38px,5vw,72px)] font-bold leading-[1.02] tracking-normal">
            One creative command.
            <br />
            Every media format.
          </h2>
        </div>
        <p className="reveal max-w-2xl text-[18px] leading-8 text-[var(--text-default)] md:justify-self-end">
          Start from a thought, reference, or product photo. MediaForge routes the work into the right AI tools so teams
          can move from concept to campaign without switching tabs.
        </p>
      </div>

      <div data-stagger className="grid gap-5 md:grid-cols-3">
        {oneClickItems.map((item) => (
          <article
            key={item.title}
            className="group overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] transition duration-300 hover:-translate-y-1 hover:border-[rgba(238,255,0,.55)] hover:shadow-[0_28px_60px_-28px_rgba(238,255,0,.55)]"
          >
            <div className="aspect-[16/10] overflow-hidden">
              <img src={item.image} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            </div>
            <div className="p-5">
              <h3 className="text-[22px] font-semibold">{item.title}</h3>
              <p className="mt-2 text-[16px] leading-7 text-[var(--text-default)]">{item.desc}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ColorShiftSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--brand-deep)]">
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[var(--bg-app)] to-transparent" />
      <div className="relative mx-auto max-w-6xl px-5 py-28">
        <div className="reveal-scale overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_42px_90px_-24px_rgba(0,0,0,.72)]">
          <video src="/videos/hero_banner_new.webm" autoPlay loop muted playsInline className="w-full" />
        </div>

        <h2 className="reveal mt-16 text-[clamp(38px,6vw,80px)] font-bold leading-[1.02] tracking-normal text-white/95">
          MediaForge turns your ideas into
          <br />
          <span className="text-white/58">stunning visuals in minutes.</span>
        </h2>
        <p className="reveal mt-6 max-w-2xl text-[18px] leading-8 text-white/72">
          Whether you are creating viral social posts, explaining a concept, or building brand content, this is where
          ideas become visual stories.
        </p>
        <Link
          to="/auth"
          className="reveal mt-9 inline-flex h-[48px] items-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-[var(--brand-deep)] transition hover:scale-[1.03] hover:bg-white/90"
        >
          Try it Free
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--bg-app)] to-transparent" />
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-28">
      <h2 className="reveal mb-14 text-center text-[clamp(36px,5vw,64px)] font-bold leading-tight tracking-normal">
        Everything you need,
        <br className="sm:hidden" /> <span className="text-[var(--brand-soft)]">in one place.</span>
      </h2>
      <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {featureItems.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.title}
              className="group relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 transition duration-300 hover:-translate-y-1 hover:border-[rgba(238,255,0,.55)]"
            >
              <div
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background: "radial-gradient(420px 220px at 50% 0%, rgba(238,255,0,.2), transparent 70%)",
                }}
              />
              <div className="relative">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[rgba(238,255,0,.16)] text-[var(--brand-soft)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-[22px] font-semibold">{item.title}</h3>
                <p className="mt-2 text-[16px] leading-7 text-[var(--text-default)]">{item.desc}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="overflow-hidden border-y border-[var(--border-subtle)] py-[72px]">
      <p className="reveal mb-8 text-center text-[13px] font-semibold uppercase tracking-[.22em] text-[var(--text-default)]">
        Trusted by creative teams and AI builders
      </p>
      <div className="relative flex">
        <div className="marketing-marquee-track flex shrink-0 gap-14 pr-14">
          {[...proof, ...proof].map((item, index) => (
            <span key={`${item}-${index}`} className="text-[28px] font-semibold text-white/40 transition hover:text-white">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div data-stagger className="mx-auto mt-14 grid max-w-5xl gap-4 px-5 sm:grid-cols-3">
        {[
          { value: "1 click", label: "to start a visual campaign", icon: Zap },
          { value: "30+", label: "languages for voice and narration", icon: BadgeCheck },
          { value: "All-in-one", label: "workspace for media teams", icon: Layers3 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.value} className="rounded-lg border border-white/10 bg-white/[.04] p-5">
              <Icon className="mb-4 h-5 w-5 text-[var(--brand-soft)]" aria-hidden="true" />
              <div className="text-[30px] font-bold">{stat.value}</div>
              <p className="mt-2 text-[15px] leading-6 text-white/62">{stat.label}</p>
            </div>
          );
        })}
      </div>
      <div className="reveal mx-auto mt-12 flex max-w-3xl items-center justify-center gap-3 px-5 text-center text-[16px] leading-7 text-white/66">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--brand-soft)]" aria-hidden="true" />
        Local routes now keep the marketing homepage public while the workspace stays protected under /app/workspace.
      </div>
    </section>
  );
}
