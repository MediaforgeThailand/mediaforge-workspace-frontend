import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  Building2,
  Clapperboard,
  Cookie,
  CreditCard,
  FileText,
  FolderKanban,
  GraduationCap,
  Home,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  LogIn,
  Maximize2,
  MessageSquareText,
  Newspaper,
  PanelLeft,
  Play,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Subtitles,
  UploadCloud,
  Users,
  Video,
  WandSparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import featureImageGen from "@/assets/feature-image-gen.jpg";
import featureVideoGen from "@/assets/feature-video-gen.jpg";
import featureAudioGen from "@/assets/feature-audio-gen.jpg";
import workspaceHero from "@/assets/home-feature-workspace-hero.png";
import editingHero from "@/assets/home-feature-editing.png";
import threeDHero from "@/assets/home-feature-3d-model.webp";
import cinematicHero from "@/assets/home-feature-cinematic-hero.png";
import academyHero from "@/assets/home-feature-academy.png";
import showcaseFashion from "@/assets/showcase-fashion-winter.jpg";
import showcaseCommercial from "@/assets/showcase-commercial.jpg";
import templateProduct from "@/assets/tpl-product.jpg";

type DraftMode =
  | "home"
  | "generator"
  | "editor"
  | "auth"
  | "pricing"
  | "account"
  | "admin"
  | "public";

interface DraftPage {
  id: string;
  title: string;
  route: string;
  group: string;
  icon: LucideIcon;
  mode: DraftMode;
  accent: string;
  asset?: string;
  nav: string[];
  chips: string[];
  primary: string;
  secondary: string;
  stack: string[];
}

const DRAFT_PAGES: DraftPage[] = [
  {
    id: "workspace",
    title: "Workspace Home",
    route: "/app/workspace",
    group: "Core",
    icon: Home,
    mode: "home",
    accent: "#eaff00",
    asset: workspaceHero,
    nav: ["Home", "Spaces", "Image Gen", "Video Gen", "Smart Frames"],
    chips: ["Create", "Templates", "Recent", "What's New"],
    primary: "Create anything from one command surface",
    secondary: "Recent spaces, tools, templates, and inspirations live in one scannable feed.",
    stack: ["Tool launcher", "Recent spaces", "Template rails", "News cards"],
  },
  {
    id: "spaces",
    title: "Spaces",
    route: "/app/workspace?section=spaces",
    group: "Core",
    icon: FolderKanban,
    mode: "home",
    accent: "#d8ff36",
    asset: editingHero,
    nav: ["Spaces", "Pinned", "Shared", "Archived"],
    chips: ["Board", "List", "Class", "Import"],
    primary: "Project library with fast create",
    secondary: "A dense workspace list with thumbnails, ownership, credits, and status.",
    stack: ["Space cards", "Owner filters", "Activity row", "Quick actions"],
  },
  {
    id: "image-gen",
    title: "Image Gen",
    route: "/app/workspace?section=image_gen",
    group: "Generators",
    icon: ImageIcon,
    mode: "generator",
    accent: "#f4ff00",
    asset: featureImageGen,
    nav: ["Model", "References", "Prompt", "Settings"],
    chips: ["Nano Banana 2", "1K", "Auto", "4 refs"],
    primary: "Reference first image creation",
    secondary: "Upload, prompt, and variation controls stay left while results fill the stage.",
    stack: ["Reference upload", "Prompt composer", "Aspect", "Resolution"],
  },
  {
    id: "video-gen",
    title: "Video Gen",
    route: "/app/workspace?section=video_gen",
    group: "Generators",
    icon: Video,
    mode: "generator",
    accent: "#eaff00",
    asset: featureVideoGen,
    nav: ["Mode", "Frames", "Prompt", "Motion"],
    chips: ["SeedDance 2.0", "16:9", "720p", "5s"],
    primary: "Storyboard style video input",
    secondary: "Start/end frames, prompt, audio, and duration use the same footer generation pattern.",
    stack: ["Start frame", "End frame", "Prompt", "Duration"],
  },
  {
    id: "upscale",
    title: "Upscale",
    route: "/app/workspace?section=image_upscale",
    group: "Generators",
    icon: Maximize2,
    mode: "generator",
    accent: "#cfff5e",
    asset: showcaseCommercial,
    nav: ["Source", "Target", "Quality"],
    chips: ["1 image", "1K", "Medium", "Clean"],
    primary: "Focused single-source enhancement",
    secondary: "The source box should feel like a premium drop target, not an empty file well.",
    stack: ["Source media", "Target size", "Quality", "Preview"],
  },
  {
    id: "smart-frames",
    title: "Smart Frames",
    route: "/app/workspace?section=smart_frames",
    group: "Generators",
    icon: Clapperboard,
    mode: "generator",
    accent: "#eaff00",
    asset: cinematicHero,
    nav: ["Source", "Note", "Mode"],
    chips: ["MP4", "Clean Cut", "Editable", "Local"],
    primary: "Dead-air removal as a clear media tool",
    secondary: "One source upload, one mode card, one sticky generate action at the bottom.",
    stack: ["Source MP4", "Optional note", "Clean Cut", "Result summary"],
  },
  {
    id: "auto-subtitle",
    title: "Auto Subtitle",
    route: "/app/workspace?section=auto_subtitle",
    group: "Generators",
    icon: Subtitles,
    mode: "generator",
    accent: "#dfff36",
    asset: featureVideoGen,
    nav: ["Media", "Language", "Style", "Export"],
    chips: ["Whisper", "TH/EN", "Burn-in", "SRT"],
    primary: "Caption production panel",
    secondary: "A media upload path with transcript preview, style presets, and export targets.",
    stack: ["Source video", "Language", "Caption style", "Export"],
  },
  {
    id: "three-d",
    title: "3D Gen",
    route: "/app/workspace?section=three_d",
    group: "Generators",
    icon: Box,
    mode: "generator",
    accent: "#b8ff6a",
    asset: threeDHero,
    nav: ["Reference", "Texture", "PBR", "Viewer"],
    chips: ["Tripo", "GLB", "Texture", "PBR"],
    primary: "Object creation with viewer confidence",
    secondary: "Keep inputs small and put model inspection in the main preview surface.",
    stack: ["Reference image", "Texture toggle", "PBR toggle", "Model viewer"],
  },
  {
    id: "editor",
    title: "Studio Editor",
    route: "/app/editor",
    group: "Studio",
    icon: Layers3,
    mode: "editor",
    accent: "#eaff00",
    asset: editingHero,
    nav: ["Assets", "Canvas", "Timeline", "Inspector"],
    chips: ["Preview", "Timeline", "Effects", "Export"],
    primary: "Full production workspace",
    secondary: "The editor keeps Beeble-like restraint, but uses denser tools and clear timeline hierarchy.",
    stack: ["Asset rail", "Preview", "Inspector", "Timeline"],
  },
  {
    id: "auth",
    title: "Auth",
    route: "/auth, /reset-password",
    group: "Public",
    icon: LogIn,
    mode: "auth",
    accent: "#f4ff00",
    asset: showcaseFashion,
    nav: ["Sign in", "Email", "Google", "Reset"],
    chips: ["SSO", "Email OTP", "Password", "Org"],
    primary: "Small, confident entry point",
    secondary: "Auth should feel like the same product, not a separate marketing page.",
    stack: ["Brand panel", "Provider buttons", "Email field", "Org route"],
  },
  {
    id: "pricing",
    title: "Pricing",
    route: "/app/pricing, /pricing",
    group: "Account",
    icon: CreditCard,
    mode: "pricing",
    accent: "#eaff00",
    asset: templateProduct,
    nav: ["Plans", "Credits", "Billing", "Team"],
    chips: ["Monthly", "Annual", "Credits", "Team"],
    primary: "Plan cards inside the app shell",
    secondary: "Pricing should scan like a purchase decision, with credits and model costs nearby.",
    stack: ["Plan cards", "Credit meter", "Model costs", "Billing CTA"],
  },
  {
    id: "account",
    title: "Settings and Usage",
    route: "/app/settings, /app/usage",
    group: "Account",
    icon: Settings,
    mode: "account",
    accent: "#d9ff4a",
    asset: featureAudioGen,
    nav: ["Profile", "Billing", "API", "Usage"],
    chips: ["Profile", "Keys", "Credits", "Invoices"],
    primary: "Quiet operational settings",
    secondary: "Tables, toggles, API keys, and usage charts stay compact and easy to scan.",
    stack: ["Profile", "Plan", "API keys", "Usage table"],
  },
  {
    id: "org-admin",
    title: "Teacher Center",
    route: "/app/org-admin, /app/org-admin/branding",
    group: "Admin",
    icon: GraduationCap,
    mode: "admin",
    accent: "#eaff00",
    asset: academyHero,
    nav: ["Classes", "Members", "AI Usage", "Codes"],
    chips: ["Class", "Credits", "Branding", "Reports"],
    primary: "Command center for education teams",
    secondary: "Classes, member activity, workspace credits, and branding need a calm admin surface.",
    stack: ["Class list", "Members", "AI usage", "Branding"],
  },
  {
    id: "team",
    title: "Team and Affiliate",
    route: "/app/team-register, /app/affiliate",
    group: "Account",
    icon: Users,
    mode: "account",
    accent: "#cfff5e",
    asset: workspaceHero,
    nav: ["Team", "Invite", "Affiliate", "Payouts"],
    chips: ["Seats", "Invite", "Links", "Rewards"],
    primary: "Growth surfaces in app chrome",
    secondary: "Team registration and affiliate tools should inherit the workspace navigation language.",
    stack: ["Seat count", "Invite link", "Affiliate stats", "Payouts"],
  },
  {
    id: "public",
    title: "Public Pages",
    route: "/blog, /enroll-class/:code, /privacy, /terms, /refund, /aup, /cookies",
    group: "Public",
    icon: Newspaper,
    mode: "public",
    accent: "#eaff00",
    asset: cinematicHero,
    nav: ["Blog", "Enroll", "Legal", "Cookies"],
    chips: ["Article", "Class", "Docs", "Consent"],
    primary: "Public pages with app-brand consistency",
    secondary: "The same typography, cards, and logo language carry through public surfaces.",
    stack: ["Blog cards", "Class enroll", "Legal docs", "Cookie consent"],
  },
];

const GROUPS = ["Core", "Generators", "Studio", "Account", "Admin", "Public"];

const tonalIcons: LucideIcon[] = [
  Sparkles,
  WandSparkles,
  BarChart3,
  KeyRound,
  WalletCards,
  ShieldCheck,
];

export default function DesignDraft() {
  const [query, setQuery] = useState("");
  const visiblePages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return DRAFT_PAGES;
    return DRAFT_PAGES.filter((page) => {
      const haystack = [
        page.title,
        page.route,
        page.group,
        page.primary,
        page.secondary,
        ...page.nav,
        ...page.chips,
        ...page.stack,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  return (
    <main className="mf-ui-draft-page">
      <aside className="mf-ui-draft-sidebar">
        <a className="mf-ui-draft-brand" href="/app/workspace" aria-label="MediaForge workspace">
          <img src={logoIcon} alt="" />
          <span>MediaForge</span>
        </a>
        <nav className="mf-ui-draft-nav" aria-label="Draft sections">
          {GROUPS.map((group) => (
            <a key={group} href={`#${group.toLowerCase()}`}>
              <span />
              {group}
            </a>
          ))}
        </nav>
        <div className="mf-ui-draft-sidebar-card">
          <span>Draft route</span>
          <strong>/app/ui-draft</strong>
        </div>
      </aside>

      <section className="mf-ui-draft-main">
        <header className="mf-ui-draft-hero">
          <div>
            <span className="mf-ui-draft-kicker">Beeble-inspired app direction</span>
            <h1>MediaForge UI Draft Board</h1>
          </div>
          <div className="mf-ui-draft-hero-actions">
            <label className="mf-ui-draft-search">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages"
              />
            </label>
            <a className="mf-ui-draft-open" href="/app/workspace">
              Open workspace
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </header>

        <section className="mf-ui-draft-principles" aria-label="Design language">
          {[
            ["Shell", "Thin dark rail, compact nav, strong active state"],
            ["Inputs", "Left-side tools with rounded media wells and footer actions"],
            ["Canvas", "Large quiet result stage with one empty-state focal point"],
            ["Brand", "MediaForge black and electric yellow, no Beeble colors copied"],
          ].map(([title, body], index) => {
            const Icon = tonalIcons[index % tonalIcons.length];
            return (
              <article key={title}>
                <Icon className="h-4 w-4" />
                <strong>{title}</strong>
                <span>{body}</span>
              </article>
            );
          })}
        </section>

        {GROUPS.map((group) => {
          const pages = visiblePages.filter((page) => page.group === group);
          if (pages.length === 0) return null;
          return (
            <section key={group} id={group.toLowerCase()} className="mf-ui-draft-section">
              <div className="mf-ui-draft-section-head">
                <h2>{group}</h2>
                <span>{pages.length} surfaces</span>
              </div>
              <div className="mf-ui-draft-grid">
                {pages.map((page) => (
                  <DraftCard key={page.id} page={page} />
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}

function DraftCard({ page }: { page: DraftPage }) {
  const Icon = page.icon;
  return (
    <article className="mf-ui-draft-card" style={{ "--draft-accent": page.accent } as CSSProperties}>
      <div className="mf-ui-draft-card-head">
        <span className="mf-ui-draft-page-icon">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3>{page.title}</h3>
          <p>{page.route}</p>
        </div>
      </div>
      <DraftMockup page={page} />
      <div className="mf-ui-draft-card-foot">
        <div>
          <strong>{page.primary}</strong>
          <span>{page.secondary}</span>
        </div>
        <div className="mf-ui-draft-chip-row">
          {page.stack.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function DraftMockup({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-screen">
      <div className="mf-ui-draft-mini-rail">
        <span className="is-logo">
          <img src={logoIcon} alt="" />
        </span>
        {page.nav.slice(0, 5).map((item, index) => (
          <span key={item} className={index === 0 ? "is-active" : undefined}>
            {item.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="mf-ui-draft-mini-app">
        <div className="mf-ui-draft-mini-topbar">
          <div>
            <span />
            <strong>{page.title}</strong>
          </div>
          <button type="button">
            <Bell className="h-3.5 w-3.5" />
          </button>
        </div>
        {renderMode(page)}
      </div>
    </div>
  );
}

function renderMode(page: DraftPage) {
  if (page.mode === "home") return <HomeMock page={page} />;
  if (page.mode === "generator") return <GeneratorMock page={page} />;
  if (page.mode === "editor") return <EditorMock page={page} />;
  if (page.mode === "auth") return <AuthMock page={page} />;
  if (page.mode === "pricing") return <PricingMock page={page} />;
  if (page.mode === "admin") return <AdminMock page={page} />;
  if (page.mode === "public") return <PublicMock page={page} />;
  return <AccountMock page={page} />;
}

function HomeMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-home">
      <div className="mf-ui-draft-command">
        <Sparkles className="h-4 w-4" />
        <span>{page.primary}</span>
        <button type="button">Create</button>
      </div>
      <div className="mf-ui-draft-home-grid">
        {[page.asset, featureImageGen, featureVideoGen].map((asset, index) => (
          <div key={`${page.id}-${index}`} className="mf-ui-draft-media-tile">
            {asset && <img src={asset} alt="" />}
            <span>{page.chips[index] ?? "Draft"}</span>
          </div>
        ))}
      </div>
      <div className="mf-ui-draft-row-cards">
        {page.stack.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function GeneratorMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-generator">
      <div className="mf-ui-draft-generator-panel">
        <div className="mf-ui-draft-model-row">
          <span />
          <div>
            <small>Model</small>
            <strong>{page.chips[0]}</strong>
          </div>
        </div>
        <div className="mf-ui-draft-upload-box">
          <UploadCloud className="h-5 w-5" />
          <strong>{page.stack[0]}</strong>
          <span>{page.chips.slice(1).join(" · ")}</span>
        </div>
        <div className="mf-ui-draft-prompt-box">
          <MessageSquareText className="h-4 w-4" />
          <span>{page.stack[1] ?? "Prompt"}</span>
        </div>
        <div className="mf-ui-draft-setting-list">
          {page.stack.slice(2).map((item) => (
            <span key={item}>
              {item}
              <strong>{page.chips[2] ?? "Auto"}</strong>
            </span>
          ))}
        </div>
        <button type="button" className="mf-ui-draft-gen-button">
          <WandSparkles className="h-4 w-4" />
          Generate
        </button>
      </div>
      <div className="mf-ui-draft-result-stage">
        {page.asset ? <img src={page.asset} alt="" /> : <Play className="h-8 w-8" />}
        <div>
          <strong>{page.title}</strong>
          <span>{page.primary}</span>
        </div>
      </div>
    </div>
  );
}

function EditorMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-editor">
      <div className="mf-ui-draft-editor-assets">
        {[workspaceHero, featureVideoGen, showcaseFashion].map((asset) => (
          <span key={asset}>
            <img src={asset} alt="" />
          </span>
        ))}
      </div>
      <div className="mf-ui-draft-editor-canvas">
        <img src={page.asset} alt="" />
        <button type="button">
          <Play className="h-4 w-4" />
        </button>
      </div>
      <div className="mf-ui-draft-editor-inspector">
        <span>
          <PanelLeft className="h-3.5 w-3.5" />
          Inspector
        </span>
        <i />
        <i />
        <i />
      </div>
      <div className="mf-ui-draft-timeline">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function AuthMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-auth">
      <div className="mf-ui-draft-auth-art">
        {page.asset && <img src={page.asset} alt="" />}
      </div>
      <div className="mf-ui-draft-auth-card">
        <img src={logoIcon} alt="" />
        <strong>Sign in to MediaForge</strong>
        <button type="button">Continue with Google</button>
        <span>Email address</span>
        <button type="button" className="is-primary">Continue</button>
      </div>
    </div>
  );
}

function PricingMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-pricing">
      {["Starter", "Pro", "Studio"].map((plan, index) => (
        <div key={plan} className={index === 1 ? "is-featured" : undefined}>
          <span>{plan}</span>
          <strong>{index === 0 ? "1K" : index === 1 ? "10K" : "50K"}</strong>
          <small>credits</small>
          <button type="button">{index === 1 ? "Upgrade" : "Select"}</button>
        </div>
      ))}
      <div className="mf-ui-draft-credit-strip">
        <BadgeDollarSign className="h-4 w-4" />
        <span>{page.stack.join(" · ")}</span>
      </div>
    </div>
  );
}

function AccountMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-account">
      <div className="mf-ui-draft-account-list">
        {page.stack.map((item, index) => {
          const Icon = [Settings, CreditCard, KeyRound, BarChart3][index % 4];
          return (
            <span key={item}>
              <Icon className="h-4 w-4" />
              {item}
            </span>
          );
        })}
      </div>
      <div className="mf-ui-draft-chart">
        <span style={{ height: "34%" }} />
        <span style={{ height: "62%" }} />
        <span style={{ height: "48%" }} />
        <span style={{ height: "78%" }} />
        <span style={{ height: "55%" }} />
      </div>
    </div>
  );
}

function AdminMock({ page }: { page: DraftPage }) {
  return (
    <div className="mf-ui-draft-admin">
      <div className="mf-ui-draft-class-list">
        {["Cinematic AI", "Product Lab", "Final Projects"].map((item) => (
          <span key={item}>
            <BookOpen className="h-4 w-4" />
            {item}
          </span>
        ))}
      </div>
      <div className="mf-ui-draft-admin-main">
        <div>
          <Building2 className="h-5 w-5" />
          <strong>{page.primary}</strong>
        </div>
        <div className="mf-ui-draft-admin-bars">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function PublicMock({ page }: { page: DraftPage }) {
  const items = [
    { icon: Newspaper, label: "Blog" },
    { icon: GraduationCap, label: "Enroll" },
    { icon: Shield, label: "Terms" },
    { icon: Cookie, label: "Cookies" },
    { icon: FileText, label: "AUP" },
  ];

  return (
    <div className="mf-ui-draft-public">
      <div className="mf-ui-draft-public-hero">
        {page.asset && <img src={page.asset} alt="" />}
        <strong>{page.primary}</strong>
      </div>
      <div className="mf-ui-draft-public-list">
        {items.map(({ icon: Icon, label }) => (
          <span key={label}>
            <Icon className="h-4 w-4" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
