import { test, type Page } from "playwright/test";
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o1";
const OWNER_STATE = "/tmp/snapy-e2e/owner-state.json";

type Issue = { severity: "BLOCKER" | "MAJOR" | "MINOR" | "INFO"; area: string; detail: string };
const issues: Issue[] = [];
const log: string[] = [];
const p = (s: string) => {
  log.push(s);
  console.log(s);
};
const addIssue = (severity: Issue["severity"], area: string, detail: string) => {
  issues.push({ severity, area, detail });
  p(`  ${severity} [${area}] ${detail}`);
};

function attach(page: Page, route: string, errs: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (/favicon|React DevTools|net::ERR_ABORTED|Fast Refresh|hydrat/i.test(t)) return;
      errs.push(`console ${route} :: ${t.slice(0, 400)}`);
    }
  });
  page.on("pageerror", (e) => errs.push(`pageerror ${route} :: ${(e.stack || e.message).slice(0, 800)}`));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(f)) return;
    errs.push(`requestfailed ${route} :: ${r.method()} ${r.url()} :: ${f}`);
  });
}

// Detects visual overlap between sibling blocks / overlapping text using bounding boxes.
async function detectOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main h1, main h2, main h3, main p, main [data-slot=metric-card], main dl, main section, main .border-2"
      )
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ox = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const oy = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        // Only flag meaningful visual overlap (not 1-2px border adjacency)
        if (ox > 8 && oy > 8) {
          const at = (a.textContent || "").trim().slice(0, 30);
          const bt = (b.textContent || "").trim().slice(0, 30);
          out.push(
            `"${a.tagName}.${(a.className || "").toString().slice(0, 25)}"(${at}) ∩ "${b.tagName}.${(b.className || "").toString().slice(0, 25)}"(${bt}) = ${Math.round(ox)}x${Math.round(oy)}`
          );
        }
      }
    }
    return out.slice(0, 20);
  });
}

async function setViewport(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
}

test.describe("O1 Dashboard Overview", () => {
  test.use({ storageState: OWNER_STATE });

  test("O1 full E2E: render, data, interactions, states, responsive, a11y", async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    const errs: string[] = [];
    attach(page, "O1", errs);

    // ---------- 1. Initial load ----------
    p("\n== [1] Initial load /dashboard ==");
    const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 45000 });
    p(`  HTTP status: ${resp?.status()}`);
    if (resp?.status() !== 200) addIssue("BLOCKER", "http", `GET /dashboard -> ${resp?.status()}`);

    await page.waitForTimeout(1500);

    // ---------- 2. Header contract (eyebrow + title = business name) ----------
    p("\n== [2] PageHeader contract ==");
    const eyebrow = (await page.locator("main p.font-mono").first().textContent().catch(() => ""))?.trim() ?? "";
    const h1 = (await page.locator("main h1").first().textContent().catch(() => ""))?.trim() ?? "";
    p(`  eyebrow: "${eyebrow}"`);
    p(`  h1 (business name): "${h1}"`);
    if (!/^\/\/\/\s*DASHBOARD:\s*(OWNER|MANAGER|STAFF)/i.test(eyebrow))
      addIssue("MAJOR", "header", `eyebrow tidak sesuai pola "DASHBOARD: <ROLE>" -> "${eyebrow}"`);
    if (h1.length < 2) addIssue("MAJOR", "header", "judul (nama bisnis) kosong");

    // meta line
    const meta = (await page.locator("main header div.font-mono").first().textContent().catch(() => ""))?.trim() ?? "";
    p(`  meta: "${meta.slice(0, 140)}"`);

    // ---------- 3. Data sections present ----------
    p("\n== [3] Data sections ==");
    const heroCard = await page.locator("[data-slot=metric-card]").count();
    p(`  MetricCard count: ${heroCard}`);
    if (heroCard < 3) addIssue("MAJOR", "data", `MetricCard kurang dari 3 (hero+gross+discount) -> ${heroCard}`);

    const heroLabel = (await page.locator("[data-slot=metric-card]").first().textContent().catch(() => ""))?.trim() ?? "";
    p(`  hero card text: "${heroLabel.slice(0, 80)}"`);

    const summaryCells = await page.locator("dl[aria-label='Ringkasan metrik'] dd").count();
    p(`  summary dl cells: ${summaryCells}`);
    if (summaryCells !== 8) addIssue("MAJOR", "data", `Ringkasan metrik harus 8 sel -> ${summaryCells}`);

    const txPanel = await page.locator("#tx-insights").count();
    p(`  TxInsightsPanel (#tx-insights): ${txPanel}`);
    if (txPanel === 0) addIssue("MAJOR", "data", "TxInsightsPanel tidak dirender");

    const chartTitle = await page.getByText("Pendapatan Harian", { exact: true }).count();
    const emptyChart = await page.getByText("Belum ada pendapatan", { exact: true }).count();
    p(`  "Pendapatan Harian" title: ${chartTitle}, empty-state chart: ${emptyChart}`);
    if (chartTitle === 0 && emptyChart === 0)
      addIssue("MAJOR", "data", "Kartu Pendapatan Harian: tidak ada chart maupun empty-state");

    // ---------- 4. Empty state CTA works (if shown) ----------
    p("\n== [4] Empty-state CTA ==");
    if (emptyChart > 0) {
      const cta = page.getByRole("link", { name: /Ke Halaman Photobox/i }).first();
      if (await cta.count()) {
        const href = await cta.getAttribute("href");
        p(`  CTA href: ${href}`);
        if (href !== "/dashboard/photoboxes") addIssue("MINOR", "empty-state", `CTA href salah -> ${href}`);
      } else addIssue("MAJOR", "empty-state", "empty-state chart tanpa CTA");
    } else {
      p("  chart has data (no empty state)");
    }

    // ---------- 5. DateRangeFilter: presets ----------
    p("\n== [5] DateRangeFilter presets ==");
    for (const preset of ["7 HARI", "30 HARI", "90 HARI"]) {
      const btn = page.getByRole("button", { name: new RegExp(`^${preset}$`, "i") }).first();
      if (!(await btn.count())) {
        addIssue("MAJOR", "filter", `preset tombol "${preset}" tidak ada`);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(1400);
      const url = page.url();
      const hasFromTo = /[?&]from=\d{4}-\d{2}-\d{2}/.test(url) && /[?&]to=\d{4}-\d{2}-\d{2}/.test(url);
      p(`  preset ${preset} -> ${url.replace(BASE, "")} (from&to=${hasFromTo})`);
      if (!hasFromTo) addIssue("MAJOR", "filter", `preset ${preset} tidak menulis ?from=&to= ke URL`);
      // active state check
      const cls = (await btn.getAttribute("class")) ?? "";
      const isActive = /bg-accent|bg-primary/.test(cls);
      if (!isActive) addIssue("MINOR", "filter", `preset ${preset} tidak menampilkan state aktif (class="${cls.slice(0, 60)}")`);
    }

    // ---------- 6. DateRangeFilter: calendar popover ----------
    p("\n== [6] DateRangeFilter calendar popover ==");
    const trigger = page.getByRole("button", { name: /Pilih rentang tanggal/i }).first();
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(700);
      const days = await page.locator("[role=gridcell] button, [role=gridcell]").count();
      p(`  popover gridcells: ${days}`);
      if (days < 20) addIssue("MAJOR", "filter", `kalender tidak muncul / gridcell terlalu sedikit -> ${days}`);
      // keyboard close via Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const stillOpen = await page.locator("[role=dialog]").isVisible().catch(() => false);
      p(`  popover after Escape visible: ${stillOpen}`);
      if (stillOpen) addIssue("MAJOR", "filter", "popover tidak menutup dengan tombol Escape");
    } else {
      addIssue("MAJOR", "filter", "trigger DateRangeFilter tidak ditemukan");
    }

    // ---------- 7. Invalid range handling (?from>to) ----------
    p("\n== [7] Invalid range guard ==");
    await page.goto(`${BASE}/dashboard?from=2026-10-10&to=2026-10-01`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);
    const badBody = (await page.textContent("body").catch(() => "")) ?? "";
    const showsError =
      /Terjadi kesalahan|Application error|error boundary|Internal Server Error/i.test(badBody);
    p(`  from>to shows error boundary: ${showsError}`);
    if (showsError) addIssue("MAJOR", "validation", "?from>to memicu error boundary (harusnya validasi terkendali)");

    // ---------- 8. Overlap / layout audit (3 viewports) ----------
    p("\n== [8] Overlap & overflow audit ==");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    for (const vp of [
      { w: 390, h: 844, name: "mobile" },
      { w: 768, h: 1024, name: "tablet" },
      { w: 1440, h: 900, name: "desktop" },
    ]) {
      await setViewport(page, vp.w, vp.h);
      await page.waitForTimeout(700);
      const dims = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      const overflow = dims.sw > dims.cw + 2;
      const overlaps = await detectOverlaps(page);
      p(`  ${vp.name}@${vp.w}: overflow=${overflow} (${dims.sw}/${dims.cw}) overlaps=${overlaps.length}`);
      if (overflow) addIssue("MAJOR", `responsive:${vp.name}`, `horizontal overflow ${dims.sw}>${dims.cw}`);
      overlaps.slice(0, 5).forEach((o) => p(`     OVERLAP: ${o}`));
      if (overlaps.length) addIssue("MAJOR", `overlap:${vp.name}`, `${overlaps.length} overlap terdeteksi: ${overlaps[0]}`);
      await page.screenshot({ path: `${OUT}/dashboard-${vp.name}.png`, fullPage: true }).catch(() => {});
    }
    await setViewport(page, 1440, 900);

    // ---------- 9. Loading state (skeleton) ----------
    p("\n== [9] Loading state ==");
    const navPromise = page.goto(`${BASE}/dashboard?from=2026-10-01&to=2026-10-12`, { waitUntil: "commit" });
    await navPromise.catch(() => {});
    const hasLoading = await page
      .locator("[data-slot=skeleton], .animate-pulse, [aria-busy=true]")
      .first()
      .count()
      .catch(() => 0);
    p(`  loading indicator present at commit: ${hasLoading}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // ---------- 10. Accessibility quick pass ----------
    p("\n== [10] A11y quick pass ==");
    const a11y = await page.evaluate(() => {
      const imgsNoAlt = Array.from(document.querySelectorAll("img")).filter((i) => !i.hasAttribute("alt")).length;
      const buttonsNoName = Array.from(document.querySelectorAll("button")).filter(
        (b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label")
      ).length;
      // heading order
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4")).map((h) => Number(h.tagName[1]));
      return { imgsNoAlt, buttonsNoName, headings };
    });
    p(`  img without alt: ${a11y.imgsNoAlt}, buttons without name: ${a11y.buttonsNoName}`);
    p(`  heading sequence: ${a11y.headings.join(",")}`);
    if (a11y.imgsNoAlt) addIssue("MINOR", "a11y", `${a11y.imgsNoAlt} gambar tanpa alt`);
    if (a11y.buttonsNoName) addIssue("MINOR", "a11y", `${a11y.buttonsNoName} tombol tanpa nama aksesibel`);

    // ---------- 11. Console / network errors ----------
    p("\n== [11] Console/network errors ==");
    if (errs.length === 0) p("  no console/page/network errors");
    else {
      errs.forEach((e) => p(`  ${e}`));
      errs.forEach((e) => addIssue("MAJOR", "console", e.slice(0, 200)));
    }

    // ---------- 12. Role-based access: staff (no financial) ----------
    p("\n== [12] Role-based access (non-financial) ==");
    // staff has no transaction:read -> should show limited access card. We only have owner/admin states,
    // so verify RBAC helper truth from source + assert owner can see financial.
    const canSeeRevenue = (await page.getByText("Pendapatan Bersih: Periode", { exact: false }).count()) > 0;
    p(`  owner sees revenue card: ${canSeeRevenue}`);
    if (!canSeeRevenue) addIssue("MAJOR", "rbac", "owner tidak melihat kartu Pendapatan Bersih");

    // ---------- Persist ----------
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/issues.json`, JSON.stringify(issues, null, 2));
    await writeFile(`${OUT}/log.txt`, log.join("\n"));

    p(`\n== SUMMARY: ${issues.length} issues ==`);
    const blockers = issues.filter((i) => i.severity === "BLOCKER").length;
    const majors = issues.filter((i) => i.severity === "MAJOR").length;
    p(`  BLOCKER=${blockers} MAJOR=${majors} MINOR=${issues.filter((i) => i.severity === "MINOR").length}`);

    test.info().annotations.push({ type: "issues", description: JSON.stringify(issues) });
  });
});
