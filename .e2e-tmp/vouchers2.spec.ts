import { test } from "playwright/test";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("vouchers stable state probe", async ({ page }) => {
    test.setTimeout(60000);
    const con: string[] = [];
    page.on("console", (m) => con.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
    page.on("pageerror", (e) => con.push(`[pageerror] ${(e.stack || e.message).slice(0, 400)}`));

    await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);

    // Is loading.tsx skeleton still visible?
    const skeletonCount = await page.locator('[class*="animate-pulse"], [data-slot="skeleton"]').count();
    const upgradeVisible = await page.locator("text=/FITUR BUTUH UPGRADE/i").isVisible().catch(() => false);
    const h1 = await page.locator("h1").first().textContent().catch(() => "none");
    const mainText = ((await page.locator("main").first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 300);

    console.log("skeletonCount", skeletonCount);
    console.log("upgradeVisible", upgradeVisible);
    console.log("h1", h1);
    console.log("mainText", mainText);
    console.log("CONSOLE ERRORS:", con.filter((c) => c.includes("error") || c.includes("Error")).join("\n").slice(0, 1200));

    await page.screenshot({ path: `${OUT}/vouchers-fixed.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }).catch((e) => console.log("shot fail", e.message));
  });
});
