export type Lang = "en" | "th" | "ja";

const GENERIC: Record<Lang, string> = {
  th: "เกิดข้อผิดพลาด ลองอีกครั้งหรือติดต่อทีมงาน",
  en: "Something went wrong. Try again or contact support.",
  ja: "問題が発生しました。もう一度試すか、サポートにお問い合わせください。",
};

const MAPPINGS: Array<{ match: RegExp; th: string; en: string; ja: string }> = [
  {
    match: /INSUFFICIENT_CREDITS|insufficient[\s_-]*credit/i,
    th: "เครดิตไม่พอ เติมเครดิตหรืออัปเกรดแพ็กเกจก่อนครับ",
    en: "Not enough credits. Please top up or upgrade your plan.",
    ja: "クレジットが不足しています。チャージするかプランをアップグレードしてください。",
  },
  {
    match: /Veo: failed to fetch start\/end frame \((?:400|401|403|404|410)\)|failed to fetch start\/end frame/i,
    th: "โหลดรูป Start/End Frame ไม่ได้ ไฟล์อาจหมดอายุหรือไม่มีสิทธิ์เข้าถึง ลองอัปโหลดหรือเลือกภาพใหม่แล้วรันอีกครั้งครับ",
    en: "The start/end frame could not be loaded. Re-upload or choose the image again, then run it once more.",
    ja: "開始/終了フレームを読み込めませんでした。画像を再アップロードするか選び直してから再実行してください。",
  },
  {
    match: /Provider queue was busy|provider.*busy|queue was busy|HTTP 503|503|temporar(?:y|ily).*unavailable|high demand|overload/i,
    th: "ตอนนี้ผู้ให้บริการ AI มีคิวเยอะหรือโหลดสูง ระบบจะลองให้อัตโนมัติจนกว่าจะครบเวลา หากไม่สำเร็จจะคืนเครดิตให้ครับ",
    en: "The AI provider is busy right now. We'll keep retrying until the time limit; if it still cannot finish, credits will be refunded.",
    ja: "AI プロバイダーが混み合っています。制限時間まで自動で再試行し、完了できない場合はクレジットを返金します。",
  },
  {
    match: /Seedance 2\.0 reference videos?|reference video.*2-15|reference video duration|total.*reference.*15|content\[\d+\].*video duration/i,
    th: "วิดีโออ้างอิงของ Seedance 2.0 ต้องยาว 2-15 วินาที และรวมกันไม่เกิน 15 วินาที",
    en: "Seedance 2.0 reference videos must be 2-15 seconds, with total reference video duration up to 15 seconds.",
    ja: "Seedance 2.0 の参照動画は 2〜15 秒、合計 15 秒以内にしてください。",
  },
  {
    match: /content[\s_-]*polic|moderation|blocked|safety[\s_-]*system|disallowed/i,
    th: "ผู้ให้บริการ AI ปฏิเสธคำขอนี้ ลองปรับ prompt หรือไฟล์อ้างอิงให้ปลอดภัยขึ้นครับ",
    en: "The AI provider blocked this request. Try a safer prompt or reference file.",
    ja: "AI プロバイダーがこのリクエストをブロックしました。より安全なプロンプトや参照ファイルに調整してください。",
  },
  {
    match: /timeout|timed out|deadline/i,
    th: "การประมวลผลใช้เวลานานเกินไป ลองใหม่อีกครั้งครับ",
    en: "The request took too long. Please try again.",
    ja: "処理に時間がかかりすぎました。もう一度お試しください。",
  },
];

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

  console.error("[friendlyError] raw:", raw);
  for (const mapping of MAPPINGS) {
    if (mapping.match.test(raw)) return mapping[lang] ?? mapping.en;
  }
  return GENERIC[lang];
}
