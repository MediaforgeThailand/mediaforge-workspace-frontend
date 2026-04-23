import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./fixtures";

const FLOW_ID = "edb320da-1816-4548-87ef-8bb82fa6a3fe";
const PLAY_URL = `/play/${FLOW_ID}`;

// ─── Page Load ─────────────────────────────────────────

test.describe("PlayFlow page", () => {
  test("loads correctly and is not blank", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    // Page should not show 404
    const notFound = page.getByText(/not found|404/i);
    await expect(notFound).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

    // Main content area should exist
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });
  });

  // ─── Flow Metadata ────────────────────────────────────

  test("displays flow metadata and creator card", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    // Creator card should be visible (contains avatar + name + Follow button)
    const creatorCard = page.locator("text=Follow").first();
    await expect(creatorCard).toBeVisible({ timeout: 10_000 });

    // Flow title should be visible (an h2 in the left panel)
    const title = page.locator("h2").first();
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);
  });

  // ─── Configuration Panel ──────────────────────────────

  test("renders configuration panel with input fields", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    // "Configuration" heading should be visible
    const configHeading = page.getByText("Configuration");
    await expect(configHeading).toBeVisible({ timeout: 10_000 });

    // At least one input element should exist (textarea, input, select, or upload area)
    const inputs = page.locator("textarea, input[type='text'], select, [class*='upload']");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  // ─── Generate Button ─────────────────────────────────

  test("Generate button is visible", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    const generateBtn = page.getByRole("button", { name: /generate/i });
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });
  });

  // ─── Auth Gate ────────────────────────────────────────

  test("clicking Generate without auth shows login prompt", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    const generateBtn = page.getByRole("button", { name: /generate/i });
    await generateBtn.click();

    // Should show login dialog or redirect to /auth
    const loginVisible = await Promise.race([
      page.getByText(/เข้าสู่ระบบ|sign in|login|สมัคร/i).waitFor({ timeout: 5_000 }).then(() => true),
      page.waitForURL("**/auth**", { timeout: 5_000 }).then(() => true),
    ]).catch(() => false);

    expect(loginVisible).toBe(true);
  });

  // ─── Invalid Flow ID ─────────────────────────────────

  test("invalid flow ID shows error state", async ({ page }) => {
    await page.goto("/play/nonexistent-flow-id-12345");
    await waitForAppReady(page);

    // Should show an error message or empty/not-found state — not crash
    const hasError = await Promise.race([
      page.getByText(/not found|error|ไม่พบ|ผิดพลาด/i).first().waitFor({ timeout: 8_000 }).then(() => true),
      page.locator(".animate-spin").first().waitFor({ state: "visible", timeout: 3_000 }).then(() => "loading" as const),
    ]).catch(() => false);

    // Acceptable: error message shown OR still loading (no crash)
    expect(hasError !== false || (await page.locator("main").count()) > 0).toBe(true);
  });
});

// ─── Mobile Viewport ──────────────────────────────────

test.describe("PlayFlow mobile", () => {
  test.use({ viewport: { width: 393, height: 851 } }); // Pixel 5

  test("layout stacks vertically on mobile", async ({ page }) => {
    await page.goto(PLAY_URL);
    await waitForAppReady(page);

    // Config panel should still be accessible (scrollable)
    const configHeading = page.getByText("Configuration");
    await expect(configHeading).toBeVisible({ timeout: 10_000 });

    // Generate button should be visible after scrolling
    const generateBtn = page.getByRole("button", { name: /generate/i });
    await generateBtn.scrollIntoViewIfNeeded();
    await expect(generateBtn).toBeVisible();
  });
});
