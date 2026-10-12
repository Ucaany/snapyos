import { test, type Page } from "playwright/test";
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o1";

type Row = { vp: string; issue: string; detail: string };
const rows: Row[] = [];

async function audit(page: Page, vp: string) {
  const data = await page.evaluate(() => {
    const issues: { issue: string; detail: string }[] = [];
    const de = document.documentElement;

    // 1. horizontal overflow
    if (de.scrollWidth > de.clientWidth + 2)
      issues.push({ issue: "h-overflow", detail: `${de.scrollWidth}>${de.clientWidth}` });

    // 2. text clipping: elements whose scrollWidth exceeds clientWidth with overflow hidden/clip
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      const cs = getComputedStyle(el);
      const clipped =
        (cs.overflow === "hidden" || cs.overflowX === "hidden") && el.scrollWidth > el.clientWidth + 2;
      if (clipped && el.textContent && el.textContent.trim().length > 0) {
        const t = el.textContent.trim().slice(0, 30);
        issues.push({ issue: "text-clip", detail: `${el.tagName}.${(el.className||"").toString().slice(0,20)} "${t}" sw=${el.scrollWidth} cw=${el.clientWidth}` });
      }
    });

    // 3. tap target size on interactive
    document.querySelectorAll<HTMLElement>("main a, main button, main [role=button]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 44) issues.push({ issue: "small-tap", detail: `${el.tagName} "${(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,20)}" ${Math.round(r.width)}x${Math.round(r.height)}` });
    });

    // 4. overlapping sibling blocks (main)
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("main > div > *, main section, main dl, main [data-slot=metric-card]")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        const ox = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const oy = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        if (ox > 6 && oy > 6) {
          issues.push({ issue: "block-overlap", detail: `${a.tagName}∩${b.tagName} ${Math.round(ox)}x${Math.round(oy)}` });
        }
      }
    }

    // 5. metric card equal heights within hero row?
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-slot=metric-card]")).map((c) => Math.round(c.getBoundingClientRect().height));
    return { issues, cardHeights: cards };
  });

  data.issues.slice(0, 40).forEach((i) => rows.push({ vp, issue: i.issue, detail: i.detail }));
  console.log(`[${vp}] issues=${data.issues.length} cardHeights=${data.cardHeights.join(",")}`);
  data.issues.slice(0, 20).forEach((i) => console.log(`   ${i.issue}: ${i.detail}`));
}

test.describe("O1 layout audit", () => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });

  test("audit at 3 viewports", async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    for (const vp of [
      { w: 390, h: 844, name: "mobile" },
      { w: 768, h: 1024, name: "tablet" },
      { w: 1440, h: 900, name: "desktop" },
    ]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await audit(page, vp.name);
    }
    await writeFile(`${OUT}/layout-audit.json`, JSON.stringify(rows, null, 2));
  });
});
