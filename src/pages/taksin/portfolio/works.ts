// ─────────────────────────────────────────────────────────────────────────
// /taksin/portfolio — "Selected Works" content.
// Images are real screenshots / creatives extracted from Taksin's portfolio
// PDF (optimised into /public/images/taksin/portfolio). Captions describe the
// work truthfully; where the exact account/source isn't certain the caption is
// kept general rather than inventing specifics.
// ─────────────────────────────────────────────────────────────────────────

export interface Shot {
  src: string;
  caption: string;
}

export interface WorkSection {
  id: string;
  index: string;
  title: string;
  titleEn: string;
  blurb: string;
  /** "stack" = full-width images (tables/dashboards); "grid" = multi-column creatives. */
  layout: "stack" | "grid";
  shots: Shot[];
}

const P = "/images/taksin/portfolio";

export const workSections: WorkSection[] = [
  {
    id: "ads",
    index: "01",
    title: "ยิงแอด & ดาต้า",
    titleEn: "Performance Ads · Google & Meta · Data",
    blurb:
      "บริหารงบโฆษณารวม ~600,000–800,000 บาท/เดือน บน Meta Ads และ Google Ads — วางโครงสร้างแคมเปญ ทดสอบครีเอทีฟ และอ่านผลจากแดชบอร์ดและตารางข้อมูลจริง เพื่อจัดสรรงบตามผลลัพธ์",
    layout: "stack",
    shots: [
      { src: `${P}/ads-01.jpg`, caption: "Google Ads — แดชบอร์ดแคมเปญ & งบประมาณ" },
      { src: `${P}/ads-06.jpg`, caption: "Performance Report — Google Sheets (งบ / ยอด / ROAS)" },
      { src: `${P}/ads-04.jpg`, caption: "Google Analytics (GA4) — พฤติกรรมผู้ใช้ & คอนเวอร์ชัน" },
      { src: `${P}/ads-05.jpg`, caption: "Data Visualization — ภาพรวมผลลัพธ์แคมเปญ" },
      { src: `${P}/ads-02.jpg`, caption: "Google Tag Manager & การติดตามผล (Tracking)" },
      { src: `${P}/ads-03.jpg`, caption: "แดชบอร์ดวิเคราะห์แคมเปญโฆษณา" },
      { src: `${P}/ads-07.jpg`, caption: "ตารางวิเคราะห์ผลแคมเปญรายตัว" },
      { src: `${P}/ads-08.jpg`, caption: "Deep Report — CPL / CPB / Conversion" },
      { src: `${P}/ads-09.jpg`, caption: "รายงานงบโฆษณา & ผลลัพธ์รายวัน" },
      { src: `${P}/ads-10.jpg`, caption: "รายงานเปรียบเทียบแคมเปญ" },
      { src: `${P}/ads-11.jpg`, caption: "รายงานผลโฆษณา & การจัดสรรงบ" },
      { src: `${P}/ads-12.jpg`, caption: "Product Strategy — แผนสินค้า & งบประมาณ" },
    ],
  },
  {
    id: "client",
    index: "03",
    title: "ลูกค้า & พาร์ตเนอร์",
    titleEn: "Clients & Partners",
    blurb:
      "ตัวอย่างลูกค้าและพาร์ตเนอร์ที่เคยร่วมงาน — ทั้งงานประจำและฟรีแลนซ์ ครอบคลุมเอเจนซี แบรนด์สินค้า ร้านอาหาร และองค์กร",
    layout: "stack",
    shots: [{ src: `${P}/client-01.jpg`, caption: "ลูกค้า & พาร์ตเนอร์บางส่วน" }],
  },
];

// ── Technical / Systems motion graphics (HyperFrames explainers) ──────────
// Five standalone motion-graphic videos that explain Taksin's deeper technical
// work — areas that don't fit "graphic / performance ads" but show the
// engineering & systems side. Each is a 1920×1080 / 10s loop rendered with
// HyperFrames; copy is grounded in the CV (no invented clients or metrics).
const TV = "/videos/taksin";

export interface TechVideo {
  id: string;
  index: string;
  title: string;
  titleEn: string;
  blurb: string;
  src: string;
  poster: string;
}

export const techVideos: TechVideo[] = [
  {
    id: "line-dev",
    index: "01",
    title: "LINE OA & LINE DEV",
    titleEn: "Deep Setup · Messaging API · Webhook",
    blurb:
      "ตั้งค่า LINE Official Account เชิงลึกระดับนักพัฒนา ไม่ใช่แค่หน้าบ้าน — เชื่อม Messaging API & Webhook เข้าระบบหลังบ้าน พร้อมออกแบบ Rich Menu, Flex Message และ Auto-reply ตาม customer journey",
    src: `${TV}/tech-line-dev.mp4`,
    poster: `${TV}/tech-line-dev.jpg`,
  },
  {
    id: "line-ai",
    index: "02",
    title: "AI ตอบแชตอัตโนมัติบน LINE",
    titleEn: "AI Auto-Reply · LINE × LLM",
    blurb:
      "นำ AI มาเชื่อมกับ LINE ให้ตอบลูกค้าเองตลอด 24 ชม. — เข้าใจบริบทธุรกิจและข้อมูลสินค้า ตอบกลับทันที ลดงานแอดมินซ้ำ ๆ และส่งต่อให้ทีมเมื่อต้องคุยจริง",
    src: `${TV}/tech-line-ai.mp4`,
    poster: `${TV}/tech-line-ai.jpg`,
  },
  {
    id: "website",
    index: "03",
    title: "การสร้าง Website",
    titleEn: "Web · UX/UI · Landing · PWA",
    blurb:
      "ออกแบบ UX/UI ใน Figma แล้วพัฒนาเป็นเว็บไซต์และเว็บแอปที่ใช้งานจริง — รองรับทุกหน้าจอ (Responsive) ตั้งแต่ Landing Page ไปจนถึงอีคอมเมิร์ซและ PWA",
    src: `${TV}/tech-website.mp4`,
    poster: `${TV}/tech-website.jpg`,
  },
  {
    id: "org",
    index: "04",
    title: "ระบบองค์กร",
    titleEn: "Org Systems · POS · Booking · SOP",
    blurb:
      "วางโครงสร้างให้ทั้งองค์กรทำงานบนระบบเดียว ไม่ใช่พึ่งตัวบุคคล — ออกแบบกระบวนการและ SOP ติดตั้งระบบ POS & ระบบขาย และสร้างระบบจอง-บริการลูกค้าบน Progressive Web App",
    src: `${TV}/tech-org.mp4`,
    poster: `${TV}/tech-org.jpg`,
  },
  {
    id: "automation",
    index: "05",
    title: "ระบบ Automation",
    titleEn: "Automation · Integration · 24/7",
    blurb:
      "วางระบบอัตโนมัติให้งานซ้ำ ๆ ทำงานเองต่อเนื่อง — เชื่อมระบบผ่าน API & Webhook และซิงก์สต็อก-ออเดอร์ Xcommerce ↔ Shopee / Lazada / LINE พร้อมระบบแจ้งเตือนและตอบอัตโนมัติ",
    src: `${TV}/tech-automation.mp4`,
    poster: `${TV}/tech-automation.jpg`,
  },
];

// ── Mediaforge ventures (live products) ──────────────────────────────────
const V = "/videos/taksin/work";
const VI = "/images/taksin/work";

export interface VentureClip {
  src: string;
  label: string;
}

export const studio = {
  name: "Mediaforge Studio",
  domain: "studio.mediaforge.co",
  url: "https://studio.mediaforge.co",
  logo: `${VI}/studio-logo.png`,
  blurb:
    "โปรดักชันเฮาส์สาย AI — สร้างภาพยนตร์โฆษณา ฉากแอ็กชัน และคอนเทนต์ระดับโปรดักชันด้วย AI-supported workflow",
  // Lightweight cinematic cut-scenes, downloaded locally (autoplay loop).
  clips: [
    { src: `${V}/studio-tuk-tuk.mp4`, label: "Cinematic — Bangkok" },
    { src: `${V}/studio-banana-boat-pattaya-beach.mp4`, label: "Cinematic — Pattaya" },
    { src: `${V}/studio-bullet-shot-action.mp4`, label: "Action Sequence" },
    { src: `${V}/studio-holding-sword.mp4`, label: "Cinematic — Hero Shot" },
  ] as VentureClip[],
  // Heavy showreels streamed cross-origin from the live site (click to play).
  reels: [
    {
      poster: `${VI}/studio-reel-deadisland-poster.jpg`,
      src: "https://studio.mediaforge.co/assets/videos/deadisland-3-1080p.webm",
      label: "Dead Island — AI Film",
    },
    {
      poster: `${VI}/studio-reel-0519-poster.jpg`,
      src: "https://studio.mediaforge.co/assets/videos/0519-copy-4.webm",
      label: "Showreel",
    },
  ],
};

export const mira = {
  name: "Mira AI",
  domain: "mira.mediaforge.co",
  url: "https://mira.mediaforge.co",
  wordmark: `${VI}/mira-wordmark.webp`,
  blurb:
    "ผู้ช่วย AI ในเครือ Mediaforge — ออกแบบประสบการณ์ผู้ใช้และ workflow ของผลิตภัณฑ์ AI ตั้งแต่แชตอัจฉริยะ การเชื่อมหลายช่องทาง ไปจนถึงระบบหลังบ้าน",
  clips: [
    { src: `${V}/mira-hero-chat.mp4`, label: "AI Chat" },
    { src: `${V}/mira-channels.mp4`, label: "Omni-channel" },
    { src: `${V}/mira-back-office.mp4`, label: "Back Office" },
    { src: `${V}/mira-ai-chat-story.mp4`, label: "Conversation Flow" },
    { src: `${V}/mira-miracare.mp4`, label: "Mira Care" },
    { src: `${V}/mira-mirabeauty.mp4`, label: "Mira Beauty" },
  ] as VentureClip[],
};

export const platform = {
  name: "Mediaforge",
  domain: "mediaforge.co",
  url: "https://mediaforge.co",
  logo: "/mascot-logo.png",
  blurb:
    "แพลตฟอร์ม Generative AI สำหรับงานกราฟิก วิดีโอ และ VFX — ออกแบบวิสัยทัศน์ผลิตภัณฑ์ MVP, user flow, feature logic และ AI workflow ในฐานะ CEO / Product Designer",
};
