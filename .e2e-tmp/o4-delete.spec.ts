import { test } from "playwright/test";
const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o4";
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

test.describe("O4 delete isolate", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  test("isolate delete", async ({ page }) => {
    const reqs = [];
    page.on("request", (r) => { if (r.method() === "POST") reqs.push(`POST ${r.url()}`); });
    page.on("response", (r) => { if (r.request().method() === "POST") reqs.push(`  -> ${r.status()} ${r.request().url()}`); });

    await page.goto(`${BASE}/dashboard/finance?from=2020-01-01&to=2026-12-31`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (!(await page.locator("form:has-text('/// Pengeluaran baru')").isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Buka form pengeluaran baru" }).click();
      await page.waitForTimeout(500);
    }
    const cf = page.locator("form:has-text('/// Pengeluaran baru')");
    await cf.locator("select[name=category]").selectOption("ink");
    await cf.locator("input[name=amount]").fill("99000");
    await cf.locator("input[name=expense_date]").fill("2026-10-07");
    await cf.locator("input[name=note]").fill("DELETE-TEST-ROW");
    await cf.getByRole("button", { name: /Simpan pengeluaran/i }).click();
    await page.waitForTimeout(2500);
    console.log("seeded:", /DELETE-TEST-ROW/.test(await page.locator("body").innerText()));

    reqs.length = 0;
    const delBtn = page.getByRole("button", { name: /Hapus pengeluaran ink/i }).first();
    console.log("delBtn count:", await delBtn.count());
    await delBtn.click();
    await page.waitForTimeout(600);
    console.log("dialog visible:", await page.getByRole("dialog").isVisible().catch(() => false));
    await page.getByRole("button", { name: "Hapus permanen" }).click();
    await page.waitForTimeout(3500);

    console.log("POST during delete:");
    reqs.forEach((r) => console.log("  " + r));
    console.log("row present after delete:", /DELETE-TEST-ROW/.test(await page.locator("body").innerText()));
    console.log("dialog open after:", await page.getByRole("dialog").isVisible().catch(() => false));
    console.log("url:", page.url());
    await page.screenshot({ path: `${OUT}/delete-isolate.png`, fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    console.log("after reload row present:", /DELETE-TEST-ROW/.test(await page.locator("body").innerText()));
  });
});
