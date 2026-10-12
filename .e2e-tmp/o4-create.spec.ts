import { test } from "playwright/test";
const BASE = "http://localhost:4321";
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

test.describe("O4 create flakiness", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  for (let run = 1; run <= 4; run++) {
    test(`create run ${run}`, async ({ page }) => {
      const consoleErrs = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0,200)); });
      await page.goto(`${BASE}/dashboard/finance?from=2020-01-01&to=2026-12-31`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1800);
      if (!(await page.locator("form:has-text('/// Pengeluaran baru')").isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Buka form pengeluaran baru" }).click();
        await page.waitForTimeout(700);
      }
      const cf = page.locator("form:has-text('/// Pengeluaran baru')");
      await cf.locator("select[name=category]").selectOption("paper");
      await cf.locator("input[name=amount]").fill("150000");
      await cf.locator("input[name=expense_date]").fill("2026-10-05");
      await cf.locator("select[name=outlet_id]").selectOption({ index: 1 });
      await cf.locator("input[name=note]").fill(`RUN-${run}-E2E`);
      await cf.getByRole("button", { name: /Simpan pengeluaran/i }).click();
      await page.waitForTimeout(3000);
      const body = norm(await page.locator("body").innerText());
      const ok = new RegExp(`RUN-${run}-E2E`).test(body);
      const errAlert = (await page.locator("form [role=alert]").allInnerTexts()).map(norm);
      console.log(`run ${run}: created=${ok} alerts=${JSON.stringify(errAlert)} consoleErrs=${consoleErrs.length}`);
      if (consoleErrs.length) console.log("  console:", consoleErrs[0]);
      // cleanup
      const del = page.getByRole("button", { name: /Hapus pengeluaran paper/i }).first();
      if (await del.count()) {
        await del.click(); await page.waitForTimeout(600);
        await page.getByRole("button", { name: "Hapus permanen" }).click();
        await page.waitForTimeout(2000);
      }
    });
  }
});
