import { test } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("vouchers direct nav stuck state", async ({ page }) => {
    test.setTimeout(60000);
    const consoleErrs: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200));
    });

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // check sidebar link visibility diagnostics
    const diag = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('nav[aria-label="Navigasi utama"] a')).find((a) =>
        (a.textContent || "").includes("Voucher")
      ) as HTMLElement | undefined;
      if (!link) return { found: false };
      const r = link.getBoundingClientRect();
      const span = link.querySelector("span");
      return {
        found: true,
        rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
        spanHidden: span ? getComputedStyle(span).display : "n/a",
        linkDisplay: getComputedStyle(link).display,
      };
    });
    console.log("SIDEBAR DIAG:", JSON.stringify(diag));

    // direct nav
    await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      hasMain: !!document.querySelector("main"),
      upgrade: /FITUR BUTUH UPGRADE/i.test(document.body.textContent || ""),
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    }));
    console.log("VOUCHERS STATE:", JSON.stringify(state));
    console.log("consoleErrs:", JSON.stringify(consoleErrs.filter((e) => !e.includes("DevTools")).slice(0, 3)));
    await writeFile(`${OUT}/vouchers-nav.json`, JSON.stringify({ diag, state, consoleErrs }, null, 2));
  });
});
