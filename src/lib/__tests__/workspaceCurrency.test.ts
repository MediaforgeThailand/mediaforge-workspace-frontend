import { describe, it, expect } from "vitest";
import {
  normalizeWorkspaceCurrency,
  amountMinorFromThb,
  formatWorkspaceMoneyFromMinor,
  WORKSPACE_CURRENCY_MAP,
} from "../workspaceCurrency";

describe("normalizeWorkspaceCurrency", () => {
  it("returns the value when it is a supported currency", () => {
    expect(normalizeWorkspaceCurrency("usd")).toBe("usd");
    expect(normalizeWorkspaceCurrency("EUR")).toBe("eur");
  });

  it("falls back to 'thb' for unsupported / nullish input", () => {
    expect(normalizeWorkspaceCurrency("xyz")).toBe("thb");
    expect(normalizeWorkspaceCurrency(null)).toBe("thb");
    expect(normalizeWorkspaceCurrency(undefined)).toBe("thb");
    expect(normalizeWorkspaceCurrency(123)).toBe("thb");
  });
});

describe("amountMinorFromThb", () => {
  it("returns satang as integer for THB (no buffer applied)", () => {
    // 50 THB → 5000 satang
    expect(amountMinorFromThb(50, "thb")).toBe(5000);
  });

  it("enforces a 100-minor floor for non-zero-decimal currencies", () => {
    // 0.01 THB conversion would be ~tiny — must round up to 100 (one penny)
    expect(amountMinorFromThb(0.01, "usd")).toBe(100);
  });

  it("converts THB → USD minor units with buffer applied", () => {
    const usd = WORKSPACE_CURRENCY_MAP.usd;
    // 100 THB → (100 / 32.4) * 1.25 USD ≈ 3.858; * 100 = 386 cents
    const expected = Math.max(
      100,
      Math.round((100 / usd.thbPerUnit) * (1 + usd.bufferPercent / 100) * 100),
    );
    expect(amountMinorFromThb(100, "usd")).toBe(expected);
  });

  it("treats JPY as zero-decimal (no ×100), with floor of 1", () => {
    // 100 THB → 100 / 0.213 * 1.30 ≈ 610 yen
    const value = amountMinorFromThb(100, "jpy");
    expect(value).toBeGreaterThan(100);
    expect(Number.isInteger(value)).toBe(true);

    // Tiny THB amount still yields ≥1 yen, never 0
    expect(amountMinorFromThb(0.001, "jpy")).toBeGreaterThanOrEqual(1);
  });
});

describe("formatWorkspaceMoneyFromMinor", () => {
  it("formats THB with two decimals when applicable", () => {
    const out = formatWorkspaceMoneyFromMinor(5000, "thb");
    // Locale-dependent — sanity-check that THB symbol/code shows up
    expect(out).toMatch(/50/);
    expect(out.toUpperCase()).toMatch(/THB|฿/);
  });

  it("formats JPY as zero-decimal", () => {
    const out = formatWorkspaceMoneyFromMinor(750, "jpy");
    expect(out).toMatch(/750/);
    expect(out).not.toMatch(/\.00/);
  });

  it("formats USD with two decimals", () => {
    const out = formatWorkspaceMoneyFromMinor(123, "usd");
    expect(out).toMatch(/1\.23/);
  });
});
