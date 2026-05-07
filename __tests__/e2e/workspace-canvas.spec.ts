import { test, expect } from "@playwright/test";
import { signIn, waitForAppReady } from "./fixtures";

/**
 * Authenticated workspace flows. Skipped when E2E_USER_EMAIL +
 * E2E_USER_PASSWORD aren't set so CI / local-no-auth runs stay green.
 *
 * The covered routes are guarded by ProtectedRoute or behave differently
 * for signed-in users (dashboard sidebar, canvas page, account shell).
 */

const HAS_AUTH_ENV = !!(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);

test.describe("Authenticated workspace flows", () => {
  test.skip(!HAS_AUTH_ENV, "Requires E2E_USER_EMAIL + E2E_USER_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("dashboard renders the workspace shell after sign-in", async ({ page }) => {
    await page.goto("/app/workspace");
    await waitForAppReady(page);
    expect(page.url()).toContain("/app/workspace");
    // Sidebar layout differs between desktop and mobile, so just verify the
    // app shell rendered at all — not redirected to /auth, not blank.
    await expect(page.locator("body")).not.toBeEmpty();
    expect(page.url()).not.toContain("/auth");
  });

  test("settings page loads under AccountShell", async ({ page }) => {
    await page.goto("/app/settings");
    await waitForAppReady(page);
    expect(page.url()).toContain("/app/settings");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("usage page loads under AccountShell", async ({ page }) => {
    await page.goto("/app/usage");
    await waitForAppReady(page);
    expect(page.url()).toContain("/app/usage");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("pricing page renders for signed-in users", async ({ page }) => {
    await page.goto("/app/pricing");
    await waitForAppReady(page);
    expect(page.url()).toContain("/app/pricing");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("/app/workspace/:id sub-route loads canvas page (or bounces if unknown id)", async ({ page }) => {
    await page.goto("/app/workspace/non-existent-canvas-id");
    await waitForAppReady(page);
    // Either the canvas shell renders for the unknown id or the app
    // bounces back to the dashboard — both are acceptable; we just
    // need the page to NOT be auth-redirected away.
    expect(page.url()).toMatch(/\/app\/workspace/);
  });

  test("an unknown /app/* sub-route bounces to /app/workspace via AccountShell catch-all", async ({ page }) => {
    await page.goto("/app/some-unknown-account-route");
    // AccountShell's "*" route navigates to /app/workspace.
    await expect.poll(() => page.url(), { timeout: 15_000 }).toMatch(/\/app\/workspace/);
  });
});

test.describe("Org admin route — auth gate", () => {
  test.skip(!HAS_AUTH_ENV, "Requires E2E_USER_EMAIL + E2E_USER_PASSWORD");

  test("/app/org-admin loads or redirects (signed-in) without sending the user back to /auth", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/org-admin");
    await waitForAppReady(page);
    // Non-org users get bounced to /app/workspace by the org-admin guard;
    // org users see Teacher Center. Either way they should NOT be sitting
    // on /auth — that's the failure mode the protected-route check covers.
    expect(page.url()).not.toContain("/auth");
  });
});
