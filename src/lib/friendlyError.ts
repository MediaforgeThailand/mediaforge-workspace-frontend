/**
 * friendlyError — map raw provider / Supabase / RPC error messages
 * to short, customer-safe Thai + English copy.
 *
 * Background: the audit found that backend errors leak verbatim to
 * `toast.error()` — users see jargon like "PROVIDER_BILLING_ERROR",
 * `OpenAI 401: Incorrect API key…`, and SQL-shaped messages
 * ("function consume_credits_for(uuid, …) does not exist"). This
 * file is the single funnel: every toast that displays a backend
 * error string should pipe it through `friendlyError()` first so
 * the user sees a localized, actionable message and the team
 * keeps the raw text in `console.error` for debugging.
 *
 * Pattern matching is intentionally cheap (regex) — we accept some
 * misses in exchange for never blocking the UI thread. Unrecognised
 * errors fall through to a generic "something went wrong" message
 * that's still better than the raw provider noise.
 *
 * Usage:
 *   import { friendlyError } from "@/lib/friendlyError";
 *   import { useLanguage } from "@/contexts/LanguageContext";
 *
 *   const { language } = useLanguage();
 *   try { … } catch (err) {
 *     console.error("[my-feature] raw error:", err);
 *     toast.error(friendlyError(err, language));
 *   }
 */

export type Lang = "en" | "th";

interface ErrorMapping {
  /** Pattern to test the raw error message against. */
  match: RegExp;
  th: string;
  en: string;
}

const MAPPINGS: ErrorMapping[] = [
  // ── Credit-system errors ────────────────────────────────────
  {
    match: /INSUFFICIENT_CREDITS|insufficient[\s_-]*credit/i,
    th: "เครดิตไม่พอ — เติมเครดิตหรืออัปเกรดแพ็กเกจก่อนครับ",
    en: "Not enough credits — please top up or upgrade your plan.",
  },
  {
    match: /PROVIDER_BILLING_ERROR|provider[\s_-]*bill|insufficient[\s_-]*balance/i,
    th: "ระบบ AI ผู้ให้บริการขัดข้องชั่วคราว ทีมงานกำลังแก้ไข",
    en: "The AI provider is temporarily unavailable. Our team is on it.",
  },
  {
    match: /function .*consume_credits|function .*grant_credits|relation .* does not exist/i,
    th: "ระบบเครดิตขัดข้อง — ทีมงานได้รับแจ้งแล้ว",
    en: "Credit system error — our team has been notified.",
  },

  // ── Auth / session ──────────────────────────────────────────
  {
    match: /Invalid login credentials|Email not confirmed|invalid_grant/i,
    th: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ยืนยันอีเมล",
    en: "Wrong email or password — or your email isn't verified yet.",
  },
  {
    match: /JWT.*expired|expired[\s_-]*session|refresh[\s_-]*token[\s_-]*not[\s_-]*found/i,
    th: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    en: "Your session expired — please sign in again.",
  },
  {
    match: /User already registered|email[\s_-]*already/i,
    th: "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน",
    en: "This email is already registered — try signing in instead.",
  },

  // ── Storage / RLS ───────────────────────────────────────────
  {
    match: /row[\s_-]*level[\s_-]*security|RLS|new row violates/i,
    th: "ไม่มีสิทธิ์ทำรายการนี้ — ลองออกจากระบบและเข้าใหม่",
    en: "You don't have permission for this action — try signing in again.",
  },
  {
    match: /Bucket not found|object not found|storage.*404/i,
    th: "ไฟล์ที่อ้างอิงหายไปแล้ว ลองอัปโหลดใหม่",
    en: "The referenced file is missing — try re-uploading.",
  },
  {
    match: /file size|too large|exceeded.*size|413/i,
    th: "ไฟล์ใหญ่เกินกำหนด (สูงสุด 200MB)",
    en: "File too large (max 200 MB).",
  },

  // ── Provider auth / config ──────────────────────────────────
  {
    match: /OpenAI 401|api[\s_-]*key|unauthorized|401[\s_]/i,
    th: "ระบบ AI ขัดข้องชั่วคราว — ทีมงานกำลังแก้ไข",
    en: "AI service temporarily down — our team is on it.",
  },
  {
    match: /content[\s_-]*polic|moderation|blocked|safety[\s_-]*system|disallowed/i,
    th: "เนื้อหาที่ขอนี้ผู้ให้บริการ AI ปฏิเสธ ลองปรับ prompt ให้ปลอดภัยกว่านี้",
    en: "The AI provider blocked this request — try a safer prompt.",
  },
  {
    match: /rate[\s_-]*limit|429|too many requests/i,
    th: "ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่",
    en: "Too many requests — please wait a moment and try again.",
  },
  {
    match: /Veo image input was rejected|inlineData.*isn'?t supported|imageBytes|models\/veo.*not found/i,
    th: "Veo 3.1 ยังรับรูปอ้างอิงไม่ได้ในตอนนี้ ลองสร้างแบบ Text to Video ก่อนครับ",
    en: "Veo 3.1 image input is unavailable right now. Try Text to Video first.",
  },

  // ── Network / timeouts ─────────────────────────────────────
  {
    match: /Failed to fetch|NetworkError|fetch failed|abort/i,
    th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    en: "Couldn't reach the server — check your connection and try again.",
  },
  {
    match: /timeout|timed out|deadline/i,
    th: "การประมวลผลใช้เวลานานเกินไป ลองใหม่อีกครั้ง",
    en: "Request took too long — please try again.",
  },

  // ── Validation ─────────────────────────────────────────────
  {
    match: /still[\s_-]*uploading|asset[\s_-]*not[\s_-]*ready/i,
    th: "ไฟล์อ้างอิงยังอัปโหลดไม่เสร็จ รอสักครู่แล้วกด Run อีกครั้ง",
    en: "Reference file is still uploading — wait a moment and click Run again.",
  },
  {
    match: /validation|invalid[\s_-]*param|400[\s_]/i,
    th: "ข้อมูลที่ส่งไม่ถูกต้อง — ตรวจสอบแล้วลองใหม่",
    en: "Some inputs are invalid — please double-check and try again.",
  },
];

/** Generic fallback when no pattern matches. */
const GENERIC: Record<Lang, string> = {
  th: "เกิดข้อผิดพลาด ลองอีกครั้งหรือติดต่อทีมงาน",
  en: "Something went wrong — try again or contact support.",
};

/**
 * Map any error-shaped value to a localized, customer-safe string.
 * Always logs the raw error to console.error so the team can debug.
 *
 * @param err - The error (Error instance, string, or unknown thrown value).
 * @param lang - "th" | "en". Defaults to "en".
 * @returns A short user-facing message.
 */
export function friendlyError(err: unknown, lang: Lang = "en"): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  // Always preserve the raw text in console for debugging — the
  // customer-facing layer never sees this but the team does.
  console.error("[friendlyError] raw:", raw);

  for (const m of MAPPINGS) {
    if (m.match.test(raw)) {
      return lang === "th" ? m.th : m.en;
    }
  }
  return GENERIC[lang];
}

/** Sugar — when the toast site already has a `t()` from
 *  useLanguage but you still want the raw-error fallback. */
export function friendlyErrorOr(err: unknown, lang: Lang, fallback: string): string {
  const friendly = friendlyError(err, lang);
  return friendly === GENERIC[lang] ? fallback : friendly;
}

export async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error || "Request failed");
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.clone !== "function") return fallback;
  try {
    const text = await response.clone().text();
    if (!text) return fallback;
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown };
      return String(body?.error || body?.message || text || fallback);
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}
