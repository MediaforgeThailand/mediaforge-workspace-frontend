import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("should load and display hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/mediaforge/i);
    // Verify the page renders content (not blank)
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("should have navigation links", async ({ page }) => {
    await page.goto("/");
    // Check for auth/login link or button
    const authLink = page.getByRole("link", { name: /login|sign|เข้าสู่ระบบ|ลงทะเบียน|get started|เริ่มต้น/i }).first();
    await expect(authLink).toBeVisible({ timeout: 10_000 });
  });

  test("should navigate to auth page", async ({ page }) => {
    await page.goto("/");
    const authLink = page.getByRole("link", { name: /login|sign|get started|เริ่มต้น/i }).first();
    await authLink.click();
    await page.waitForURL("**/auth");
    await expect(page.url()).toContain("/auth");
  });
});

test.describe("Auth Page", () => {
  test("should render login form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByLabel("Email").first()).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("should switch between login and signup tabs", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("tab", { name: /sign up/i }).click();
    await expect(page.getByLabel("Full Name")).toBeVisible();
    await expect(page.getByLabel("Email").last()).toBeVisible();
    await page.getByRole("tab", { name: /login/i }).click();
    await expect(page.getByLabel("Full Name")).not.toBeVisible();
  });

  test("should show error on invalid login", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").first().fill("invalid@test.com");
    await page.getByLabel("Password").first().fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Should show error toast
    await expect(page.getByText(/failed|error|ไม่สำเร็จ/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("should have Google sign-in button", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /google/i }).first()).toBeVisible();
  });

  test("should have forgot password link", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText(/ลืมรหัสผ่าน|forgot/i).first()).toBeVisible();
  });
});

test.describe("Terms Page", () => {
  test("should load terms page", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Privacy Page", () => {
  test("should load privacy page", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("404 Page", () => {
  test("should show not found for invalid routes", async ({ page }) => {
    await page.goto("/some-random-invalid-route");
    await expect(page.getByText(/not found|404|ไม่พบ/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Reset Password Page", () => {
  test("should load reset password page", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Partner Program Page", () => {
  test("should load partner program page", async ({ page }) => {
    await page.goto("/partner-program");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Explore Page", () => {
  test("should load explore and show content", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
