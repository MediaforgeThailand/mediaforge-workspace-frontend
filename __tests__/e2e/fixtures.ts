import { test as base, expect, Page } from "@playwright/test";

/* ─── Shared helpers ─── */

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || "e2e-test@mediaforge.dev",
  password: process.env.E2E_USER_PASSWORD || "Test1234!",
};

export const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@mediaforge.dev",
  password: process.env.E2E_ADMIN_PASSWORD || "Admin1234!",
};

/** Wait for the app shell to finish loading (spinner gone). */
export async function waitForAppReady(page: Page) {
  await page.waitForLoadState("networkidle");
  // Wait for the main loading spinner to disappear
  await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

/** Sign in via the Auth page UI. */
export async function signIn(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto("/auth");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/app/home", { timeout: 15_000 });
}

/** Sign in to the admin panel. */
export async function adminSignIn(page: Page, email = ADMIN_USER.email, password = ADMIN_USER.password) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|sign in|login/i }).click();
  await page.waitForURL("**/admin", { timeout: 15_000 });
}

/* ─── Extended test fixture with authenticated page ─── */

type Fixtures = {
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };
