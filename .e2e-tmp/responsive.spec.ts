import { test, type Page } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

type Row = {
  route: string;
  vw: number;
  overflowX: boolean;
  scrollW: number;
  clientW: number;
  overflowing: string[];
  smallTaps: string[];
  sidebarVsMain: string | null;
};

const rows: Row[] = [];
const errs: string[] = [];

function attach(page: Page, route: string) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools|ERR_ABORTED|Fast Refresh/i.test(m.text()))
      errs.push(`[${route}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errs.push(`[${route}] pageerror ${(e.message || "").slice(0, 300)}`));
}

async function audit(page: Page, route: string, vw: number, vh: number): Promise<Row> {
  attach(page, `${route}@${vw}`);
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);

  const data = await page
    .evaluate(() => {
      const de = document.documentElement;
      const sw = de.scrollWidth;
      const cw = de.clientWidth;
      const overflowing: string[] = [];
      const smallTaps: string[] = [];
      // elements wider than viewport
      document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right > cw + 4 || r.left < -4) {
          const tag = el.tagName.toLowerCase();
          const cls = (el.className || "").toString().slice(0, 40);
          const txt = (el.textContent || "").trim().slice(0, 30);
          overflowing.push(`${tag}.${cls} :: "${txt}" [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
      });
      // tap targets on interactive elements
      document
        .querySelectorAll<HTMLElement>("a,button,[role=button],input,select,[role=tab]")
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.height < 44 || r.width < 24) {
            const txt = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 25);
            smallTaps.push(`${el.tagName.toLowerCase()} "${txt}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        });

      // sidebar vs main overlap (md+ desktop)
      let sidebarVsMain: string | null = null;
      const nav = document.querySelector("nav[aria-label='Navigasi utama']");
      const main = document.querySelector("main");
      if (nav && main) {
        const nr = nav.getBoundingClientRect();
        const mr = main.getBoundingClientRect();
        const overlapX = Math.min(nr.right, mr.right) - Math.max(nr.left, mr.left);
        const overlapY = Math.min(nr.bottom, mr.bottom) - Math.max(nr.top, mr.top);
        if (overlapX > 2 && overlapY > 2) {
          sidebarVsMain = `nav&main overlap ${Math.round(overlapX)}x${Math.round(overlapY)}`;
        }
      }
      return {
        sw,
        cw,
        overflowing: overflowing.slice(0, 12),
        smallTaps: smallTaps.slice(0, 15),
        sidebarVsMain,
      };
    })
    .catch(() => ({ sw: 0, cw: 0, overflowing: [], smallTaps: [], sidebarVsMain: null }));

  return {
    route,
    vw,
    overflowX: data.sw > data.cw + 2,
    scrollW: data.sw,
    clientW: data.cw,
    overflowing: data.overflowing,
    smallTaps: data.smallTaps,
    sidebarVsMain: data.sidebarVsMain,
  };
}

const ROUTES = [
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/metrics",
  "/dashboard/photoboxes",
  "/dashboard/branding",
  "/dashboard/outlets",
  "/dashboard/templates",
  "/dashboard/packages",
  "/dashboard/transactions",
  "/dashboard/finance",
  "/dashboard/payment",
  "/dashboard/reports",
  "/dashboard/customers",
  "/dashboard/staff",
  "/dashboard/subscription",
  "/dashboard/settings",
  "/dashboard/support",
  "/dashboard/pos",
  "/dashboard/pwa",
];

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("owner responsive + overlap audit", async ({ page }) => {
    test.setTimeout(300000);
    const sizes = [
      { w: 390, h: 844 },
      { w: 768, h: 1024 },
      { w: 1440, h: 900 },
    ];
    for (const route of ROUTES) {
      for (const s of sizes) {
        const r = await audit(page, route, s.w, s.h);
        rows.push(r);
        console.log(
          `${route}@${s.w} overflow=${r.overflowX}(${r.scrollW}/${r.clientW}) overflowEls=${r.overflowing.length} smallTaps=${r.smallTaps.length} navOverlap=${r.sidebarVsMain ?? "no"}`
        );
        if (r.overflowing.length) r.overflowing.forEach((o) => console.log(`    OVERFLOW ${route}@${s.w}: ${o}`));
      }
      await page.screenshot({ path: `${OUT}/resp/${route.replace(/\//g, "_")}-mobile.png`, fullPage: false }).catch(() => {});
    }
    await writeFile(`${OUT}/responsive-results.json`, JSON.stringify(rows, null, 2));
    await writeFile(`${OUT}/interaction-errors.txt`, errs.join("\n"));
    console.log(`\n=== ERRORS (${errs.length}) ===`);
    errs.slice(0, 40).forEach((e) => console.log(e));
  });
});
