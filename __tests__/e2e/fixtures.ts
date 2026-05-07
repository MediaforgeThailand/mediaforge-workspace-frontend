import { test as base, expect, Page } from "@playwright/test";

/* ─── Shared helpers ─── */

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || "e2e-test@mediaforge.dev",
  password: process.env.E2E_USER_PASSWORD || "Test1234!",
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
  // After sign-in the workspace product lands on /app/workspace.
  await page.waitForURL("**/app/workspace**", { timeout: 15_000 });
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
