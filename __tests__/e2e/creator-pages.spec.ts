import { test, expect } from "./fixtures";
import { waitForAppReady } from "./fixtures";

test.describe("Creator Pages (Authenticated)", () => {
  test("redirects to auth when not logged in", async ({ page }) => {
    await page.goto("/creator");
    await page.waitForURL("**/auth", { timeout: 10_000 });
    await expect(page.url()).toContain("/auth");
  });

  test("Creator Home loads when authenticated", async ({ authedPage }) => {
    await authedPage.goto("/creator");
    await waitForAppReady(authedPage);
    await expect(authedPage.locator("body")).not.toBeEmpty();
    await expect(authedPage.url()).toContain("/creator");
  });

  test("Creator Studio loads", async ({ authedPage }) => {
    await authedPage.goto("/creator/studio");
    await waitForAppReady(authedPage);
    await expect(authedPage.locator("body")).not.toBeEmpty();
  });

  test("Published Flows loads", async ({ authedPage }) => {
    await authedPage.goto("/creator/published");
    await waitForAppReady(authedPage);
    await expect(authedPage.locator("body")).not.toBeEmpty();
  });

  test("Creator Flow Status loads", async ({ authedPage }) => {
    await authedPage.goto("/creator/flows");
    await waitForAppReady(authedPage);
    await expect(authedPage.locator("body")).not.toBeEmpty();
  });

  test("Creator Analytics loads", async ({ authedPage }) => {
    await authedPage.goto("/creator/analytics");
    await waitForAppReady(authedPage);
    await expect(authedPage.locator("body")).not.toBeEmpty();
  });
});
