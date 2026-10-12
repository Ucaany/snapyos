import { test } from "playwright/test";

const BASE = "http://localhost:4321";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("vouchers timing x3", async ({ page }) => {
    test.setTimeout(120000);
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const resp = await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const tDom = Date.now() - t0;
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => ({
        rs: document.readyState,
        upgrade: /FITUR BUTUH UPGRADE/i.test(document.body.textContent || ""),
        textLen: (document.body.textContent || "").length,
      }));
      console.log(`run${i}: status=${resp?.status()} domMs=${tDom} readyState=${state.rs} upgrade=${state.upgrade} textLen=${state.textLen}`);
      const tl = await page.evaluate(() => performance.getEntriesByType("navigation")[0] as any);
      console.log(`   navTiming domContentLoaded=${Math.round((tl as any).domContentLoadedEventEnd)} load=${Math.round((tl as any).loadEventEnd)}`);
    }
  });
});
