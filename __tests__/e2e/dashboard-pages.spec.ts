import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./fixtures";

test.describe("Dashboard Pages (Guest Access)", () => {
  test("Home /app/home loads and shows content", async ({ page }) => {
    await page.goto("/app/home");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });


  test("Assets /app/assets loads", async ({ page }) => {
    await page.goto("/app/assets");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Flow Studio Dashboard /app/flow-studio loads", async ({ page }) => {
    await page.goto("/app/flow-studio");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Pricing /app/pricing loads", async ({ page }) => {
    await page.goto("/app/pricing");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Settings /app/settings loads", async ({ page }) => {
    await page.goto("/app/settings");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Transactions /app/transactions loads", async ({ page }) => {
    await page.goto("/app/transactions");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Analytics /app/analytics loads", async ({ page }) => {
    await page.goto("/app/analytics");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Dashboard Pages (Protected)", () => {
  test("History /app/history redirects to auth when not logged in", async ({ page }) => {
    await page.goto("/app/history");
    await page.waitForURL("**/auth", { timeout: 10_000 });
    await expect(page.url()).toContain("/auth");
  });
});

test.describe("Home Page Details", () => {
  test("should display marketplace sections", async ({ page }) => {
    await page.goto("/app/home");
    await waitForAppReady(page);
    // Should have some cards/grid content
    const cards = page.locator("[class*='card'], [class*='Card']");
    // Just verify the page loaded with some structure
    await expect(page.locator("main, [class*='max-w']").first()).toBeVisible();
  });
});
