import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";

// Pages that don't require auth
const PUBLIC_ROUTES = [
  ["/", "Landing"],
  ["/auth", "Auth"],
  ["/reset-password", "ResetPassword"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/not-a-real-page", "NotFound"],
];

// Dashboard routes (open to guests per App.tsx)
const DASHBOARD_ROUTES = [
  ["/app/home", "Dashboard_Home"],
  ["/app/community", "Dashboard_Community"],
  ["/app/stock", "Dashboard_StockLibrary"],
  ["/app/assets", "Dashboard_AssetManager"],
  ["/app/flow-studio", "Dashboard_FlowStudioDashboard"],
  ["/app/pricing", "Dashboard_Pricing"],
  ["/app/settings", "Dashboard_Settings"],
  ["/app/transactions", "Dashboard_Transactions"],
  ["/app/analytics", "Dashboard_Analytics"],
];

// Protected routes (need sign-in)
const PROTECTED_ROUTES = [
  ["/app/history", "Dashboard_History"],
  ["/creator", "Creator_Home"],
  ["/creator/studio", "Creator_Studio"],
  ["/creator/published", "Creator_PublishedFlows"],
  ["/creator/flows", "Creator_FlowStatus"],
  ["/creator/analytics", "Creator_Analytics"],
];

// Admin routes (need admin sign-in)
const ADMIN_ROUTES = [
  ["/admin/login", "Admin_Login"],
  // These need admin auth - will try after admin login
  ["/admin", "Admin_Dashboard"],
  ["/admin/review-queue", "Admin_ReviewQueue"],
  ["/admin/flow-active", "Admin_FlowActive"],
];

const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || "e2e-test@mediaforge.dev",
  password: process.env.E2E_USER_PASSWORD || "Test1234!",
};

const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@mediaforge.dev",
  password: process.env.E2E_ADMIN_PASSWORD || "Admin1234!",
};

async function waitForPage(page: any) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000); // Extra time for animations/lazy loads
  // Dismiss cookie consent if visible
  const cookie = page.locator("text=Accept").first();
  if (await cookie.isVisible().catch(() => false)) {
    await cookie.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function screenshot(page: any, route: string, name: string) {
  console.log(`📸 ${name} → ${route}`);
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await waitForPage(page);
  await page.screenshot({
    path: `screenshots/${name}.png`,
    fullPage: true,
  });
  console.log(`   ✅ saved screenshots/${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. Public + Dashboard (no auth needed)
  console.log("\n=== Public & Guest Pages ===");
  const ctx1 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page1 = await ctx1.newPage();

  for (const [route, name] of [...PUBLIC_ROUTES, ...DASHBOARD_ROUTES]) {
    await screenshot(page1, route, name);
  }
  await ctx1.close();

  // 2. Protected routes (user auth)
  console.log("\n=== Protected Pages (User Auth) ===");
  const ctx2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page2 = await ctx2.newPage();

  try {
    await page2.goto(`${BASE}/auth`, { waitUntil: "networkidle", timeout: 15000 });
    await page2.waitForTimeout(1000);
    await page2.getByLabel("Email").first().fill(TEST_USER.email);
    await page2.getByLabel("Password").first().fill(TEST_USER.password);
    await page2.getByRole("button", { name: /sign in/i }).click();
    await page2.waitForURL("**/app/home", { timeout: 15000 });
    console.log("   ✅ User signed in");
    await page2.waitForTimeout(2000);

    for (const [route, name] of PROTECTED_ROUTES) {
      await screenshot(page2, route, name);
    }
  } catch (e) {
    console.log(`   ⚠️ User auth failed: ${e.message}`);
    console.log("   Skipping protected routes...");
  }
  await ctx2.close();

  // 3. Admin routes
  console.log("\n=== Admin Pages ===");
  const ctx3 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page3 = await ctx3.newPage();

  // Screenshot admin login first (no auth needed)
  await screenshot(page3, "/admin/login", "Admin_Login");

  try {
    await page3.goto(`${BASE}/admin/login`, { waitUntil: "networkidle", timeout: 15000 });
    await page3.waitForTimeout(1000);
    await page3.getByLabel("Email").fill(ADMIN_USER.email);
    await page3.getByLabel("Password").fill(ADMIN_USER.password);
    await page3.getByRole("button", { name: /เข้าสู่ระบบ|sign in|login/i }).click();
    await page3.waitForURL("**/admin", { timeout: 15000 });
    console.log("   ✅ Admin signed in");
    await page3.waitForTimeout(2000);

    for (const [route, name] of ADMIN_ROUTES.slice(1)) {
      await screenshot(page3, route, name);
    }
  } catch (e) {
    console.log(`   ⚠️ Admin auth failed: ${e.message}`);
    console.log("   Skipping admin routes...");
  }
  await ctx3.close();

  await browser.close();
  console.log("\n🎉 Done! Screenshots saved to ./screenshots/");
}

main().catch(console.error);
