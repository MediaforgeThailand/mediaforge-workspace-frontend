// Silent referral capture: reads ?ref= from URL, posts to track-click,
// and persists the code in cookie + localStorage for later signup attribution.
import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "./fingerprint";

const STORAGE_KEY = "mf_ref";
const COOKIE_NAME = "mf_ref";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SESSION_FLAG_PREFIX = "mf_tracked_";
const CODE_PATTERN = /^MF-[A-Z0-9-]{4,32}$/;

function setCookie(value: string) {
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function readCookie(): string | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${COOKIE_NAME}=`));
    return match ? decodeURIComponent(match.split("=")[1]) : null;
  } catch {
    return null;
  }
}

function deleteCookie() {
  try {
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function getUtmParams(params: URLSearchParams) {
  return {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
  };
}

function stripRefFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    const newSearch = url.searchParams.toString();
    const newUrl =
      url.pathname + (newSearch ? `?${newSearch}` : "") + url.hash;
    window.history.replaceState({}, "", newUrl);
  } catch {
    // ignore
  }
}

export async function captureFromUrl(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const rawCode = params.get("ref");
    if (!rawCode) return;

    const code = rawCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      console.warn("[referralCapture] Invalid code format:", rawCode);
      stripRefFromUrl();
      return;
    }

    const sessionFlag = SESSION_FLAG_PREFIX + code;
    const alreadyTracked =
      window.sessionStorage.getItem(sessionFlag) === "1";

    const existingCode = getStoredCode();
    const shouldPersist =
      !existingCode || !CODE_PATTERN.test(existingCode) || existingCode === code;

    // First-touch attribution: once a valid referral is stored, later links
    // still get click analytics but do not replace the checkout/signup code.
    if (shouldPersist) {
      setCookie(code);
      try {
        window.localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // ignore
      }
    }

    if (alreadyTracked) {
      stripRefFromUrl();
      return;
    }

    const utm = getUtmParams(params);
    const visitorId = await getVisitorId();

    const { error } = await supabase.functions.invoke("track-click", {
      body: {
        code,
        device_fp: visitorId,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
        landing_path: window.location.pathname,
        ...utm,
      },
    });

    if (error) {
      console.warn("[referralCapture] track-click failed:", error);
    } else {
      try {
        window.sessionStorage.setItem(sessionFlag, "1");
      } catch {
        // ignore
      }
    }

    stripRefFromUrl();
  } catch (err) {
    console.warn("[referralCapture] Unexpected error:", err);
  }
}

export function getStoredCode(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = readCookie();
  if (fromCookie) return fromCookie;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredCode(): void {
  if (typeof window === "undefined") return;
  deleteCookie();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
