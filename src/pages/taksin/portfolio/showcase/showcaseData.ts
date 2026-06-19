// ─────────────────────────────────────────────────────────────────────────
// /taksin/portfolio/showcase — team creative & client graphic works
// Commercial creative works by teammate Kritsarut Wongsakorn ("Gun"),
// the team's creative / graphic designer. Content extracted from his deck
// (Showcase.pptx). Section titles + blurbs are drawn truthfully from the deck
// text; per-image captions are intentionally omitted (the deck had none) so the
// gallery stays clean. Images optimised into /public/images/taksin/showcase ;
// curated hero videos compressed to 720p.
// ─────────────────────────────────────────────────────────────────────────

export interface ShowcaseImage {
  src: string;
  w: number;
  h: number;
}

export interface ShowcaseVideo {
  /** Full-quality MP4 with audio — loaded on click (play with sound). */
  src: string;
  /** Muted, lightweight WEBM preview that autoplays/loops on screen. */
  preview: string;
  poster: string;
  label: string;
}

export interface ShowcaseSection {
  id: string;
  index: string;
  title: string;
  titleEn: string;
  blurb: string;
  /** Aspect ratio for the section's video cards. "portrait" for vertical
   *  social clips (9:16), default "video" (16:9 landscape). */
  videoAspect?: "video" | "portrait";
  videos: ShowcaseVideo[];
  images: ShowcaseImage[];
}

const P = "/images/taksin/showcase";
const VID = "/videos/taksin/showcase";
const POS = "/images/taksin/showcase/posters";

export const showcaseSections: ShowcaseSection[] = [
  {
    id: "ads-artwork",
    index: "01",
    title: "โฆษณา แบนเนอร์ & อาร์ตเวิร์ก",
    titleEn: "Ads · Banner · Artwork — Online & Offline",
    blurb: "ออกแบบสื่อภาพนิ่งสำหรับงานโฆษณา การตลาด และประชาสัมพันธ์ ทั้งช่องทางออนไลน์และออฟไลน์ — Social Media Content, Ads Banner, LINE OA, E-commerce Artwork, Website Banner, Sale Page, Brochure, Poster และสื่อส่งเสริมการขายต่าง ๆ",
    videos: [],
    images: [
      { src: `${P}/image2.png`, w: 410, h: 410 },
      { src: `${P}/image3.png`, w: 410, h: 410 },
      { src: `${P}/image4.png`, w: 410, h: 410 },
      { src: `${P}/image5.jpg`, w: 324, h: 405 },
      { src: `${P}/image6.jpg`, w: 324, h: 405 },
      { src: `${P}/image7.jpg`, w: 848, h: 1200 },
      { src: `${P}/image8.jpg`, w: 540, h: 675 },
      { src: `${P}/image9.jpg`, w: 848, h: 1200 },
      { src: `${P}/image10.jpg`, w: 848, h: 1200 },
      { src: `${P}/image11.jpg`, w: 848, h: 1200 },
      { src: `${P}/image12.jpg`, w: 848, h: 1200 },
      { src: `${P}/image13.jpg`, w: 615, h: 435 },
      { src: `${P}/image14.jpg`, w: 753, h: 753 },
      { src: `${P}/image15.jpg`, w: 753, h: 753 },
      { src: `${P}/image16.jpg`, w: 753, h: 753 },
      { src: `${P}/image17.jpg`, w: 377, h: 377 },
      { src: `${P}/image18.jpg`, w: 387, h: 387 },
      { src: `${P}/image19.jpg`, w: 384, h: 384 },
      { src: `${P}/image20.jpg`, w: 366, h: 366 },
      { src: `${P}/image21.jpg`, w: 377, h: 377 },
      { src: `${P}/image22.jpg`, w: 377, h: 377 },
      { src: `${P}/image23.jpg`, w: 326, h: 435 },
      { src: `${P}/image24.jpg`, w: 848, h: 1200 },
      { src: `${P}/image25.jpg`, w: 848, h: 1200 },
      { src: `${P}/image26.jpg`, w: 761, h: 1014 },
      { src: `${P}/image27.jpg`, w: 324, h: 647 },
      { src: `${P}/image28.jpg`, w: 540, h: 675 },
      { src: `${P}/image29.jpg`, w: 540, h: 675 },
      { src: `${P}/image30.jpg`, w: 540, h: 675 },
      { src: `${P}/image31.jpg`, w: 520, h: 650 },
      { src: `${P}/image32.jpg`, w: 540, h: 675 },
      { src: `${P}/image33.jpg`, w: 520, h: 650 },
      { src: `${P}/image34.jpg`, w: 540, h: 675 },
      { src: `${P}/image35.png`, w: 756, h: 1008 },
      { src: `${P}/image36.png`, w: 756, h: 1008 },
      { src: `${P}/image37.png`, w: 756, h: 1008 },
      { src: `${P}/image38.png`, w: 648, h: 864 },
      { src: `${P}/image39.png`, w: 540, h: 816 },
      { src: `${P}/image40.png`, w: 540, h: 816 },
      { src: `${P}/image41.png`, w: 648, h: 864 },
      { src: `${P}/image42.jpg`, w: 756, h: 945 },
      { src: `${P}/image43.jpg`, w: 756, h: 945 },
      { src: `${P}/image44.jpg`, w: 756, h: 945 },
    ],
  },
  {
    id: "packaging",
    index: "02",
    title: "แพ็กเกจจิ้ง",
    titleEn: "Packaging",
    blurb: "งานออกแบบบรรจุภัณฑ์สินค้า ให้สื่อสารแบรนด์และดึงดูดบนชั้นวางจริง",
    videos: [],
    images: [
      { src: `${P}/image45.jpg`, w: 848, h: 1200 },
      { src: `${P}/image46.jpg`, w: 848, h: 1200 },
      { src: `${P}/image47.jpg`, w: 720, h: 1196 },
      { src: `${P}/image48.jpg`, w: 720, h: 1196 },
      { src: `${P}/image49.jpg`, w: 848, h: 1200 },
      { src: `${P}/image50.jpg`, w: 848, h: 1200 },
      { src: `${P}/image51.jpg`, w: 848, h: 1200 },
    ],
  },
  {
    id: "retail",
    index: "03",
    title: "สื่อ ณ จุดขาย",
    titleEn: "Local Retail Creative Works",
    blurb: "งานครีเอทีฟสำหรับร้านค้าท้องถิ่นและสื่อส่งเสริมการขาย ณ จุดขาย",
    videos: [],
    images: [
      { src: `${P}/image52.jpg`, w: 848, h: 1200 },
      { src: `${P}/image53.jpg`, w: 848, h: 1200 },
      { src: `${P}/image54.jpg`, w: 864, h: 1080 },
      { src: `${P}/image55.png`, w: 1200, h: 800 },
      { src: `${P}/image56.jpg`, w: 864, h: 1080 },
      { src: `${P}/image57.jpg`, w: 864, h: 1080 },
    ],
  },
  {
    id: "video-content",
    index: "04",
    title: "วิดีโอคอนเทนต์",
    titleEn: "Video Content",
    blurb: "งานวิดีโอคอนเทนต์จริงสำหรับโซเชียลและแคมเปญการตลาดของลูกค้า — วางคอนเซปต์ จังหวะภาพ และการเล่าเรื่องให้เหมาะกับแต่ละแพลตฟอร์ม (กดที่คลิปเพื่อเล่นพร้อมเสียง)",
    videoAspect: "portrait",
    videos: [
      { src: `${VID}/vc-ctstudio-intro.mp4`, preview: `${VID}/vc-ctstudio-intro.webm`, poster: `${POS}/vc-ctstudio-intro.jpg`, label: "CT Studio — วิดีโออินโทรแบรนด์" },
      { src: `${VID}/vc-centerbeauty-clinic.mp4`, preview: `${VID}/vc-centerbeauty-clinic.webm`, poster: `${POS}/vc-centerbeauty-clinic.jpg`, label: "Center Beauty — คอนเทนต์คลินิกความงาม" },
      { src: `${VID}/vc-centerbeauty-makeup.mp4`, preview: `${VID}/vc-centerbeauty-makeup.webm`, poster: `${POS}/vc-centerbeauty-makeup.jpg`, label: "Center Beauty — คอนเทนต์ให้ความรู้แต่งหน้า" },
      { src: `${VID}/vc-centerbeauty-9dinliner.mp4`, preview: `${VID}/vc-centerbeauty-9dinliner.webm`, poster: `${POS}/vc-centerbeauty-9dinliner.jpg`, label: "Center Beauty — 9D Inliner คืออะไร" },
      { src: `${VID}/vc-centerbeauty-inliner.mp4`, preview: `${VID}/vc-centerbeauty-inliner.webm`, poster: `${POS}/vc-centerbeauty-inliner.jpg`, label: "Center Beauty — ฝังสีอินไลเนอร์" },
      { src: `${VID}/vc-centerbeauty-review.mp4`, preview: `${VID}/vc-centerbeauty-review.webm`, poster: `${POS}/vc-centerbeauty-review.jpg`, label: "Center Beauty — คอนเทนต์รีวิวบริการ" },
      { src: `${VID}/vc-centerbeauty-browlip.mp4`, preview: `${VID}/vc-centerbeauty-browlip.webm`, poster: `${POS}/vc-centerbeauty-browlip.jpg`, label: "Center Beauty — Brow & Lip" },
      { src: `${VID}/vc-imnuts-almondmilk.mp4`, preview: `${VID}/vc-imnuts-almondmilk.webm`, poster: `${POS}/vc-imnuts-almondmilk.jpg`, label: "I'm Nuts — Homemade Almond Milk" },
      { src: `${VID}/vc-imnuts-berrychoc.mp4`, preview: `${VID}/vc-imnuts-berrychoc.webm`, poster: `${POS}/vc-imnuts-berrychoc.jpg`, label: "I'm Nuts — Berry Choc Dubai" },
      { src: `${VID}/vc-imnuts-howto.mp4`, preview: `${VID}/vc-imnuts-howto.webm`, poster: `${POS}/vc-imnuts-howto.jpg`, label: "I'm Nuts — How To เมนูช็อกโกแลตสตรอว์เบอร์รี" },
      { src: `${VID}/vc-imnuts-croissant.mp4`, preview: `${VID}/vc-imnuts-croissant.webm`, poster: `${POS}/vc-imnuts-croissant.jpg`, label: "I'm Nuts — คอนเทนต์ครัวซองต์อัลมอนด์" },
      { src: `${VID}/vc-imnuts-croissant-strawberry.mp4`, preview: `${VID}/vc-imnuts-croissant-strawberry.webm`, poster: `${POS}/vc-imnuts-croissant-strawberry.jpg`, label: "I'm Nuts — Croissant Strawberry" },
    ],
    images: [],
  },
  {
    id: "ai-content",
    index: "05",
    title: "คอนเทนต์ & การตลาดด้วย AI",
    titleEn: "AI-Driven Content & Marketing Production",
    blurb: "“AI as a Drafter, Human as a Crafter” — ใช้ AI สร้างภาพและวิดีโอเป็น Asset สำหรับงานโฆษณาและการตลาด แล้วให้มนุษย์เป็นผู้เกลางานให้ตรงบริบทและกลุ่มเป้าหมาย ช่วยลดต้นทุนและเวลาในการผลิต",
    videos: [
      { src: `${VID}/bmta-cabinet.mp4`, preview: `${VID}/bmta-cabinet.webm`, poster: `${POS}/bmta-cabinet.jpg`, label: "ขสมก. — วิดีโอสรุปวาระคณะรัฐมนตรี (AI Generated)" },
      { src: `${VID}/pmu-universe-opening.mp4`, preview: `${VID}/pmu-universe-opening.webm`, poster: `${POS}/pmu-universe-opening.jpg`, label: "PMU Universe Award 2026 — Opening Visual (AI 100%)" },
    ],
    images: [
      { src: `${P}/image73.jpg`, w: 1200, h: 675 },
      { src: `${P}/image74.jpg`, w: 675, h: 1200 },
      { src: `${P}/image75.jpg`, w: 675, h: 1200 },
      { src: `${P}/image76.jpg`, w: 675, h: 1200 },
      { src: `${P}/image77.jpg`, w: 359, h: 480 },
      { src: `${P}/image78.jpg`, w: 359, h: 480 },
      { src: `${P}/image79.jpg`, w: 359, h: 480 },
      { src: `${P}/image80.jpg`, w: 359, h: 480 },
      { src: `${P}/image81.jpg`, w: 359, h: 480 },
      { src: `${P}/image82.jpg`, w: 359, h: 480 },
      { src: `${P}/image83.jpg`, w: 359, h: 480 },
      { src: `${P}/image84.jpg`, w: 359, h: 480 },
      { src: `${P}/image85.jpg`, w: 359, h: 480 },
      { src: `${P}/image86.jpg`, w: 359, h: 480 },
      { src: `${P}/image87.jpg`, w: 359, h: 480 },
      { src: `${P}/image88.jpg`, w: 359, h: 480 },
      { src: `${P}/image89.jpg`, w: 1200, h: 675 },
      { src: `${P}/image90.jpg`, w: 480, h: 600 },
      { src: `${P}/image91.jpg`, w: 480, h: 600 },
      { src: `${P}/image92.jpg`, w: 480, h: 600 },
      { src: `${P}/image93.jpg`, w: 480, h: 600 },
      { src: `${P}/image94.jpg`, w: 480, h: 642 },
      { src: `${P}/image95.jpg`, w: 480, h: 642 },
      { src: `${P}/image96.jpg`, w: 720, h: 964 },
      { src: `${P}/image97.jpg`, w: 896, h: 1200 },
      { src: `${P}/image98.png`, w: 717, h: 960 },
      { src: `${P}/image99.png`, w: 628, h: 840 },
      { src: `${P}/image100.jpg`, w: 480, h: 640 },
      { src: `${P}/image101.jpg`, w: 480, h: 640 },
      { src: `${P}/image102.jpg`, w: 480, h: 640 },
      { src: `${P}/image103.jpg`, w: 720, h: 960 },
      { src: `${P}/image104.jpg`, w: 720, h: 964 },
      { src: `${P}/image105.jpg`, w: 675, h: 1200 },
      { src: `${P}/image106.jpg`, w: 480, h: 640 },
    ],
  },
  {
    id: "perf-ads",
    index: "06",
    title: "ครีเอทีฟสายยิงแอด",
    titleEn: "Performance Ads Creative",
    blurb: "คอนเทนต์โฆษณาที่ออกแบบด้วย Hook ให้ตรงกลุ่มเป้าหมาย ดึงความสนใจตั้งแต่ต้นคลิป เหมาะกับการยิงแอดบนแพลตฟอร์มออนไลน์",
    videos: [],
    images: [
      { src: `${P}/image107.jpg`, w: 648, h: 809 },
      { src: `${P}/image108.jpg`, w: 648, h: 811 },
      { src: `${P}/image109.jpg`, w: 648, h: 864 },
      { src: `${P}/image110.jpg`, w: 432, h: 541 },
      { src: `${P}/image111.jpg`, w: 431, h: 541 },
    ],
  },
  {
    id: "ai-concept",
    index: "07",
    title: "AI Concept Portfolio",
    titleEn: "Creative Direction · AI Image / Video · Motion · Editing",
    blurb: "ผลงานคอนเซปต์และโปรเจกต์ทดลองด้วย AI-driven workflow แบบครบกระบวนการ ตั้งแต่ Creative Direction, การสร้างภาพด้วย AI, การพัฒนาเป็นวิดีโอด้วย AI Video Generation ไปจนถึงการตัดต่อ",
    videos: [
      { src: `${VID}/dead-island.mp4`, preview: `${VID}/dead-island.webm`, poster: `${POS}/dead-island.jpg`, label: "Dead Island 3 — Opening Scene (AI Cinematic Concept)" },
      { src: `${VID}/mediaforge-intro.mp4`, preview: `${VID}/mediaforge-intro.webm`, poster: `${POS}/mediaforge-intro.jpg`, label: "Introduction of MediaForge — AI 2D Storytelling" },
      { src: `${VID}/storytelling-25d.mp4`, preview: `${VID}/storytelling-25d.webm`, poster: `${POS}/storytelling-25d.jpg`, label: "2.5D Storytelling — Early AI Use Case" },
      { src: `${VID}/ai-motion-action.mp4`, preview: `${VID}/ai-motion-action.webm`, poster: `${POS}/ai-motion-action.jpg`, label: "AI Motion Control — Action Sequence Study" },
      { src: `${VID}/edu-2d-animation.mp4`, preview: `${VID}/edu-2d-animation.webm`, poster: `${POS}/edu-2d-animation.jpg`, label: "AI for Education — 2D Animation Use Case" },
      { src: `${VID}/hilux-travo.mp4`, preview: `${VID}/hilux-travo.webm`, poster: `${POS}/hilux-travo.jpg`, label: "Hilux Travo Overland — AI Spec Ad" },
      { src: `${VID}/fashion-us.mp4`, preview: `${VID}/fashion-us.webm`, poster: `${POS}/fashion-us.jpg`, label: "AI Fashion Campaign — Thai brand to US market" },
    ],
    images: [
      { src: `${P}/image112.jpg`, w: 836, h: 471 },
      { src: `${P}/image113.jpg`, w: 1200, h: 675 },
      { src: `${P}/image114.jpg`, w: 1200, h: 675 },
      { src: `${P}/image115.jpg`, w: 1200, h: 675 },
      { src: `${P}/image116.jpg`, w: 1200, h: 675 },
      { src: `${P}/image117.jpg`, w: 576, h: 324 },
      { src: `${P}/image118.jpg`, w: 576, h: 324 },
      { src: `${P}/image119.jpg`, w: 836, h: 471 },
      { src: `${P}/image120.jpg`, w: 576, h: 324 },
      { src: `${P}/image121.jpg`, w: 1200, h: 675 },
      { src: `${P}/image122.jpg`, w: 836, h: 471 },
      { src: `${P}/image123.png`, w: 836, h: 471 },
      { src: `${P}/image124.jpg`, w: 1200, h: 675 },
      { src: `${P}/image125.jpg`, w: 688, h: 384 },
      { src: `${P}/image126.jpg`, w: 836, h: 471 },
      { src: `${P}/image127.jpg`, w: 1200, h: 675 },
      { src: `${P}/image128.jpg`, w: 480, h: 480 },
      { src: `${P}/image129.jpg`, w: 512, h: 512 },
      { src: `${P}/image130.jpg`, w: 512, h: 512 },
      { src: `${P}/image131.png`, w: 512, h: 512 },
      { src: `${P}/image132.png`, w: 512, h: 512 },
      { src: `${P}/image133.jpg`, w: 675, h: 1200 },
      { src: `${P}/image134.jpg`, w: 538, h: 301 },
      { src: `${P}/image135.jpg`, w: 538, h: 301 },
      { src: `${P}/image136.jpg`, w: 1200, h: 677 },
      { src: `${P}/image137.jpg`, w: 669, h: 377 },
      { src: `${P}/image138.jpg`, w: 669, h: 377 },
      { src: `${P}/image139.jpg`, w: 1200, h: 675 },
      { src: `${P}/image140.jpg`, w: 675, h: 1200 },
      { src: `${P}/image141.jpg`, w: 400, h: 267 },
      { src: `${P}/image142.jpg`, w: 400, h: 267 },
      { src: `${P}/image143.jpg`, w: 400, h: 267 },
      { src: `${P}/image144.jpg`, w: 671, h: 1200 },
      { src: `${P}/image145.jpg`, w: 671, h: 1200 },
      { src: `${P}/image146.jpg`, w: 1200, h: 1200 },
      { src: `${P}/image147.jpg`, w: 1200, h: 675 },
      { src: `${P}/image148.jpg`, w: 1200, h: 670 },
      { src: `${P}/image149.jpg`, w: 1102, h: 571 },
      { src: `${P}/image150.jpg`, w: 551, h: 308 },
    ],
  },
];

export const showcaseCredit = {
  name: "Kritsarut Wongsakorn",
  nickname: "Gun",
  role: "Creative & Graphic Designer",
  roleTh: "ครีเอทีฟ & กราฟิกดีไซเนอร์ประจำทีม",
};
