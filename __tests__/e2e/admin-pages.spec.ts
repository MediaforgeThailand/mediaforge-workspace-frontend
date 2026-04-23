import { test, expect } from "@playwright/test";
import { adminSignIn, waitForAppReady } from "./fixtures";

test.describe("Admin Pages", () => {
  test("Admin login page loads", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("Admin login shows error with invalid credentials", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("bad@admin.dev");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: /เข้าสู่ระบบ|sign in|login/i }).click();
    await expect(page.getByText(/failed|error|ไม่สำเร็จ|ผิดพลาด/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Admin dashboard redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/admin/login", { timeout: 10_000 });
    await expect(page.url()).toContain("/admin/login");
  });

  test("Admin review queue redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin/review-queue");
    await page.waitForURL("**/admin/login", { timeout: 10_000 });
    await expect(page.url()).toContain("/admin/login");
  });

  test("Admin flow-active redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin/flow-active");
    await page.waitForURL("**/admin/login", { timeout: 10_000 });
    await expect(page.url()).toContain("/admin/login");
  });
});
