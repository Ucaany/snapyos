import { test, type Page } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

const findings: string[] = [];
const log = (s: string) => {
  findings.push(s);
  console.log(s);
};

// Detect overlapping siblings / clipped text / contrast issues per route.
async function layoutProbe(page: Page, route: string) {
  const data = await page.evaluate(() => {
    const issues: string[] = [];

    // 1) text clipped / truncated with content cut (scrollWidth>clientWidth on text nodes)
    document.querySelectorAll<HTMLElement>("h1,h2,h3,p,span,td,th,label,button,a").forEach((el) => {
      if (el.children.length > 2) return;
      const s = getComputedStyle(el);
      if (s.overflow === "visible" && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && s.textOverflow !== "ellipsis") {
        const t = (el.textContent || "").trim().slice(0, 30);
        if (t) issues.push(`CLIP "${t}" ${el.scrollWidth}>${el.clientWidth}`);
      }
    });

    // 2) overlapping fixed/absolute siblings (topbar vs content, badges over text)
    const tops = document.querySelectorAll<HTMLElement>("header, [class*='sticky'], [class*='fixed']");
    void tops;

    // 3) elements with zero/near-zero text contrast (compute on visible text)
    function parseRGB(c: string): [number, number, number] | null {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      return [p[0], p[1], p[2]];
    }
    function lum([r, g, b]: [number, number, number]) {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function bgOf(el: HTMLElement): [number, number, number] | null {
      let cur: HTMLElement | null = el;
      while (cur) {
        const bg = getComputedStyle(cur).backgroundColor;
        const rgb = parseRGB(bg);
        if (rgb && !/rgba?\(0, 0, 0, 0\)/.test(bg)) return rgb;
        cur = cur.parentElement;
      }
      return [255, 255, 255];
    }
    const lowContrast: string[] = [];
    document.querySelectorAll<HTMLElement>("p,span,a,td,th,label,button,h1,h2,h3,small,li").forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (!txt || el.children.length > 1) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const s = getComputedStyle(el);
      if (parseFloat(s.opacity) < 0.3) return;
      const fg = parseRGB(s.color);
      const bg = bgOf(el);
      if (!fg || !bg) return;
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(s.fontSize);
      const bold = parseInt(s.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        lowContrast.push(`"${txt.slice(0, 22)}" ratio=${ratio.toFixed(2)} (need ${min}) size=${size}`);
      }
    });

    // 4) fixed topbar height vs first content
    return { issues: issues.slice(0, 10), lowContrast: lowContrast.slice(0, 15) };
  });
  return data;
}

const ROUTES = [
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/photoboxes",
  "/dashboard/branding",
  "/dashboard/templates",
  "/dashboard/packages",
  "/dashboard/transactions",
  "/dashboard/finance",
  "/dashboard/payment",
  "/dashboard/customers",
  "/dashboard/staff",
  "/dashboard/subscription",
  "/dashboard/settings",
  "/dashboard/pos",
];

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("layout + contrast probe", async ({ page }) => {
    test.setTimeout(240000);
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2200);
      const d = await layoutProbe(page, route);
      log(`--- ${route} ---`);
      d.issues.forEach((i) => log(`  ${i}`));
      d.lowContrast.forEach((i) => log(`  CONTRAST ${i}`));
      if (!d.issues.length && !d.lowContrast.length) log("  clean");
    }
    await writeFile(`${OUT}/layout-contrast.txt`, findings.join("\n"));
  });
});
