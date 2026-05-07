import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the workspace product's public surface.
 *
 * The protected dashboard / canvas / org-admin routes live under `/app/*` and
 * redirect to `/auth` when unauthenticated — those are exercised in
 * workspace-routes.spec.ts so this file stays free of auth dependencies.
 */

test.describe("Public routes", () => {
  test("/ redirects unauthenticated visitors into the app shell", async ({ page }) => {
    await page.goto("/");
    // Root redirects to /app/workspace; without a session ProtectedRoute then
    // sends the user to /auth.
    await page.waitForURL(/\/(auth|app\/workspace)$/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(auth|app\/workspace)/);
  });

  test("/auth renders the login form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page).toHaveTitle(/mediaforge/i);
    await expect(page.getByLabel("Email").first()).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("/auth surfaces an error for invalid credentials", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").first().fill("invalid@test.example");
    await page.getByLabel("Password").first().fill("wrongpassword-123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(
      page.getByText(/failed|error|invalid|ไม่สำเร็จ|ไม่ถูกต้อง/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("/auth offers Google SSO", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /google/i }).first()).toBeVisible();
  });

  test("/reset-password loads", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("/privacy renders body content", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("/terms renders body content", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Catch-all route", () => {
  test("unknown URLs render the 404 page", async ({ page }) => {
    await page.goto("/some-route-that-does-not-exist");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible({ timeout: 10_000 });
  });
});
