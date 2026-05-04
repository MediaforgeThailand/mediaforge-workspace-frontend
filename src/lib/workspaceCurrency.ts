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

export function normalizeWorkspaceCurrency(value: unknown): SupportedWorkspaceCurrency {
  const next = String(value ?? "thb").toLowerCase() as SupportedWorkspaceCurrency;
  return WORKSPACE_CURRENCY_MAP[next] ? next : "thb";
}

export function detectWorkspaceCurrency(): SupportedWorkspaceCurrency {
  try {
    const stored = window.localStorage.getItem("workspace_currency");
    if (stored) return normalizeWorkspaceCurrency(stored);
    const locale = navigator.language.toLowerCase();
    if (locale.includes("th")) return "thb";
    if (locale.includes("ja")) return "jpy";
    if (locale.includes("en-gb")) return "gbp";
    if (locale.includes("en-ca") || locale.includes("fr-ca")) return "cad";
    if (locale.includes("zh-hk")) return "hkd";
    if (locale.includes("zh")) return "cny";
    if (locale.includes("en-au")) return "aud";
    if (locale.includes("en-sg") || locale.includes("zh-sg")) return "sgd";
    if (locale.includes("fr") || locale.includes("de") || locale.includes("es") || locale.includes("it") || locale.includes("nl")) return "eur";
  } catch {
    // SSR/tests or storage disabled.
  }
  return "usd";
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
