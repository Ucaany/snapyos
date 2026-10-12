import { test } from "playwright/test";

const BASE = "http://localhost:4321";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("POS tab switch content verify", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    for (const t of ["PRODUK", "KASIR", "OUTLET", "BOOTH", "HARI"]) {
      const tab = page.getByRole("tab", { name: t });
      const exists = (await tab.count()) > 0;
      if (!exists) {
        console.log(`TAB ${t}: NOT FOUND`);
        continue;
      }
      const before = page.url();
      await tab.click();
      await page.waitForTimeout(1200);
      const after = page.url();
      const sel = await tab.getAttribute("aria-selected");
      const caption = (await page.locator("table caption").first().textContent().catch(() => "")) || "";
      console.log(`TAB ${t}: urlChanged=${before !== after} aria-selected=${sel} caption="${caption.trim()}"`);
    }
  });
});
