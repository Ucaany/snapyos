import { test } from "playwright/test";
const BASE = "http://localhost:4321";
test.describe("O4 popover geometry", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  test("popover + mobile", async ({ page }) => {
    for (const vp of [[1440,900,"desktop"],[390,844,"mobile"]]) {
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      await page.goto(`${BASE}/dashboard/finance`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      // metric grid geometry
      const g = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("section[aria-label='Ringkasan finance'] [data-slot=metric-card]")).map(el => { const b = el.getBoundingClientRect(); return `x=${Math.round(b.x)},y=${Math.round(b.y)},w=${Math.round(b.width)}`; });
        const vw = document.documentElement.clientWidth;
        const over = [];
        document.querySelectorAll("main *").forEach(el => { const b = el.getBoundingClientRect(); if (b.right > vw + 1) over.push(`${el.tagName} right=${Math.round(b.right)}`); });
        return { cards, over: over.slice(0,5), vw };
      });
      console.log(`[${vp[2]} ${vp[0]}] cards:`, JSON.stringify(g.cards), "overflow:", JSON.stringify(g.over));
      // open popover
      await page.getByRole("button", { name: "Pilih rentang tanggal" }).click();
      await page.waitForTimeout(800);
      const pop = await page.evaluate(() => {
        const el = document.querySelector("[data-radix-popper-content-wrapper], [data-base-ui-portal] , [role=dialog], .react-day-picker");
        const cal = document.querySelector(".rdp-root, [data-slot=calendar]") || document.querySelector(".react-day-picker");
        const vw = document.documentElement.clientWidth;
        const b = cal?.getBoundingClientRect();
        return { hasCal: !!cal, w: b?Math.round(b.width):0, left: b?Math.round(b.left):0, right: b?Math.round(b.right):0, vw, offscreen: b ? (b.left < 0 || b.right > vw + 1) : "no-cal" };
      });
      console.log(`  popover:`, JSON.stringify(pop));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  });
});
