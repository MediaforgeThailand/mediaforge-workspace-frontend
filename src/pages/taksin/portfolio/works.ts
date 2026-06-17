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
    id: "clinic",
    index: "02",
    title: "คลินิก & ความงาม",
    titleEn: "Clinic & Beauty Campaigns",
    blurb:
      "งานครีเอทีฟและแคมเปญสายคลินิก / ความงาม — ออกแบบข้อเสนอ (offer) และครีเอทีฟที่ขับยอดทักแชตและการจอง วาง Retargeting ด้วย Facebook Pixel",
    layout: "grid",
    shots: [
      { src: `${P}/clinic-01.jpg`, caption: "คลินิกความงาม — ฉีดหน้าเรียว (Meta Ads)" },
      { src: `${P}/clinic-02.jpg`, caption: "โปรโมชันคลินิก ฿3,990" },
      { src: `${P}/clinic-03.jpg`, caption: "ครีเอทีฟคลินิก — ข้อเสนอ & บริการ" },
      { src: `${P}/clinic-04.jpg`, caption: "คลินิก — ทีมแพทย์ & บริการ" },
      { src: `${P}/clinic-05.jpg`, caption: "ครีเอทีฟโฆษณาคลินิก" },
    ],
  },
  {
    id: "campaign",
    index: "03",
    title: "แคมเปญ & ครีเอทีฟ",
    titleEn: "Seasonal & E-commerce Campaigns",
    blurb:
      "ชุดครีเอทีฟแคมเปญตามเทศกาลและอีคอมเมิร์ซ — 11.11 / 12.12 / Christmas / โปรโมชัน วางคอนเซ็ปต์ ข้อความ และดีไซน์ให้สอดคล้องกับเป้าหมายการขาย",
    layout: "grid",
    shots: [
      { src: `${P}/campaign-01.jpg`, caption: "Christmas Sale — แคมเปญเทศกาล" },
      { src: `${P}/campaign-02.jpg`, caption: "Christmas — ชุดครีเอทีฟ" },
      { src: `${P}/campaign-03.jpg`, caption: "12.12 — Mega Campaign" },
      { src: `${P}/campaign-04.jpg`, caption: "11.11 — Cashback Campaign" },
      { src: `${P}/campaign-05.jpg`, caption: "แคมเปญปีใหม่ / ลดราคา" },
      { src: `${P}/campaign-06.jpg`, caption: "โปรโมชัน — ลดสูงสุด 80%" },
      { src: `${P}/campaign-07.jpg`, caption: "คอร์ส PDPA — ครีเอทีฟโฆษณา" },
    ],
  },
  {
    id: "design",
    index: "04",
    title: "ดีไซน์ & เว็บไซต์",
    titleEn: "Design · UX/UI · Web",
    blurb:
      "งานออกแบบเมนู สื่อสิ่งพิมพ์ และ UX/UI เว็บไซต์ / เว็บแอป (Figma) — รวมถึงหน้าเว็บอีคอมเมิร์ซและ Landing Page",
    layout: "grid",
    shots: [
      { src: `${P}/design-03.jpg`, caption: "UX/UI — เว็บไซต์ & เว็บแอป (Figma)" },
      { src: `${P}/design-04.jpg`, caption: "Web / App Mockup" },
      { src: `${P}/design-05.jpg`, caption: "หน้าเว็บสินค้า / อีคอมเมิร์ซ" },
      { src: `${P}/design-06.jpg`, caption: "Landing Page — งานออกแบบ" },
      { src: `${P}/design-01.jpg`, caption: "ออกแบบเมนู — เครื่องดื่ม / Jameson" },
      { src: `${P}/design-02.jpg`, caption: "ออกแบบเมนูร้านอาหาร" },
    ],
  },
  {
    id: "brand",
    index: "05",
    title: "แบรนด์ & กราฟิก",
    titleEn: "Branding & Graphic Direction",
    blurb:
      "งานวางภาพลักษณ์แบรนด์และ Graphic Brief — ตั้งแต่ร้านอาหาร / บาร์ ไปจนถึงแฟชั่นแบรนด์",
    layout: "grid",
    shots: [
      { src: `${P}/brand-01.jpg`, caption: "COALS Steakhouse & Bar — Branding" },
      { src: `${P}/brand-02.jpg`, caption: "COALS — Grand Opening Graphics" },
      { src: `${P}/brand-03.jpg`, caption: "Graphic Brief — งานแบรนด์" },
      { src: `${P}/brand-04.jpg`, caption: "HIMORE — แฟชั่นแบรนด์" },
      { src: `${P}/brand-05.jpg`, caption: "HIMORE — Social / Lookbook" },
    ],
  },
  {
    id: "client",
    index: "06",
    title: "ลูกค้า & พาร์ตเนอร์",
    titleEn: "Clients & Partners",
    blurb:
      "ตัวอย่างลูกค้าและพาร์ตเนอร์ที่เคยร่วมงาน — ทั้งงานประจำและฟรีแลนซ์ ครอบคลุมเอเจนซี แบรนด์สินค้า ร้านอาหาร และองค์กร",
    layout: "stack",
    shots: [{ src: `${P}/client-01.jpg`, caption: "ลูกค้า & พาร์ตเนอร์บางส่วน" }],
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
