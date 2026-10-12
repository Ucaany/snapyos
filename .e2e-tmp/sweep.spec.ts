import { test, type Page } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

const OWNER_STATE = "/tmp/snapy-e2e/owner-state.json";
const ADMIN_STATE = "/tmp/snapy-e2e/admin-state.json";

const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};

type Err = { route: string; kind: "console" | "pageerror" | "requestfailed" | "http"; detail: string };
const errors: Err[] = [];

function attach(page: Page, route: string) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (/favicon|React DevTools|net::ERR_ABORTED|Fast Refresh|hydrat/i.test(t)) return;
      errors.push({ route, kind: "console", detail: t.slice(0, 500) });
    }
  });
  page.on("pageerror", (e) => errors.push({ route, kind: "pageerror", detail: (e.stack || e.message).slice(0, 800) }));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(f)) return;
    errors.push({ route, kind: "requestfailed", detail: `${r.method()} ${r.url()} :: ${f}` });
  });
}

const OWNER_ROUTES = [
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/metrics",
  "/dashboard/photoboxes",
  "/dashboard/branding",
  "/dashboard/outlets",
  "/dashboard/templates",
  "/dashboard/packages",
  "/dashboard/vouchers",
  "/dashboard/pos",
  "/dashboard/pwa",
  "/dashboard/transactions",
  "/dashboard/finance",
  "/dashboard/payment",
  "/dashboard/reports",
  "/dashboard/customers",
  "/dashboard/staff",
  "/dashboard/subscription",
  "/dashboard/settings",
  "/dashboard/support",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/businesses",
  "/admin/plans",
  "/admin/templates",
  "/admin/subscriptions",
  "/admin/payments",
  "/admin/gateways",
  "/admin/support",
  "/admin/broadcasts",
  "/admin/settings",
  "/admin/audit",
  "/admin/add-ons",
];

type RouteResult = {
  route: string;
  status: number | null;
  title: string;
  h1: string;
  bodyText: number;
  overflowX: boolean;
  scrollW: number;
  clientW: number;
  errorBoundary: boolean;
  ms: number;
};

async function visit(page: Page, route: string): Promise<RouteResult> {
  attach(page, route);
  const t0 = Date.now();
  let status: number | null = null;
  try {
    const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = resp?.status() ?? null;
  } catch (e) {
    errors.push({ route, kind: "http", detail: "goto: " + (e as Error).message.slice(0, 200) });
  }
  await page.waitForTimeout(2500);
  await page.waitForLoadState("load").catch(() => {});

  const title = await page.title().catch(() => "");
  const h1 = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim().slice(0, 120);
  const bodyText = ((await page.textContent("body").catch(() => "")) || "").length;

  const dims = await page
    .evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    .catch(() => ({ sw: 0, cw: 0 }));

  const boundary =
    (await page.locator("text=/Terjadi kesalahan|Something went wrong|Application error/i").count()) > 0;
  return {
    route,
    status,
    title,
    h1,
    bodyText,
    overflowX: dims.sw > dims.cw + 2,
    scrollW: dims.sw,
    clientW: dims.cw,
    errorBoundary: boundary,
    ms: Date.now() - t0,
  };
}

const allResults: RouteResult[] = [];

test.describe("OWNER dashboard", () => {
  test.use({ storageState: OWNER_STATE });
  for (const route of OWNER_ROUTES) {
    test(`owner ${route}`, async ({ page }) => {
      test.setTimeout(60000);
      const res = await visit(page, route);
      allResults.push(res);
      log(
        `OWNER ${route} status=${res.status} title="${res.title}" h1="${res.h1}" text=${res.bodyText} overflow=${res.overflowX}(${res.scrollW}/${res.clientW}) boundary=${res.errorBoundary} ms=${res.ms}`
      );
      await writeFile(`${OUT}/owner-results.json`, JSON.stringify(allResults.filter((r) => r.route.startsWith("/dashboard")), null, 2));
    });
  }
});

test.describe("ADMIN dashboard", () => {
  test.use({ storageState: ADMIN_STATE });
  for (const route of ADMIN_ROUTES) {
    test(`admin ${route}`, async ({ page }) => {
      test.setTimeout(60000);
      const res = await visit(page, route);
      allResults.push(res);
      log(
        `ADMIN ${route} status=${res.status} title="${res.title}" h1="${res.h1}" text=${res.bodyText} overflow=${res.overflowX}(${res.scrollW}/${res.clientW}) boundary=${res.errorBoundary} ms=${res.ms}`
      );
      await writeFile(`${OUT}/admin-results.json`, JSON.stringify(allResults.filter((r) => r.route.startsWith("/admin")), null, 2));
    });
  }
});

test.afterAll(async () => {
  log(`\n=== ERROR SUMARY (${errors.length}) ===`);
  for (const e of errors) log(`[${e.kind}] ${e.route} :: ${e.detail}`);
  await writeFile(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
  await writeFile(`${OUT}/full-log.txt`, report.join("\n"));
});
