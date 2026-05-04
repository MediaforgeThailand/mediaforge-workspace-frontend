export type SupportedWorkspaceCurrency =
  | "thb"
  | "usd"
  | "eur"
  | "gbp"
  | "jpy"
  | "cad"
  | "cny"
  | "hkd"
  | "aud"
  | "sgd";

export type WorkspaceCurrencyConfig = {
  currency: SupportedWorkspaceCurrency;
  label: string;
  countryHint: string;
  thbPerUnit: number;
  bufferPercent: number;
  zeroDecimal: boolean;
  strategy: "promptpay_oneoff" | "stripe_subscription";
  popularityPercent?: number;
};

export const WORKSPACE_CURRENCIES: WorkspaceCurrencyConfig[] = [
  { currency: "thb", label: "Thai baht", countryHint: "TH", thbPerUnit: 1, bufferPercent: 0, zeroDecimal: false, strategy: "promptpay_oneoff" },
  { currency: "usd", label: "United States dollar", countryHint: "US", thbPerUnit: 32.4, bufferPercent: 25, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 48.46 },
  { currency: "eur", label: "Euro", countryHint: "EU", thbPerUnit: 37.55, bufferPercent: 23, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 23.56 },
  { currency: "gbp", label: "Pound sterling", countryHint: "GB", thbPerUnit: 42.79, bufferPercent: 22, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 7.06 },
  { currency: "jpy", label: "Japanese yen", countryHint: "JP", thbPerUnit: 0.213, bufferPercent: 30, zeroDecimal: true, strategy: "stripe_subscription", popularityPercent: 3.7 },
  { currency: "cad", label: "Canadian dollar", countryHint: "CA", thbPerUnit: 23.15, bufferPercent: 25, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 3.11 },
  { currency: "cny", label: "Chinese renminbi", countryHint: "CN", thbPerUnit: 4.55, bufferPercent: 30, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 2.89 },
  { currency: "hkd", label: "Hong Kong dollar", countryHint: "HK", thbPerUnit: 4.17, bufferPercent: 28, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 1.91 },
  { currency: "aud", label: "Australian dollar", countryHint: "AU", thbPerUnit: 20.98, bufferPercent: 25, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 1.49 },
  { currency: "sgd", label: "Singapore dollar", countryHint: "SG", thbPerUnit: 24.99, bufferPercent: 25, zeroDecimal: false, strategy: "stripe_subscription", popularityPercent: 1.43 },
];

export const WORKSPACE_CURRENCY_MAP = WORKSPACE_CURRENCIES.reduce(
  (acc, currency) => {
    acc[currency.currency] = currency;
    return acc;
  },
  {} as Record<SupportedWorkspaceCurrency, WorkspaceCurrencyConfig>,
);

const COUNTRY_TO_CURRENCY: Partial<Record<string, SupportedWorkspaceCurrency>> = {
  TH: "thb",
  US: "usd",
  GB: "gbp",
  JP: "jpy",
  CA: "cad",
  CN: "cny",
  HK: "hkd",
  AU: "aud",
  SG: "sgd",
};

const EURO_COUNTRIES = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

const TIMEZONE_TO_CURRENCY: Partial<Record<string, SupportedWorkspaceCurrency>> = {
  "Asia/Bangkok": "thb",
  "America/New_York": "usd",
  "America/Chicago": "usd",
  "America/Denver": "usd",
  "America/Los_Angeles": "usd",
  "America/Toronto": "cad",
  "America/Vancouver": "cad",
  "Europe/London": "gbp",
  "Europe/Paris": "eur",
  "Europe/Berlin": "eur",
  "Europe/Madrid": "eur",
  "Europe/Rome": "eur",
  "Europe/Amsterdam": "eur",
  "Asia/Tokyo": "jpy",
  "Asia/Shanghai": "cny",
  "Asia/Hong_Kong": "hkd",
  "Asia/Singapore": "sgd",
  "Australia/Sydney": "aud",
  "Australia/Melbourne": "aud",
};

export function normalizeWorkspaceCurrency(value: unknown): SupportedWorkspaceCurrency {
  const next = String(value ?? "thb").toLowerCase() as SupportedWorkspaceCurrency;
  return WORKSPACE_CURRENCY_MAP[next] ? next : "thb";
}

export function detectWorkspaceCurrency(): SupportedWorkspaceCurrency {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && TIMEZONE_TO_CURRENCY[timezone]) {
      return TIMEZONE_TO_CURRENCY[timezone];
    }

    const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const locale of locales) {
      const region = getLocaleRegion(locale);
      if (!region) continue;
      if (EURO_COUNTRIES.has(region)) return "eur";
      if (COUNTRY_TO_CURRENCY[region]) return COUNTRY_TO_CURRENCY[region];
    }

    const localeText = locales.join(" ").toLowerCase();
    if (localeText.includes("th")) return "thb";
    if (localeText.includes("ja")) return "jpy";
    if (localeText.includes("en-gb")) return "gbp";
    if (localeText.includes("en-ca") || localeText.includes("fr-ca")) return "cad";
    if (localeText.includes("zh-hk")) return "hkd";
    if (localeText.includes("zh")) return "cny";
    if (localeText.includes("en-au")) return "aud";
    if (localeText.includes("en-sg") || localeText.includes("zh-sg")) return "sgd";
    if (localeText.includes("fr") || localeText.includes("de") || localeText.includes("es") || localeText.includes("it") || localeText.includes("nl")) return "eur";
  } catch {
    // SSR/tests or restricted browser APIs.
  }
  return "usd";
}

function getLocaleRegion(locale: string | undefined): string | null {
  if (!locale) return null;
  try {
    const parsed = new Intl.Locale(locale);
    if (parsed.region) return parsed.region.toUpperCase();
  } catch {
    // Older browsers can still be handled by the fallback below.
  }
  const match = locale.match(/[-_]([A-Za-z]{2}|\d{3})\b/);
  return match?.[1]?.toUpperCase() ?? null;
}

export function amountMinorFromThb(thb: number, currency: SupportedWorkspaceCurrency): number {
  const config = WORKSPACE_CURRENCY_MAP[currency];
  const major = currency === "thb"
    ? thb
    : (thb / config.thbPerUnit) * (1 + config.bufferPercent / 100);
  return config.zeroDecimal ? Math.max(1, Math.round(major)) : Math.max(100, Math.round(major * 100));
}

export function formatWorkspaceMoneyFromMinor(amountMinor: number, currency: SupportedWorkspaceCurrency): string {
  const config = WORKSPACE_CURRENCY_MAP[currency];
  const major = config.zeroDecimal ? amountMinor : amountMinor / 100;
  const locale = currency === "thb" ? "th-TH" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: config.zeroDecimal ? 0 : 2,
  }).format(major);
}

export function formatWorkspaceMoneyFromThb(thb: number, currency: SupportedWorkspaceCurrency): string {
  return formatWorkspaceMoneyFromMinor(amountMinorFromThb(thb, currency), currency);
}
