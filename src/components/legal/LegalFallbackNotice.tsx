import type { Language } from "@/contexts/LanguageContext";

const LEGAL_FALLBACK_NOTICE: Partial<Record<Language, string>> = {
  es: "Este documento legal está disponible actualmente en inglés. La interfaz del producto puede mostrarse en Español, pero esta versión legal se proporciona en inglés.",
  ja: "この法的文書は現在英語で提供されています。製品のUIは日本語で表示できますが、この法的文書は英語版として提供されます。",
  hi: "यह कानूनी दस्तावेज़ फिलहाल अंग्रेज़ी में उपलब्ध है। प्रोडक्ट UI हिन्दी में दिख सकता है, लेकिन यह कानूनी दस्तावेज़ अंग्रेज़ी संस्करण के रूप में प्रदान किया गया है।",
};

export function LegalFallbackNotice({ language }: { language: Language }) {
  const notice = LEGAL_FALLBACK_NOTICE[language];
  if (!notice) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
      {notice}
    </div>
  );
}
