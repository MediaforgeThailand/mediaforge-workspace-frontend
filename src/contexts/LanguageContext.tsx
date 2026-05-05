import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { en, type TranslationKey } from "./locales/en";

export const SUPPORTED_LANGUAGES = ["en", "th", "es", "ja", "hi"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = "mf-lang";
const DEFAULT_LANGUAGE: Language = "en";
const LANGUAGE_COUNTRY_CODES: Partial<Record<Language, readonly string[]>> = {
  th: ["TH"],
  es: ["AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "ES", "GQ", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE"],
  ja: ["JP"],
};
const LANGUAGE_NATIVE_LABELS: Record<Language, string> = {
  en: "English",
  th: "ไทย",
  es: "Español",
  ja: "日本語",
  hi: "हिन्दी",
};
const LANGUAGE_LOCALES: Record<Language, string> = {
  en: "en-US",
  th: "th-TH",
  es: "es-ES",
  ja: "ja-JP",
  hi: "hi-IN",
};
const COUNTRY_LANGUAGE_LOOKUP = new Map<string, Language>(
  Object.entries(LANGUAGE_COUNTRY_CODES).flatMap(([language, countryCodes]) =>
    (countryCodes ?? []).map((countryCode) => [countryCode, language as Language]),
  ),
);

export const getLanguageNativeLabel = (language: Language): string =>
  LANGUAGE_NATIVE_LABELS[language] ?? LANGUAGE_NATIVE_LABELS[DEFAULT_LANGUAGE];

export const getLanguageLocale = (language: Language): string =>
  LANGUAGE_LOCALES[language] ?? LANGUAGE_LOCALES[DEFAULT_LANGUAGE];

export const getNextLanguage = (language: Language): Language => {
  const currentIndex = SUPPORTED_LANGUAGES.indexOf(language);
  return SUPPORTED_LANGUAGES[(currentIndex + 1) % SUPPORTED_LANGUAGES.length] ?? DEFAULT_LANGUAGE;
};

export const getLocalizedText = (
  language: Language,
  values: Partial<Record<Language, string>> & { en: string },
): string => values[language] ?? values.en;

const isSupportedLanguage = (value: unknown): value is Language =>
  typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);

export type TranslationMap = Readonly<Record<TranslationKey, string>>;

const loadedTranslations: Partial<Record<Language, TranslationMap>> = { en };

const localeLoaders: Record<Language, () => Promise<TranslationMap>> = {
  en: async () => en,
  th: () => import("./locales/th").then((module) => module.th),
  es: () => import("./locales/es").then((module) => module.es),
  ja: () => import("./locales/ja").then((module) => module.ja),
  hi: () => import("./locales/hi").then((module) => module.hi),
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getStoredLanguage = (): Language | null => {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(saved) ? saved : null;
};

const detectNavigatorDefaultLanguage = (): Language | null => {
  if (typeof navigator === "undefined") return null;
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const languageCode = candidate.toLowerCase().split(/[-_]/)[0];
    if (isSupportedLanguage(languageCode)) return languageCode;
  }
  return null;
};

const countryToLanguage = (countryCode: string | null): Language => {
  const code = countryCode?.trim().toUpperCase();
  if (!code) return DEFAULT_LANGUAGE;
  return COUNTRY_LANGUAGE_LOOKUP.get(code) ?? DEFAULT_LANGUAGE;
};

const parseCloudflareTraceCountry = (trace: string): string | null => {
  const line = trace
    .split("\n")
    .find((entry) => entry.trim().toLowerCase().startsWith("loc="));
  return line ? line.split("=")[1]?.trim() || null : null;
};

const detectIpDefaultLanguage = async (): Promise<{ language: Language; resolved: boolean }> => {
  if (typeof fetch === "undefined") return { language: DEFAULT_LANGUAGE, resolved: false };
  try {
    const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
      cache: "no-store",
    });
    if (!response.ok) return { language: DEFAULT_LANGUAGE, resolved: false };
    const countryCode = parseCloudflareTraceCountry(await response.text());
    return {
      language: countryToLanguage(countryCode),
      resolved: Boolean(countryCode),
    };
  } catch {
    return { language: DEFAULT_LANGUAGE, resolved: false };
  }
};

const formatTranslation = (
  template: string,
  params?: Record<string, string | number>,
): string => {
  if (!params) return template;

  return Object.entries(params).reduce((text, [key, value]) => {
    const token = `{${key}}`;
    return text.split(token).join(String(value));
  }, template);
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const initialStoredLanguageRef = useRef<Language | null>(getStoredLanguage());
  const initialNavigatorLanguageRef = useRef<Language | null>(
    initialStoredLanguageRef.current ? null : detectNavigatorDefaultLanguage(),
  );
  const hadStoredLanguageRef = useRef(initialStoredLanguageRef.current !== null);
  const userSelectedLanguageRef = useRef(hadStoredLanguageRef.current);
  const [canPersistLanguage, setCanPersistLanguage] = useState(hadStoredLanguageRef.current);
  const [language, setLanguageState] = useState<Language>(
    () => initialStoredLanguageRef.current ?? initialNavigatorLanguageRef.current ?? DEFAULT_LANGUAGE,
  );
  const [activeTranslations, setActiveTranslations] = useState<TranslationMap>(
    () => loadedTranslations[language] ?? en,
  );

  const setLanguage = (lang: Language) => {
    userSelectedLanguageRef.current = true;
    setCanPersistLanguage(true);
    setLanguageState(lang);
  };

  useEffect(() => {
    if (hadStoredLanguageRef.current) return;
    if (initialNavigatorLanguageRef.current) return;
    let cancelled = false;
    void detectIpDefaultLanguage().then((result) => {
      if (cancelled) return;
      if (result.resolved) setCanPersistLanguage(true);
      if (!userSelectedLanguageRef.current) {
        setLanguageState(result.language);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (canPersistLanguage && typeof localStorage !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [canPersistLanguage, language]);

  useEffect(() => {
    let cancelled = false;
    const cachedTranslations = loadedTranslations[language];
    if (cachedTranslations) {
      setActiveTranslations(cachedTranslations);
      return () => {
        cancelled = true;
      };
    }

    void localeLoaders[language]()
      .then((loaded) => {
        loadedTranslations[language] = loaded;
        if (!cancelled) setActiveTranslations(loaded);
      })
      .catch((error) => {
        console.error("[LanguageContext] Failed to load locale", language, error);
        if (!cancelled) setActiveTranslations(en);
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  // Keep <html lang="…"> in sync with the active UI language so screen
  // readers, SEO crawlers, and the browser's spell-checker pick the
  // right locale. Runs on mount and on every language change.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = getLanguageLocale(language);
    }
  }, [language]);

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const template = activeTranslations[key] ?? en[key] ?? key;
    return formatTranslation(template, params);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

/** Fallback used when useLanguage is called outside LanguageProvider (e.g. error boundaries). */
const fallbackContext: LanguageContextType = {
  language: "en",
  setLanguage: () => {},
  t: (key, params) => formatTranslation(en[key] ?? key, params),
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    console.warn("useLanguage called outside LanguageProvider — using English fallback");
    return fallbackContext;
  }
  return context;
};
