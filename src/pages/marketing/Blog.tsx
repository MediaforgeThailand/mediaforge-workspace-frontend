import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { FinalCTA, MarketingNavbar } from "./MarketingShell";
import logoIcon from "@/assets/logo-icon.png";
import mockArtworkFuture from "@/assets/mock-artwork-future.jpg";
import mockArtworkCreate from "@/assets/mock-artwork-create.jpg";
import mockArtworkText from "@/assets/mock-artwork-text.jpg";
import featureImage from "@/assets/feature-image-gen.jpg";
import featureVideo from "@/assets/feature-video-gen.jpg";
import featureAudio from "@/assets/feature-audio-gen.jpg";
import showcaseCommercial from "@/assets/showcase-commercial.jpg";
import showcaseFashion from "@/assets/showcase-fashion-winter.jpg";
import tplProduct from "@/assets/tpl-product.jpg";
import tplCinematic from "@/assets/tpl-cinematic.jpg";
import proTrendCyberpunk from "@/assets/pro-trend-cyberpunk-city.jpg";
import proTrendSynthwave from "@/assets/pro-trend-synthwave.jpg";

type Post = {
  id: string;
  title: string;
  date: string;
  category: string;
  cover: string;
  url: string;
  author: {
    name: string;
    avatar: string;
  };
};

const categories = ["All", "Featured", "Updates", "AI Video", "Feature Guides", "Video Guides", "Image Guides"];

const authors = {
  editorial: { name: "MediaForge Editorial", avatar: logoIcon },
  studio: { name: "DMD Studio Lab", avatar: featureImage },
  product: { name: "MediaForge Product", avatar: featureVideo },
};

const posts: Post[] = [
  {
    id: "visual-stories",
    title: "How AI creators turn loose ideas into visual stories",
    date: "May 3, 2026",
    category: "Featured",
    cover: mockArtworkFuture,
    url: "/blog#visual-stories",
    author: authors.editorial,
  },
  {
    id: "one-click-workflow",
    title: "The one-click workflow for campaign images, clips, and audio",
    date: "May 2, 2026",
    category: "Featured",
    cover: mockArtworkCreate,
    url: "/blog#one-click-workflow",
    author: authors.product,
  },
  {
    id: "workspace-update",
    title: "MediaForge Workspace update: faster project-to-space creation",
    date: "Apr 29, 2026",
    category: "Updates",
    cover: mockArtworkText,
    url: "/blog#workspace-update",
    author: authors.product,
  },
  {
    id: "video-prompts",
    title: "Prompt patterns for cinematic AI video shots",
    date: "Apr 28, 2026",
    category: "AI Video",
    cover: featureVideo,
    url: "/blog#video-prompts",
    author: authors.studio,
  },
  {
    id: "image-guides",
    title: "Image guide: product scenes that still feel on brand",
    date: "Apr 26, 2026",
    category: "Image Guides",
    cover: tplProduct,
    url: "/blog#image-guides",
    author: authors.editorial,
  },
  {
    id: "video-guides",
    title: "Video guide: from reference frame to scroll-stopping motion",
    date: "Apr 25, 2026",
    category: "Video Guides",
    cover: tplCinematic,
    url: "/blog#video-guides",
    author: authors.studio,
  },
  {
    id: "feature-guide-worlds",
    title: "Feature guide: building characters, worlds, and reusable scenes",
    date: "Apr 23, 2026",
    category: "Feature Guides",
    cover: proTrendCyberpunk,
    url: "/blog#feature-guide-worlds",
    author: authors.product,
  },
  {
    id: "audio-for-creators",
    title: "Why voice and music matter in AI-native storytelling",
    date: "Apr 21, 2026",
    category: "Feature Guides",
    cover: featureAudio,
    url: "/blog#audio-for-creators",
    author: authors.editorial,
  },
  {
    id: "image-quality",
    title: "Image guide: art direction checks before you publish",
    date: "Apr 20, 2026",
    category: "Image Guides",
    cover: featureImage,
    url: "/blog#image-quality",
    author: authors.studio,
  },
  {
    id: "social-ads",
    title: "Designing AI visuals for social ads without losing the product",
    date: "Apr 18, 2026",
    category: "Updates",
    cover: showcaseCommercial,
    url: "/blog#social-ads",
    author: authors.product,
  },
  {
    id: "fashion-motion",
    title: "Video guide: fashion motion from lookbook to campaign cut",
    date: "Apr 15, 2026",
    category: "AI Video",
    cover: showcaseFashion,
    url: "/blog#fashion-motion",
    author: authors.studio,
  },
  {
    id: "creator-systems",
    title: "Feature guide: reusable creative systems for small teams",
    date: "Apr 12, 2026",
    category: "Feature Guides",
    cover: proTrendSynthwave,
    url: "/blog#creator-systems",
    author: authors.editorial,
  },
];

export default function BlogPage() {
  const [active, setActive] = useState("All");
  useReveal(active);

  const visiblePosts = useMemo(() => {
    if (active === "All") return posts;
    if (active === "Featured") return posts.filter((post) => post.category === "Featured");
    return posts.filter((post) => post.category === active);
  }, [active]);

  const featuredPosts = posts.filter((post) => post.category === "Featured");

  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[var(--bg-app)] text-white">
      <MarketingNavbar />
      <BlogHero />
      <CategoryChips active={active} onChange={setActive} />
      <FeaturedRow posts={featuredPosts} />
      <PostGrid title={active === "All" ? "Latest from MediaForge" : active} posts={visiblePosts} />
      <FinalCTA />
    </main>
  );
}

function BlogHero() {
  return (
    <section className="relative flex h-[62vh] min-h-[460px] items-center justify-center overflow-hidden px-5 text-center">
      <div className="absolute inset-0">
        <img src={mockArtworkFuture} alt="" className="h-full w-full scale-110 object-cover blur-[2px] animate-[mf-float_12s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/46 via-[rgba(91,42,140,.48)] to-black/92" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl pt-20">
        <div className="reveal mb-3 text-[15px] italic text-white/70">MediaForge Artifacts</div>
        <h1 className="reveal text-[clamp(42px,6vw,82px)] font-bold leading-[1.04] tracking-normal">
          Stories, insights,
          <br />
          and guides for{" "}
          <span className="bg-gradient-to-r from-[var(--brand-soft)] to-white bg-clip-text text-transparent">
            AI creators
          </span>
        </h1>
        <p className="reveal mx-auto mt-6 max-w-2xl text-[18px] leading-8 text-white/75">
          Build, create, and grow with MediaForge.
        </p>
      </div>
    </section>
  );
}

function CategoryChips({ active, onChange }: { active: string; onChange: (category: string) => void }) {
  return (
    <div className="sticky top-[82px] z-20 flex flex-wrap justify-center gap-3 bg-gradient-to-b from-[var(--bg-app)] to-[rgba(10,10,11,.72)] px-5 py-8 backdrop-blur-md">
      {categories.map((category) => {
        const on = active === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`h-[40px] rounded-full px-5 text-[14px] font-medium transition ${
              on
                ? "scale-[1.04] bg-[var(--brand-primary)] text-white shadow-[0_8px_24px_-8px_rgba(155,77,224,.75)]"
                : "border border-white/10 bg-transparent text-[var(--text-default)] hover:border-white/30 hover:text-white"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

function FeaturedRow({ posts }: { posts: Post[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 pt-8">
      <h2 className="reveal mb-6 text-[34px] font-bold tracking-normal">Featured</h2>
      <div data-stagger className="grid gap-6 md:grid-cols-2">
        {posts.slice(0, 2).map((post) => (
          <BlogCard key={post.id} post={post} large />
        ))}
      </div>
    </section>
  );
}

function PostGrid({ title, posts }: { title: string; posts: Post[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="reveal text-[34px] font-bold tracking-normal">{title}</h2>
        <Link
          to="/blog"
          className="reveal inline-flex h-[38px] w-fit items-center gap-2 rounded-full border border-white/15 px-4 text-[14px] text-white/80 transition hover:border-white/40 hover:text-white"
        >
          View All
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function BlogCard({ post, large = false }: { post: Post; large?: boolean }) {
  return (
    <a
      href={post.url}
      className="group reveal block overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] transition duration-500 hover:-translate-y-1 hover:border-[rgba(155,77,224,.55)] hover:shadow-[0_30px_60px_-22px_rgba(155,77,224,.45)]"
    >
      <div className={`relative overflow-hidden ${large ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        <img src={post.cover} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/72 to-transparent" />
        <span className="absolute left-3 top-3 rounded-md bg-[var(--brand-primary)] px-2 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-white shadow-[0_4px_12px_rgba(155,77,224,.62)]">
          Featured
        </span>
        <span className="absolute bottom-3 right-3 rounded-md border border-white/16 bg-black/35 px-2 py-1 text-[11px] font-semibold text-white/82 backdrop-blur">
          {post.category}
        </span>
      </div>
      <div className="p-5">
        <div className="mb-2 text-[13px] text-[var(--text-default)]">{post.date}</div>
        <h3 className={`${large ? "text-[24px]" : "text-[19px]"} font-semibold leading-snug transition group-hover:text-[var(--brand-soft)]`}>
          {post.title}
        </h3>
        <div className="mt-4 flex items-center gap-2 text-[14px] text-[var(--text-default)]">
          <img src={post.author.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
          <span>By {post.author.name}</span>
        </div>
      </div>
    </a>
  );
}
