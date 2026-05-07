import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveOrgLogin, clearOrgLoginCache } from "../orgLoginResolver";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
  clearOrgLoginCache();
});

describe("resolveOrgLogin — input shape", () => {
  it("short-circuits when the input is not an email (no @)", async () => {
    const result = await resolveOrgLogin("not-an-email");
    expect(result).toEqual({ is_org: false });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("trims and lowercases the email before invoking", async () => {
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });
    await resolveOrgLogin("  USER@Acme.COM  ");
    expect(invokeMock).toHaveBeenCalledWith("mf-um-resolve-login", {
      body: { email: "user@acme.com" },
    });
  });
});

describe("resolveOrgLogin — happy path", () => {
  it("returns the org payload from the edge function", async () => {
    const orgPayload = {
      is_org: true,
      org: { id: "o1", name: "Acme", slug: "acme", logo_url: null },
      providers: [{ provider: "google_workspace", is_primary: true, config: {} }],
      blocked_methods: ["password"],
    };
    invokeMock.mockResolvedValue({ data: orgPayload, error: null });

    const result = await resolveOrgLogin("user@acme.com");
    expect(result).toEqual(orgPayload);
  });

  it("returns is_org=false for consumer emails", async () => {
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });
    expect(await resolveOrgLogin("user@gmail.com")).toEqual({ is_org: false });
  });
});

describe("resolveOrgLogin — failure handling", () => {
  it("falls back to is_org=false when the edge function returns an error", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await resolveOrgLogin("user@acme.com")).toEqual({ is_org: false });
  });

  it("falls back to is_org=false when data is null even without an explicit error", async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    expect(await resolveOrgLogin("user@acme.com")).toEqual({ is_org: false });
  });
});

describe("resolveOrgLogin — caching", () => {
  it("caches successful lookups for repeat calls with the same email", async () => {
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });

    await resolveOrgLogin("user@acme.com");
    await resolveOrgLogin("user@acme.com");
    await resolveOrgLogin("USER@ACME.COM"); // case variations are normalised before cache lookup

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache failure results — the next call retries the edge function", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "5xx" } });
    invokeMock.mockResolvedValueOnce({ data: { is_org: false }, error: null });

    const first = await resolveOrgLogin("user@acme.com");
    const second = await resolveOrgLogin("user@acme.com");

    expect(first).toEqual({ is_org: false });
    expect(second).toEqual({ is_org: false });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("clearOrgLoginCache forces the next call to re-invoke", async () => {
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });

    await resolveOrgLogin("user@acme.com");
    clearOrgLoginCache();
    await resolveOrgLogin("user@acme.com");

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("expires cached entries after the 5-minute TTL", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });

    await resolveOrgLogin("user@acme.com");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // 5min 1ms — past TTL
    await resolveOrgLogin("user@acme.com");

    expect(invokeMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("keeps cached entries within the 5-minute TTL", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ data: { is_org: false }, error: null });

    await resolveOrgLogin("user@acme.com");
    vi.advanceTimersByTime(4 * 60 * 1000); // 4min — still inside TTL
    await resolveOrgLogin("user@acme.com");

    expect(invokeMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
