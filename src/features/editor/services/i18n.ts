/**
 * Lightweight i18n for MediaForge Studio — supports Thai and English.
 * Uses zustand-style subscription via a tiny store; no external i18n libs.
 *
 * Usage: const t = useI18n(); <span>{t("media")}</span>
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "th";

const dictionary = {
  // Tabs
  media: { en: "Media", th: "สื่อ" },
  audio: { en: "Audio", th: "เสียง" },
  text: { en: "Text", th: "ข้อความ" },
  stickers: { en: "Stickers", th: "สติกเกอร์" },
  transitions: { en: "Transitions", th: "ทรานซิชัน" },
  graphics: { en: "Graphics", th: "กราฟิก" },
  ai: { en: "AI Gen", th: "สร้างด้วย AI" },
  captions: { en: "Captions", th: "คำบรรยาย" },
  // Top bar
  export: { en: "Export", th: "ส่งออก" },
  save: { en: "Save", th: "บันทึก" },
  undo: { en: "Undo", th: "เลิกทำ" },
  redo: { en: "Redo", th: "ทำซ้ำ" },
  share: { en: "Share", th: "แชร์" },
  // Common verbs
  add: { en: "Add", th: "เพิ่ม" },
  delete: { en: "Delete", th: "ลบ" },
  apply: { en: "Apply", th: "ใช้" },
  cancel: { en: "Cancel", th: "ยกเลิก" },
  search: { en: "Search", th: "ค้นหา" },
  import: { en: "Import", th: "นำเข้า" },
  drop_files: { en: "Drop files to import", th: "ปล่อยไฟล์เพื่อนำเข้า" },
  // Panels
  assets: { en: "Assets", th: "สินทรัพย์" },
  preview: { en: "Preview", th: "ตัวอย่าง" },
  inspector: { en: "Inspector", th: "ตรวจสอบ" },
  timeline: { en: "Timeline", th: "ไทม์ไลน์" },
  properties: { en: "Properties", th: "คุณสมบัติ" },
  // Search
  search_media: { en: "Search media", th: "ค้นหาสื่อ" },
  // Empty state
  no_media: { en: "No media imported", th: "ยังไม่มีสื่อที่นำเข้า" },
  drag_or_click_import: {
    en: "Drag files here or click to import",
    th: "ลากไฟล์มาที่นี่หรือคลิกเพื่อนำเข้า",
  },
  import_media: { en: "Import Media", th: "นำเข้าสื่อ" },
  // Transitions tab
  drag_to_clip_boundary: {
    en: "Drag onto a clip boundary in the timeline",
    th: "ลากไปยังขอบของคลิปในไทม์ไลน์",
  },
  no_clips_selected: { en: "No clips selected", th: "ยังไม่มีคลิปที่เลือก" },
  select_two_adjacent_clips: {
    en: "Select two adjacent clips first",
    th: "เลือกคลิปสองคลิปที่ติดกันก่อน",
  },
  applied_transition: { en: "Transition applied", th: "ใช้ทรานซิชันแล้ว" },
  // Misc
  language: { en: "Language", th: "ภาษา" },
  english: { en: "English", th: "อังกฤษ" },
  thai: { en: "Thai", th: "ไทย" },
  // Resizable panel dividers (V4)
  resize_library_panel: { en: "Resize library panel", th: "ปรับขนาดแผงคลังสินทรัพย์" },
  resize_inspector_panel: { en: "Resize inspector panel", th: "ปรับขนาดแผงตรวจสอบ" },
  // Captions / Auto Suptitle
  captions_duration_recommendation: {
    en: "Recommended: clips under 20 minutes for best results",
    th: "แนะนำ: คลิปไม่เกิน 20 นาทีเพื่อผลลัพธ์ที่ดีที่สุด",
  },
  captions_duration_warning: {
    en: "This clip is over 20 minutes. It may exceed the 25 MB audio limit.",
    th: "คลิปนี้ยาวเกิน 20 นาที อาจเกินขีดจำกัดเสียง 25 MB",
  },
  captions_compressing_audio: {
    en: "Compressing audio...",
    th: "กำลังบีบอัดเสียง...",
  },
} as const;

export type I18nKey = keyof typeof dictionary;

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
      toggleLocale: () =>
        set((state) => ({ locale: state.locale === "en" ? "th" : "en" })),
    }),
    {
      name: "openreel-locale",
    },
  ),
);

/**
 * Hook returning a translation function `t(key)`.
 * Components automatically re-render when locale changes.
 */
export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const t = (key: I18nKey, fallback?: string): string => {
    const entry = dictionary[key];
    if (!entry) return fallback ?? key;
    return entry[locale] ?? entry.en ?? fallback ?? key;
  };
  return t;
}

/** Imperative version for non-React code. */
export function tStatic(key: I18nKey, fallback?: string): string {
  const entry = dictionary[key];
  if (!entry) return fallback ?? key;
  const locale = useI18nStore.getState().locale;
  return entry[locale] ?? entry.en ?? fallback ?? key;
}
