import { test, expect } from "@playwright/test";
import { signIn, waitForAppReady } from "./fixtures";

/**
 * Workspace product route smoke. Every route under /app/* requires auth, so
 * the unauthenticated half is enough to verify the ProtectedRoute guard wires
 * up correctly. Authenticated coverage runs only when E2E_USER_EMAIL +
 * E2E_USER_PASSWORD are provided — locally we don't want to depend on a real
 * user existing in the workspace project.
 */

const HAS_AUTH_ENV = !!(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);

// Routes wrapped in <ProtectedRoute> in App.tsx — guests are bounced to /auth.
// /app/workspace itself is intentionally PUBLIC (dashboard browsing) so it's
// excluded from this list.
const PROTECTED_ROUTES = [
  "/app/settings",
  "/app/usage",
  "/app/pricing",
  "/app/team-register",
  "/app/org-admin",
  "/app/org-admin/branding",
];

test.describe("Public dashboard", () => {
  test("/app/workspace renders for guests (no redirect)", async ({ page }) => {
    await page.goto("/app/workspace");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(page.url()).toContain("/app/workspace");
    // Guest dashboard exposes a Sign In affordance instead of user chrome.
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  });
});

test.describe("Protected routes (unauthenticated)", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects to /auth when no session`, async ({ page }) => {
      await page.goto(route);
      // SPA redirect — poll the URL instead of waitForURL (no "load" event fires).
      await expect.poll(() => page.url(), { timeout: 20_000 }).toContain("/auth");
    });
  }
});

test.describe("Class enrollment landing", () => {
  test("/enroll-class/:code renders body content", async ({ page }) => {
    await page.goto("/enroll-class/SAMPLE-CODE");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Authenticated workspace dashboard", () => {
  test.skip(!HAS_AUTH_ENV, "Requires E2E_USER_EMAIL + E2E_USER_PASSWORD");

  test("dashboard loads after sign-in", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/workspace");
    await waitForAppReady(page);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(page.url()).toContain("/app/workspace");
  });
});
