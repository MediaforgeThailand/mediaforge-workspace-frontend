// ─────────────────────────────────────────────────────────────────────────
// Taksin Taeprasert — portfolio content (Thai).
// Single source of truth for the /taksin landing page. All facts are drawn
// from the current CV (Taksin_Taeprasert_CV.pdf). Role titles and tool names
// are kept in English by convention (industry-standard in Thai tech context).
// ─────────────────────────────────────────────────────────────────────────

export const profile = {
  nameLatin: "Taksin Taeprasert",
  nameTh: "ทักษิณ แต้ประเสริฐ",
  roleLine: ["AI Product Designer", "System Analyst", "Performance & Operations Lead"],
  heroHeadline: "เปลี่ยนปัญหาธุรกิจที่ไม่ชัดเจน\nให้กลายเป็น “ระบบที่วัดผลได้”",
  heroSub:
    "6 ปีในสายการตลาดและวิศวกรรมระบบ — จากการยิงแอดสายลึก สู่การวางโครงสร้างระบบ ดาต้าเชิงลึก ออโตเมชัน และการสร้างแพลตฟอร์ม AI ให้องค์กรใช้งานจริง",
  summary:
    "มืออาชีพสายผลลัพธ์ ประสบการณ์ 6 ปี ครอบคลุมทั้งการตลาดและวิศวกรรม โดย 4 ปีอยู่ในระดับผู้จัดการและผู้นำทีม เติบโตจากงาน Digital Marketing และ Performance Ads สู่งานวิเคราะห์ข้อมูล วางระบบปฏิบัติการธุรกิจ ออกแบบระบบ และพัฒนาผลิตภัณฑ์ AI",
  summary2:
    "ถนัดการเป็น “เจ้าของปัญหา” เปลี่ยนสถานการณ์ที่ไม่ชัดเจนให้กลายเป็นระบบที่จับต้องได้ และผลักดันผลลัพธ์ที่วัดได้ผ่านดาต้าและการลงมือทำอย่างมีวินัย ปัจจุบันนำทีมสตาร์ทอัพ AI สร้างแพลตฟอร์ม Generative AI สำหรับงานกราฟิก วิดีโอ และ VFX — ผสานกลยุทธ์ธุรกิจ การออกแบบโปรดักต์ AI workflow และ creative direction",
  portrait: "/images/taksin/portrait.png",
  location: "Bangkok, Thailand",
} as const;

export interface Venture {
  name: string;
  domain: string;
  url: string;
  role: string;
  period: string;
  blurb: string;
  needsInput?: boolean;
}

export const ventures: Venture[] = [
  {
    name: "Mediaforge",
    domain: "mediaforge.co",
    url: "https://mediaforge.co",
    role: "CEO / Product Designer",
    period: "2025 – ปัจจุบัน",
    blurb:
      "แพลตฟอร์ม Generative AI สำหรับงานกราฟิก วิดีโอ และ VFX — ออกแบบวิสัยทัศน์ผลิตภัณฑ์ วาง MVP, user flow, feature logic, backend logic และ AI workflow ทำงานใกล้ชิดกับทีมพัฒนาเพื่อเปลี่ยนไอเดียธุรกิจให้เป็นโปรดักต์ที่ใช้งานจริง",
  },
  {
    name: "MiraAI",
    domain: "mira.mediaforge.co",
    url: "https://mira.mediaforge.co",
    role: "Product Designer",
    period: "2025 – ปัจจุบัน",
    blurb:
      "ผลิตภัณฑ์ AI ในเครือ Mediaforge — ออกแบบประสบการณ์ผู้ใช้และ workflow ของผลิตภัณฑ์ AI ต่อยอดจากแพลตฟอร์มหลัก (รอยืนยันรายละเอียดจากคุณทักษิณ)",
    needsInput: true,
  },
  {
    name: "Mediaforge Studio",
    domain: "studio.mediaforge.co",
    url: "https://studio.mediaforge.co",
    role: "Production / Operations Lead",
    period: "2024 – ปัจจุบัน",
    blurb:
      "โปรดักชันเฮาส์สาย AI ส่งมอบงานให้ลูกค้าด้วย AI-supported workflow รวมถึงโปรเจกต์คอนเทนต์ AI ร่วมกับองค์กรภาครัฐ (ขสมก. / BMTA) และมหาวิทยาลัย — เติบโตจากรากฐานการวางระบบปฏิบัติการที่ CT Studio",
  },
];

export interface Pillar {
  id: string;
  index: string;
  title: string;
  titleEn: string;
  tagline: string;
  video: string;
  poster: string;
  points: string[];
  metrics: { value: string; label: string }[];
}

export const pillars: Pillar[] = [
  {
    id: "system",
    index: "01",
    title: "ระบบ & ปฏิบัติการ",
    titleEn: "System & Operations",
    tagline: "ออกแบบโครงสร้าง เปลี่ยนองค์กรจาก “พึ่งคน” เป็น “พึ่งระบบ”",
    video: "/videos/taksin/pillar-system.mp4",
    poster: "/videos/taksin/pillar-system.jpg",
    points: [
      "ออกแบบกระบวนการธุรกิจและเขียน SOP รายตำแหน่ง เปลี่ยนงานที่กระจัดกระจายให้ติดตามได้",
      "ออกแบบและติดตั้งระบบ POS ติดตามยอดขาย การชำระเงิน และความชัดเจนของการปฏิบัติงาน",
      "สร้าง Sales System และ Booking System (Progressive Web App) จัดระเบียบข้อมูลการจอง ลูกค้า และธุรกรรม",
      "คุมและจัดสรรงบประมาณ ครอบคลุมแอด เครื่องมือภายใน หลังบ้าน และทรัพยากรทีม",
      "แก้คอขวดปฏิบัติการ คุมคุณภาพงานครีเอทีฟและโปรดักชันให้ได้มาตรฐานธุรกิจและลูกค้า",
    ],
    metrics: [
      { value: "Person → System", label: "เปลี่ยนองค์กรสู่ระบบที่ติดตามได้" },
      { value: "POS · PWA", label: "ระบบที่ออกแบบและส่งมอบ" },
    ],
  },
  {
    id: "ads",
    index: "02",
    title: "ยิงแอดขั้นลึก",
    titleEn: "Performance Marketing & Ads",
    tagline: "วางโครงสร้างแคมเปญและทดสอบครีเอทีฟ เพื่อผลลัพธ์ที่วัดได้",
    video: "/videos/taksin/pillar-ads.mp4",
    poster: "/videos/taksin/pillar-ads.jpg",
    points: [
      "บริหารงบแอดรวม ~600,000–800,000 บาท/เดือน บน Meta Ads และ Google Ads",
      "จัดสรรงบตามข้อมูลผลลัพธ์ (performance-based allocation) ไม่ใช่ความรู้สึก",
      "วางโครงสร้างแคมเปญจากกลยุทธ์สินค้า พฤติกรรมกลุ่มเป้าหมาย และข้อมูล conversion",
      "ทดสอบครีเอทีฟอย่างเป็นระบบ — angle, message, visual, offer เพื่อหา element ที่ขับ KPI",
      "วาง Retargeting และ Conversion tracking ด้วย Facebook Pixel ต่อยอดสู่ยอดขาย",
    ],
    metrics: [
      { value: "~800K", label: "งบแอดสูงสุดที่บริหาร/เดือน (บาท)" },
      { value: "~400K", label: "Google Ads/เดือน (บาท)" },
    ],
  },
  {
    id: "data",
    index: "03",
    title: "ดาต้าเชิงลึก",
    titleEn: "Data & Measurement",
    tagline: "เปลี่ยน Raw Data ให้กลายเป็นการตัดสินใจ",
    video: "/videos/taksin/pillar-data.mp4",
    poster: "/videos/taksin/pillar-data.jpg",
    points: [
      "ติดตั้งและจัดการ GTM (tag, variable) เชื่อมต่อ GA4 เก็บข้อมูลพฤติกรรมผู้ใช้",
      "ติดตั้ง Facebook Pixel สำหรับ retargeting และวัด conversion อย่างแม่นยำ",
      "สร้าง Data Visualization จาก Raw CSV / Google Sheets เปลี่ยนตัวเลขดิบให้เป็นภาพ",
      "ทำ Deep Performance Report — CPL, CPB, conversion rate, ad spend, booking volume",
      "สาย Data Engineering: Python, SQL, MySQL/MongoDB, Tableau/Power BI, ETL pipeline, Apache Airflow",
    ],
    metrics: [
      { value: "GA4 · GTM · Pixel", label: "ระบบวัดผลที่วางและดูแล" },
      { value: "Daily Dashboards", label: "รายงานที่ใช้ตัดสินใจจริง" },
    ],
  },
  {
    id: "automation",
    index: "04",
    title: "ออโตเมชัน & AI",
    titleEn: "Automation & AI Product",
    tagline: "นำเทคโนโลยีมาวางระบบอัตโนมัติ และสร้างแพลตฟอร์มให้องค์กรใช้",
    video: "/videos/taksin/pillar-automation.mp4",
    poster: "/videos/taksin/pillar-automation.jpg",
    points: [
      "ออกแบบและนำทีมพัฒนาแพลตฟอร์ม Generative AI (กราฟิก/วิดีโอ/VFX) — MVP, product flow, backend logic, AI workflow",
      "สร้าง Line Official Account พร้อมระบบแชตอัตโนมัติ ลดงานแอดมินซ้ำ ๆ",
      "สร้างฐานข้อมูลสินค้าใน Xcommerce เชื่อม Shopee, Lazada และ LineShop เป็นระบบเดียว",
      "ออกแบบ AI workflow ลดแรงเสียดทานในงานโปรดักชัน และขยายกำลังการผลิตงานครีเอทีฟ",
      "เชื่อมเทคโนโลยี ดาต้า และกระบวนการ เข้าด้วยกันเป็นระบบที่ทำงานเองได้",
    ],
    metrics: [
      { value: "Concept → MVP", label: "สร้างสตาร์ทอัพ AI จากศูนย์" },
      { value: "AI Workflow", label: "ระบบอัตโนมัติที่ส่งมอบจริง" },
    ],
  },
];

export interface TimelineItem {
  period: string;
  role: string;
  org: string;
  desc: string;
}

export const timeline: TimelineItem[] = [
  {
    period: "2020",
    role: "Digital Marketing",
    org: "Digital Business Consult / D-Point Holdings",
    desc: "เริ่มต้นสายดิจิทัล บริหารแคมเปญ Facebook/Google Ads งบ ~100K–200K บาท/เดือน วางแผนและทำสื่อโฆษณาออนไลน์",
  },
  {
    period: "2020 – 2021",
    role: "Data Analyst",
    org: "NumEiang Group",
    desc: "วิเคราะห์ข้อมูลผู้ใช้และธุรกิจ สร้าง dashboard และรายงานรายวัน เปลี่ยน raw data ให้เป็น insight สำหรับทีมการตลาดและผู้บริหาร",
  },
  {
    period: "2021 – 2022",
    role: "Performance Specialist",
    org: "Mona Group",
    desc: "บริหารแคมเปญ Meta Ads งบ ~500K บาท/เดือน วางโครงสร้างแคมเปญ ทำ creative testing และสร้าง performance dashboard เชิงลึก",
  },
  {
    period: "2022 – 2024",
    role: "Lead Media Buyer / Analyst",
    org: "Freelance — Digital District, Cherie Attire, Aiumi, NerveCreative",
    desc: "นำการวางแผนและยิงแอดหลายบัญชีลูกค้า บริหารงบรวม ~600K–800K บาท/เดือน เป็น PM ข้ามทีมครีเอทีฟ คอนเทนต์ และวิดีโอ",
  },
  {
    period: "2024 – 2025",
    role: "General Manager / Operations & System Lead",
    org: "CT Studio",
    desc: "คุมปฏิบัติการธุรกิจ งบประมาณ ระบบภายใน และทีมขาย ออกแบบ POS + Booking PWA เขียน SOP เปลี่ยนบริษัทจากพึ่งคนเป็นพึ่งระบบ",
  },
  {
    period: "2025 – ปัจจุบัน",
    role: "CEO / Product Designer",
    org: "Mediaforge Co., Ltd.",
    desc: "นำสตาร์ทอัพ AI สร้างแพลตฟอร์ม Generative AI สำหรับกราฟิก/วิดีโอ/VFX ดูแลตั้งแต่วิสัยทัศน์ผลิตภัณฑ์ ไปจนถึง MVP, backend logic และ go-to-market",
  },
];

export interface Stat {
  value: number;
  suffix: string;
  prefix?: string;
  label: string;
}

export const stats: Stat[] = [
  { value: 6, suffix: " ปี", label: "ประสบการณ์รวม" },
  { value: 4, suffix: " ปี", label: "ระดับผู้จัดการ / ผู้นำ" },
  { value: 800, suffix: "K", prefix: "฿", label: "งบแอดสูงสุด/เดือน" },
  { value: 3000, suffix: "+", label: "ฟอลโลเวอร์ IG ใน 5 เดือน" },
];

export const resultHighlights: string[] = [
  "สร้างระบบ POS + Sales + Booking (PWA) ให้องค์กรใช้งานจริง",
  "วางรากฐานสตาร์ทอัพ AI จาก concept สู่ MVP",
  "โปรเจกต์คอนเทนต์ AI ร่วมกับ ขสมก. (BMTA) และมหาวิทยาลัย",
  "ส่งมอบเว็บไซต์ aiumiwoman.com และงาน UX/UI หลายโปรเจกต์",
];

export interface SkillGroup {
  title: string;
  items: string[];
}

export const skillGroups: SkillGroup[] = [
  {
    title: "Marketing & Advertising",
    items: ["Meta Ads Manager", "Google Ads", "GA4", "Google Tag Manager", "Facebook Pixel", "Tag Assistant", "Line OA", "WordPress", "Yoast SEO"],
  },
  {
    title: "Data & Reporting",
    items: ["Google Sheets", "Excel", "CSV Analysis", "Dashboards", "Data Visualization", "CPL / CPB / CVR", "Tableau", "Power BI"],
  },
  {
    title: "Product & Design",
    items: ["Figma", "UX/UI", "Product Flow", "Wireframes", "MVP Design", "Landing Pages", "PWA", "SOP Design"],
  },
  {
    title: "AI & Technical",
    items: ["Generative AI Workflow", "AI Graphic / Video / VFX", "Python", "SQL", "MySQL / MongoDB", "RESTful API", "ETL Pipeline", "Apache Airflow", "Google Cloud Storage"],
  },
  {
    title: "Creative Software",
    items: ["Adobe Photoshop", "Adobe Illustrator", "After Effects", "Sony Vegas Pro", "PowerPoint"],
  },
];

export const contact = {
  email: "taksin.taeprasert@gmail.com",
  phone: "099-438-1312",
  site: "mediaforge.co",
  siteUrl: "https://mediaforge.co",
};

export const navItems = [
  { id: "profile", label: "โปรไฟล์" },
  { id: "ventures", label: "ธุรกิจ" },
  { id: "pillars", label: "ความเชี่ยวชาญ" },
  { id: "timeline", label: "เส้นทาง" },
  { id: "results", label: "ผลงาน" },
  { id: "contact", label: "ติดต่อ" },
];
