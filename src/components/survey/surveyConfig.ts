/* ── Survey Framework Configuration ──
   5 sections · bilingual (en/th) · multiple question types */

export type QuestionType = "single" | "multi" | "ranking" | "rating" | "text" | "range";

export interface SurveyOption {
  value: string;
  label: Record<string, string>;
}

export interface SurveyQuestion {
  key: string;
  type: QuestionType;
  title: Record<string, string>;
  desc?: Record<string, string>;
  options?: SurveyOption[];
  items?: { key: string; label: Record<string, string> }[];
  required?: boolean;
  maxLength?: number;
  placeholder?: Record<string, string>;
}

export interface SurveySection {
  key: string;
  title: Record<string, string>;
  desc: Record<string, string>;
  iconName: string;
  questions: SurveyQuestion[];
}

export const surveySections: SurveySection[] = [
  /* ─── SECTION 1 — Behavioral ─── */
  {
    key: "behavioral",
    title: { en: "Your Workflow", th: "พฤติกรรมการทำงาน" },
    desc: { en: "Tell us how you create content", th: "บอกเราเกี่ยวกับการทำงานของคุณ" },
    iconName: "Briefcase",
    questions: [
      {
        key: "media_frequency",
        type: "single",
        title: {
          en: "How often do you need new media (photos/videos)?",
          th: "ปกติคุณต้องการสื่อใหม่ (ภาพ/วิดีโอ) บ่อยแค่ไหน?",
        },
        required: true,
        options: [
          { value: "daily", label: { en: "Every day", th: "ทุกวัน" } },
          { value: "several_weekly", label: { en: "Several times a week", th: "หลายครั้งต่อสัปดาห์" } },
          { value: "weekly", label: { en: "Once a week", th: "สัปดาห์ละครั้ง" } },
          { value: "monthly", label: { en: "Once a month", th: "เดือนละครั้ง" } },
        ],
      },
      {
        key: "production_cost",
        type: "single",
        title: {
          en: "How much does producing 1 piece of content typically cost?",
          th: "เวลาคุณผลิตสื่อ 1 ชิ้น ปกติใช้ต้นทุนประมาณเท่าไหร่?",
        },
        required: true,
        options: [
          { value: "under_500", label: { en: "Under ฿500", th: "ต่ำกว่า 500" } },
          { value: "500_2000", label: { en: "฿500–2,000", th: "500–2,000" } },
          { value: "2000_10000", label: { en: "฿2,000–10,000", th: "2,000–10,000" } },
          { value: "over_10000", label: { en: "Over ฿10,000", th: "มากกว่า 10,000" } },
        ],
      },
      {
        key: "top_priority",
        type: "single",
        title: {
          en: "What's most important when creating content?",
          th: "อะไรสำคัญที่สุดเวลาคุณผลิตสื่อ?",
        },
        required: true,
        options: [
          { value: "speed", label: { en: "Speed", th: "ความเร็ว" } },
          { value: "beauty", label: { en: "Visual appeal", th: "ความสวยงาม" } },
          { value: "quality", label: { en: "Realism / Quality", th: "ความสมจริง / คุณภาพ" } },
          { value: "brand_consistency", label: { en: "Brand consistency", th: "ความสม่ำเสมอของแบรนด์" } },
          { value: "low_cost", label: { en: "Low cost", th: "ราคาถูก" } },
          { value: "all_in_one", label: { en: "All-in-one tools", th: "ทำงานได้หลายแบบในที่เดียว" } },
        ],
      },
      {
        key: "brand_ci",
        type: "single",
        title: {
          en: "Do you have brand CI (colors/style) you must follow?",
          th: "คุณมี CI แบรนด์ ที่ต้องคุมโทนสี/สไตล์หรือไม่?",
        },
        required: true,
        options: [
          { value: "strict", label: { en: "Yes, must be exact", th: "มี และต้องเป๊ะ" } },
          { value: "flexible", label: { en: "Yes, but flexible", th: "มี แต่ยืดหยุ่นได้" } },
          { value: "none", label: { en: "No", th: "ไม่มี" } },
        ],
      },
      {
        key: "role",
        type: "single",
        title: {
          en: "What's your role?",
          th: "คุณทำงานในบทบาทไหน?",
        },
        required: true,
        options: [
          { value: "brand_owner", label: { en: "Brand Owner", th: "เจ้าของแบรนด์" } },
          { value: "perf_marketer", label: { en: "Performance Marketer", th: "Performance Marketer" } },
          { value: "agency", label: { en: "Agency / Freelance", th: "Agency / Freelance" } },
          { value: "corporate", label: { en: "Corporate Marketing", th: "Corporate Marketing" } },
        ],
      },
    ],
  },

  /* ─── SECTION 2 — Pain Points ─── */
  {
    key: "pain_points",
    title: { en: "Your Pain Points", th: "ปัญหาที่คุณเจอ" },
    desc: { en: "What challenges do you face?", th: "อะไรคือปัญหาที่คุณเจอบ่อยที่สุด?" },
    iconName: "AlertTriangle",
    questions: [
      {
        key: "pain_list",
        type: "multi",
        title: {
          en: "What problems do you face most when creating content? (select all that apply)",
          th: "ปัญหาที่คุณเจอบ่อยที่สุดเวลาผลิตสื่อคืออะไร? (เลือกได้หลายข้อ)",
        },
        required: true,
        options: [
          { value: "too_slow", label: { en: "Takes too long", th: "ใช้เวลานานเกินไป" } },
          { value: "too_expensive", label: { en: "High cost", th: "ต้นทุนสูง" } },
          { value: "inconsistent", label: { en: "Inconsistent quality", th: "คุณภาพไม่สม่ำเสมอ" } },
          { value: "hard_to_find", label: { en: "Hard to find people to do it", th: "หาคนทำงานยาก" } },
          { value: "no_control", label: { en: "Can't control quality", th: "คุมคุณภาพไม่ได้" } },
          { value: "high_volume", label: { en: "Need to produce large volumes", th: "ต้องทำงานจำนวนมาก" } },
          { value: "capacity", label: { en: "Want more clients but can't keep up", th: "อยากรับงานเพิ่มแต่กำลังผลิตไม่พอ" } },
        ],
      },
      {
        key: "priority_ranking",
        type: "ranking",
        title: {
          en: "Rank these by importance (click in order, 1 = most important)",
          th: "จัดอันดับความสำคัญ (กดเรียงตามลำดับ, 1 = สำคัญสุด)",
        },
        required: true,
        items: [
          { key: "speed", label: { en: "Speed", th: "ความเร็ว" } },
          { key: "cheap", label: { en: "Low cost", th: "ราคาถูก" } },
          { key: "quality", label: { en: "High quality", th: "คุณภาพสูง" } },
          { key: "brand", label: { en: "Brand consistency", th: "ความสม่ำเสมอของแบรนด์" } },
          { key: "variety", label: { en: "Style variety", th: "ความหลากหลายของสไตล์" } },
          { key: "ease", label: { en: "Ease of use", th: "ความง่ายในการใช้งาน" } },
        ],
      },
    ],
  },

  /* ─── SECTION 3 — Hook Testing ─── */
  {
    key: "hook_testing",
    title: { en: "Feature Interest", th: "ฟีเจอร์ที่สนใจ" },
    desc: {
      en: "Rate how interesting each feature sounds (1–5)",
      th: "ให้คะแนนความน่าสนใจ (1–5)",
    },
    iconName: "Star",
    questions: [
      {
        key: "hook_ratings",
        type: "rating",
        title: {
          en: "Rate each feature concept",
          th: "ให้คะแนนแต่ละแนวคิด",
        },
        required: true,
        items: [
          {
            key: "hook_multi_style",
            label: {
              en: "Drop 1 product photo → get 10 video styles instantly",
              th: "โยนรูปสินค้า 1 รูป แล้วได้วิดีโอ 10 สไตล์ทันที",
            },
          },
          {
            key: "hook_studio",
            label: {
              en: "Shoot with phone → AI transforms scene to world-class studio",
              th: "ถ่ายด้วยมือถือ แล้วระบบเปลี่ยนฉากเป็นสตูดิโอระดับโลกให้",
            },
          },
          {
            key: "hook_faceswap",
            label: {
              en: "Advanced Face Swap that locks your brand model's face",
              th: "Face Swap ขั้นสูงที่ล็อกหน้านางแบบประจำแบรนด์ได้",
            },
          },
          {
            key: "hook_factory",
            label: {
              en: "Use as a back-end factory to take on more client work",
              th: "ใช้เป็นโรงงานหลังบ้านเพื่อรับงานลูกค้าเพิ่มได้",
            },
          },
        ],
      },
    ],
  },

  /* ─── SECTION 4 — Willingness to Pay ─── */
  {
    key: "willingness_to_pay",
    title: { en: "Value & Budget", th: "มูลค่าและงบประมาณ" },
    desc: {
      en: "Help us design the right pricing for you",
      th: "ช่วยให้เราออกแบบราคาที่เหมาะกับคุณ",
    },
    iconName: "Coins",
    questions: [
      {
        key: "wtp_speed",
        type: "single",
        title: {
          en: "If a tool made you 10x faster, what's a fair monthly price?",
          th: "ถ้ามีระบบที่ช่วยให้คุณผลิตสื่อได้เร็วขึ้น 10 เท่า ราคาที่เหมาะสมคือเท่าไหร่?",
        },
        required: true,
        options: [
          { value: "under_500", label: { en: "Under ฿500/mo", th: "ต่ำกว่า 500/เดือน" } },
          { value: "500_1500", label: { en: "฿500–1,500/mo", th: "500–1,500/เดือน" } },
          { value: "1500_5000", label: { en: "฿1,500–5,000/mo", th: "1,500–5,000/เดือน" } },
          { value: "over_5000", label: { en: "Over ฿5,000/mo", th: "มากกว่า 5,000/เดือน" } },
        ],
      },
      {
        key: "wtp_quality",
        type: "single",
        title: {
          en: "If a tool made your content look expensive & pro, how much/month?",
          th: "ถ้าระบบช่วยให้ภาพของคุณดูแพงขึ้นแบบมืออาชีพ คุณยอมจ่ายต่อเดือนเท่าไหร่?",
        },
        required: true,
        options: [
          { value: "under_500", label: { en: "Under ฿500/mo", th: "ต่ำกว่า 500/เดือน" } },
          { value: "500_1500", label: { en: "฿500–1,500/mo", th: "500–1,500/เดือน" } },
          { value: "1500_5000", label: { en: "฿1,500–5,000/mo", th: "1,500–5,000/เดือน" } },
          { value: "over_5000", label: { en: "Over ฿5,000/mo", th: "มากกว่า 5,000/เดือน" } },
        ],
      },
      {
        key: "wtp_revenue",
        type: "single",
        title: {
          en: "If a tool helped you take on more clients, how much extra monthly revenue?",
          th: "ถ้าระบบช่วยให้คุณรับงานลูกค้าเพิ่มได้ คุณจะเพิ่มรายได้ต่อเดือนประมาณเท่าไหร่?",
        },
        required: true,
        options: [
          { value: "under_10k", label: { en: "Under ฿10,000", th: "ต่ำกว่า 10,000" } },
          { value: "10k_30k", label: { en: "฿10,000–30,000", th: "10,000–30,000" } },
          { value: "30k_100k", label: { en: "฿30,000–100,000", th: "30,000–100,000" } },
          { value: "over_100k", label: { en: "Over ฿100,000", th: "มากกว่า 100,000" } },
        ],
      },
    ],
  },

  /* ─── SECTION 5 — Expectations ─── */
  {
    key: "expectations",
    title: { en: "Your Expectations", th: "ความคาดหวัง" },
    desc: {
      en: "Help us build what matters most to you",
      th: "ช่วยให้เรารู้ว่าควรพัฒนาอะไรต่อ",
    },
    iconName: "Lightbulb",
    questions: [
      {
        key: "feature_wishes",
        type: "text",
        title: {
          en: "What do you wish the system could do more of?",
          th: "คุณอยากให้ระบบทำอะไรได้มากขึ้น?",
        },
        placeholder: {
          en: "Tell us what features you'd love to see...",
          th: "บอกเราว่าอยากเห็นฟีเจอร์อะไรบ้าง...",
        },
        maxLength: 500,
      },
      {
        key: "biggest_fear",
        type: "text",
        title: {
          en: "What's your biggest fear about using AI tools?",
          th: "อะไรคือสิ่งที่คุณ \"กลัวที่สุด\" เกี่ยวกับการใช้ AI?",
        },
        placeholder: {
          en: "Tell us your concerns...",
          th: "บอกเราว่าคุณกังวลเรื่องอะไร...",
        },
        maxLength: 500,
      },
    ],
  },
];
