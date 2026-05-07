import { describe, it, expect, vi, beforeEach } from "vitest";
import { friendlyError, friendlyErrorOr, functionErrorMessage } from "../friendlyError";

beforeEach(() => {
  // Silence the console.error inside friendlyError so the test log stays readable
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("friendlyError — input shape coercion", () => {
  it("uses .message for Error instances", () => {
    expect(friendlyError(new Error("INSUFFICIENT_CREDITS"), "en")).toMatch(/Not enough credits/);
  });

  it("uses the value directly for string errors", () => {
    expect(friendlyError("INSUFFICIENT_CREDITS", "en")).toMatch(/Not enough credits/);
  });

  it("JSON-stringifies object errors", () => {
    expect(friendlyError({ code: "INSUFFICIENT_CREDITS" }, "en")).toMatch(/Not enough credits/);
  });

  it("falls back to String(err) when JSON.stringify throws (circular)", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    // Does not throw, just returns a generic message because the stringified form
    // ("[object Object]") doesn't match any pattern.
    expect(friendlyError(circular, "en")).toMatch(/Something went wrong/);
  });

  it("logs the raw error to console.error so the team can debug", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    friendlyError("anything", "en");
    expect(spy).toHaveBeenCalled();
    const firstArg = spy.mock.calls[0][0];
    expect(String(firstArg)).toContain("[friendlyError]");
  });
});

describe("friendlyError — language selection", () => {
  it("returns Thai copy when lang='th'", () => {
    expect(friendlyError("INSUFFICIENT_CREDITS", "th")).toMatch(/เครดิตไม่พอ/);
  });

  it("returns Japanese copy when lang='ja'", () => {
    expect(friendlyError("INSUFFICIENT_CREDITS", "ja")).toMatch(/クレジット/);
  });

  it("defaults to English when lang is omitted", () => {
    expect(friendlyError("INSUFFICIENT_CREDITS")).toMatch(/Not enough credits/);
  });
});

describe("friendlyError — credit-system errors", () => {
  it("matches PROVIDER_BILLING_ERROR", () => {
    expect(friendlyError("PROVIDER_BILLING_ERROR", "en")).toMatch(/AI provider is temporarily unavailable/);
  });

  it("matches missing RPC functions (consume_credits / grant_credits)", () => {
    expect(friendlyError("function consume_credits_for(uuid) does not exist", "en"))
      .toMatch(/Credit system error/);
    expect(friendlyError("relation public.user_credits does not exist", "en"))
      .toMatch(/Credit system error/);
  });
});

describe("friendlyError — auth / session errors", () => {
  it("maps 'Invalid login credentials' (Supabase) to localized copy", () => {
    expect(friendlyError("Invalid login credentials", "en")).toMatch(/Wrong email or password/);
  });

  it("maps expired-JWT errors to 'session expired' copy", () => {
    expect(friendlyError("JWT expired", "en")).toMatch(/session expired/i);
    expect(friendlyError("refresh token not found", "en")).toMatch(/session expired/i);
  });

  it("maps duplicate-email signup errors", () => {
    expect(friendlyError("User already registered", "en")).toMatch(/already registered/);
  });
});

describe("friendlyError — RLS / storage errors", () => {
  it("maps RLS violations to a permission-style message", () => {
    expect(friendlyError("new row violates row-level security policy", "en"))
      .toMatch(/don't have permission/);
  });

  it("maps storage 404 / Bucket-not-found to 'file missing'", () => {
    expect(friendlyError("Bucket not found", "en")).toMatch(/file is missing/);
    expect(friendlyError("storage 404 not found", "en")).toMatch(/file is missing/);
  });

  it("maps file-size errors to the 200MB ceiling copy", () => {
    expect(friendlyError("file size exceeded", "en")).toMatch(/200 MB/);
    expect(friendlyError("HTTP 413", "en")).toMatch(/200 MB/);
  });
});

describe("friendlyError — provider errors", () => {
  it("maps content-policy / moderation rejections", () => {
    expect(friendlyError("content_policy_violation", "en")).toMatch(/blocked this request/);
    expect(friendlyError("moderation: disallowed", "en")).toMatch(/blocked this request/);
  });

  it("maps rate limits and 429s", () => {
    expect(friendlyError("rate limit exceeded", "en")).toMatch(/Too many requests/);
    expect(friendlyError("HTTP 429 Too Many Requests", "en")).toMatch(/Too many requests/);
  });

  it("maps Seedance 2.0 reference-video duration errors", () => {
    expect(friendlyError("Seedance 2.0 reference videos must be 2-15 seconds", "en"))
      .toMatch(/2-15 seconds/);
  });

  it("maps Veo image-input rejections", () => {
    expect(friendlyError("Veo image input was rejected", "en"))
      .toMatch(/image input is unavailable/);
  });

  it("maps provider busy / queue overload", () => {
    expect(friendlyError("Provider queue was busy", "en"))
      .toMatch(/busy right now/);
    expect(friendlyError("HTTP 503 temporarily unavailable", "en"))
      .toMatch(/busy right now/);
  });
});

describe("friendlyError — network / timeout", () => {
  it("maps Failed to fetch / NetworkError to connectivity copy", () => {
    expect(friendlyError("Failed to fetch", "en")).toMatch(/Couldn't reach the server/);
    expect(friendlyError("NetworkError", "en")).toMatch(/Couldn't reach the server/);
  });

  it("maps timeout / deadline-exceeded errors", () => {
    expect(friendlyError("Request timeout", "en")).toMatch(/took too long/);
    expect(friendlyError("deadline exceeded", "en")).toMatch(/took too long/);
  });
});

describe("friendlyError — workspace media-tool errors", () => {
  it("maps unsupported-browser audio/video errors", () => {
    expect(friendlyError("Audio extraction is not supported", "en"))
      .toMatch(/Chrome or Edge/);
  });

  it("maps videos with no audio track", () => {
    expect(friendlyError("Source does not contain an audio track", "en"))
      .toMatch(/no audio track/);
  });

  it("maps not-signed-in upload guard", () => {
    expect(friendlyError("Not signed in", "en")).toMatch(/sign in/);
    expect(friendlyError("Please sign in before uploading", "en")).toMatch(/sign in/);
  });
});

describe("friendlyError — billing / org admin / teacher center", () => {
  it("maps class_budget_exhausted to a clear class-pool message", () => {
    expect(friendlyError("class_budget_exhausted", "en"))
      .toMatch(/Class credit pool/);
  });

  it("maps amount_must_be_positive validation", () => {
    expect(friendlyError("amount_must_be_positive", "en"))
      .toMatch(/positive whole number/);
  });

  it("maps missing-portal-URL when Stripe customer portal request fails", () => {
    expect(friendlyError("No portal URL returned", "en"))
      .toMatch(/billing portal/);
  });
});

describe("friendlyError — fallback", () => {
  it("returns the generic English message for unrecognized errors", () => {
    expect(friendlyError("nahmagad something completely unknown 9999", "en"))
      .toBe("Something went wrong — try again or contact support.");
  });

  it("returns the generic Thai message in Thai mode", () => {
    expect(friendlyError("opaque message", "th"))
      .toMatch(/เกิดข้อผิดพลาด/);
  });
});

describe("friendlyErrorOr", () => {
  it("uses friendlyError when a pattern matches", () => {
    expect(friendlyErrorOr("INSUFFICIENT_CREDITS", "en", "MY FALLBACK"))
      .toMatch(/Not enough credits/);
  });

  it("uses the supplied fallback when the error is generic / unmatched", () => {
    expect(friendlyErrorOr("totally novel error code", "en", "MY FALLBACK"))
      .toBe("MY FALLBACK");
  });

  it("respects language for the matched-vs-generic comparison (Thai)", () => {
    expect(friendlyErrorOr("totally novel error code", "th", "ทางเลือก"))
      .toBe("ทางเลือก");
  });
});

describe("functionErrorMessage — Supabase functions.invoke error", () => {
  it("returns error.message when there is no .context", async () => {
    const err = new Error("Edge function failed");
    expect(await functionErrorMessage(err)).toBe("Edge function failed");
  });

  it("returns String(err) when err is not an Error", async () => {
    expect(await functionErrorMessage("plain string err")).toBe("plain string err");
    expect(await functionErrorMessage(null)).toBe("Request failed");
  });

  it("extracts body.error from a JSON response in error.context", async () => {
    const response = new Response(JSON.stringify({ error: "INSUFFICIENT_CREDITS" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    const err = Object.assign(new Error("HTTP 400"), { context: response });
    expect(await functionErrorMessage(err)).toBe("INSUFFICIENT_CREDITS");
  });

  it("extracts body.message when body.error is absent", async () => {
    const response = new Response(JSON.stringify({ message: "validation failed" }), { status: 400 });
    const err = Object.assign(new Error("HTTP 400"), { context: response });
    expect(await functionErrorMessage(err)).toBe("validation failed");
  });

  it("returns raw text when the body is not JSON", async () => {
    const response = new Response("plain non-json body", { status: 500 });
    const err = Object.assign(new Error("HTTP 500"), { context: response });
    expect(await functionErrorMessage(err)).toBe("plain non-json body");
  });

  it("falls back to error.message when the response body is empty", async () => {
    const response = new Response("", { status: 500 });
    const err = Object.assign(new Error("Edge function failed"), { context: response });
    expect(await functionErrorMessage(err)).toBe("Edge function failed");
  });
});
