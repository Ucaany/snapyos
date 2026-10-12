import { test, type Page } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";
const findings: string[] = [];
const log = (s: string) => {
  findings.push(s);
  console.log(s);
};

async function errs(page: Page): Promise<string[]> {
  const e: string[] = [];
  const h1 = (m: any) => {
    if (m.type() === "error" && !/favicon|DevTools|ERR_ABORTED|Fast Refresh/i.test(m.text()))
      e.push(m.text().slice(0, 250));
  };
  page.on("console", h1);
  return e;
}

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });

  test("POS tabs interactive", async ({ page }) => {
    test.setTimeout(90000);
    const e: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|DevTools|ERR_ABORTED/i.test(m.text())) e.push(m.text().slice(0, 200));
    });
    await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const tabs = ["PRODUK", "KASIR", "OUTLET", "BOOTH", "HARI"];
    for (const t of tabs) {
      const btn = page.locator(`button:has-text("${t}")`).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(900);
        const active = await btn.evaluate((el) => el.className.includes("accent") || el.getAttribute("aria-selected") === "true");
        log(`POS tab "${t}" clicked active-style=${active}`);
      } else {
        log(`POS tab "${t}" NOT FOUND`);
      }
    }
    log(`POS errors: ${e.length} ${e.join(" | ")}`);
  });

  test("sweep all visible buttons for dead controls", async ({ page }) => {
    test.setTimeout(180000);
    const routes = ["/dashboard", "/dashboard/photoboxes", "/dashboard/branding", "/dashboard/packages", "/dashboard/outlets", "/dashboard/templates", "/dashboard/customers", "/dashboard/staff", "/dashboard/payment", "/dashboard/subscription", "/dashboard/settings", "/dashboard/support"];
    for (const route of routes) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2000);
      const btns = await page.locator("button:visible").all();
      let noHandler = 0;
      const samples: string[] = [];
      for (const b of btns) {
        const info = await b.evaluate((el) => {
          const html = el.outerHTML;
          const hasOn = html.includes("onclick") || html.includes("onClick") || html.includes("type=\"submit\"") || html.includes('type="submit"') || html.includes("type=\"button\"");
          // React attaches via fiber; check listener presence indirectly
          const txt = (el.textContent || "").trim().slice(0, 25);
          const type = el.getAttribute("type");
          const disabled = (el as HTMLButtonElement).disabled;
          return { txt, type, disabled, hasOn, aria: el.getAttribute("aria-label") };
        });
        // A button is "suspect" if it's not disabled, has no type and no aria and short text
        if (!info.disabled && !info.type && !info.hasOn) {
          noHandler++;
          if (samples.length < 4) samples.push(`${info.txt || info.aria}`);
        }
      }
      log(`--- ${route}: ${btns.length} buttons, ${noHandler} without explicit type/onclick (React may attach). samples=${JSON.stringify(samples)}`);
    }
  });
});
