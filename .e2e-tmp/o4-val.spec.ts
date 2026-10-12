import { test } from "playwright/test";
const BASE = "http://localhost:4321";
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

test.describe("O4 validation isolate", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  test("note too long", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/finance?from=2020-01-01&to=2026-12-31`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (!(await page.locator("form:has-text('/// Pengeluaran baru')").isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Buka form pengeluaran baru" }).click();
      await page.waitForTimeout(500);
    }
    const cf = page.locator("form:has-text('/// Pengeluaran baru')");
    await cf.locator("input[name=amount]").fill("50000");
    await cf.locator("input[name=note]").fill("x".repeat(250));
    await cf.getByRole("button", { name: /Simpan pengeluaran/i }).click();
    await page.waitForTimeout(2500);

    const alerts = await page.locator("[role=alert]").allInnerTexts();
    console.log("alert count:", alerts.length);
    alerts.forEach((a, i) => console.log(`  alert[${i}]: "${norm(a)}"`));
    // grab any text near the form
    const formText = norm(await cf.innerText());
    console.log("form text tail:", formText.slice(-300));
    await page.screenshot({ path: "/tmp/snapy-o4/validation.png", fullPage: true });
  });
});
