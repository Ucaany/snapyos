import { test } from "playwright/test";

const BASE = "http://localhost:4321";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("reports export submit on unentitled plan", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // The form is method=get action=/api/v1/business/:id/reports — submit it
    const [resp] = await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
      page.locator('button:has-text("Unduh Report")').click(),
    ]);
    await page.waitForTimeout(2500);
    console.log("URL after submit:", page.url());
    console.log("status:", resp?.status());
    const body = ((await page.textContent("body")) || "").replace(/\s+/g, " ").slice(0, 400);
    console.log("BODY:", body);
  });
});
