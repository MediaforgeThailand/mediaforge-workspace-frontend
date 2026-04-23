import { describe, it, expect } from "vitest";
import { formatDuration, formatTimeAgo } from "../useFlows";

describe("formatDuration", () => {
  it("returns '—' for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("returns '—' for 0", () => {
    expect(formatDuration(0)).toBe("—");
  });

  it("formats seconds under 60", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(59000)).toBe("59s");
    expect(formatDuration(500)).toBe("1s"); // rounds up from 0.5
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("handles large values", () => {
    expect(formatDuration(3600000)).toBe("60m 0s");
  });
});

describe("formatTimeAgo", () => {
  const now = Date.now();

  it("returns 'Just now' for < 1 minute", () => {
    expect(formatTimeAgo(new Date(now - 10000).toISOString())).toBe("Just now");
    expect(formatTimeAgo(new Date(now - 59000).toISOString())).toBe("Just now");
  });

  it("returns minutes ago", () => {
    expect(formatTimeAgo(new Date(now - 60000).toISOString())).toBe("1m ago");
    expect(formatTimeAgo(new Date(now - 5 * 60000).toISOString())).toBe("5m ago");
    expect(formatTimeAgo(new Date(now - 59 * 60000).toISOString())).toBe("59m ago");
  });

  it("returns hours ago", () => {
    expect(formatTimeAgo(new Date(now - 60 * 60000).toISOString())).toBe("1h ago");
    expect(formatTimeAgo(new Date(now - 23 * 60 * 60000).toISOString())).toBe("23h ago");
  });

  it("returns days ago", () => {
    expect(formatTimeAgo(new Date(now - 24 * 60 * 60000).toISOString())).toBe("1d ago");
    expect(formatTimeAgo(new Date(now - 6 * 24 * 60 * 60000).toISOString())).toBe("6d ago");
  });

  it("returns weeks ago", () => {
    expect(formatTimeAgo(new Date(now - 7 * 24 * 60 * 60000).toISOString())).toBe("1w ago");
    expect(formatTimeAgo(new Date(now - 21 * 24 * 60 * 60000).toISOString())).toBe("3w ago");
  });
});
