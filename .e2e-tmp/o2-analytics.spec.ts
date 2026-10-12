import { test, type Page, type BrowserContext } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o2";
const OWNER_STATE = "/tmp/audit/state/owner.json";
const STAFF_STATE = "/tmp/audit/state/staff.json";

type Issue = { severity: "BLOCKER" | "MAJOR" | "MINOR" | "INFO"; area: string; detail: string };
const issues: Issue[] = [];
const log: string[] = [];
const p = (s: string) => {
  log.push(s);
  console.log(s);
};
const addIssue = (severity: Issue["severity"], area: string, detail: string) => {
  issues.push({ severity, area, detail });
  p(`  !! ${severity} [${area}] ${detail}`);
};

function attach(page: Page, route: string, errs: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (/favicon|React DevTools|net::ERR_ABORTED|Fast Refresh|hydrat/i.test(t)) return;
      errs.push(`console ${route} :: ${t.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (e) => errs.push(`pageerror ${route} :: ${(e.stack || e.message).slice(0, 900)}`));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(f)) return;
    errs.push(`requestfailed ${route} :: ${r.method()} ${r.url()} :: ${f}`);
  });
}

async function gotoRetry(page: Page, url: string, tries = 3) {
  let last: Error | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      last = e as Error;
      await page.waitForTimeout(1200);
    }
  }
  throw last;
}

async function detectOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main h1, main h2, main h3, main p, main nav, main [data-slot=card], main table, main section, main [data-slot=chart], main header"
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
        if (ox > 8 && oy > 8) {
          const at = (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34);
          const bt = (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34);
          out.push(
            `"${a.tagName}.${(a.className || "").toString().slice(0, 22)}"(${at}) ∩ "${b.tagName}.${(b.className || "").toString().slice(0, 22)}"(${bt}) = ${Math.round(ox)}x${Math.round(oy)}`
          );
        }
      }
    }
    return out.slice(0, 24);
  });
}

async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
}

test.describe("O2 Analytics — revenue breakdown", () => {
  test.use({ storageState: OWNER_STATE });

  test("O2 full E2E: render, tabs, charts, data accuracy, interactions, states, responsive, a11y", async ({
    page,
  }, testInfo) => {
    await mkdir(OUT, { recursive: true });
    const errs: string[] = [];
    attach(page, "O2", errs);
    test.setTimeout(180000);

    // ============ [1] Initial load ============
    p("\n== [1] Initial load /dashboard/analytics ==");
    const resp = await gotoRetry(page, `${BASE}/dashboard/analytics`);
    p(`  HTTP status: ${resp?.status()}  url=${page.url()}`);
    if (resp?.status() !== 200) addIssue("BLOCKER", "http", `GET /dashboard/analytics -> ${resp?.status()}`);
    if (page.url().includes("/login")) addIssue("BLOCKER", "auth", "redirect ke /login (sesi tidak valid)");
    await page.waitForTimeout(1200);

    // ============ [2] Header contract ============
    p("\n== [2] PageHeader contract ==");
    const eyebrow = ((await page.locator("main header p.font-mono").first().textContent().catch(() => "")) || "").trim();
    const h1 = ((await page.locator("main h1").first().textContent().catch(() => "")) || "").trim();
    p(`  eyebrow: "${eyebrow}"`);
    p(`  h1: "${h1}"`);
    if (!/ANALITIK: PENDAPATAN/i.test(eyebrow))
      addIssue("MAJOR", "header", `eyebrow harus "ANALITIK: PENDAPATAN" -> "${eyebrow}"`);
    if (h1 !== "Analitik Pendapatan")
      addIssue("MINOR", "header", `judul h1 tidak sesuai -> "${h1}"`);

    // ============ [3] Tabs present ============
    p("\n== [3] Breakdown tabs ==");
    const tabTexts = await page.locator("nav[aria-label='Breakdown revenue'] a").allTextContents();
    p(`  tabs: ${JSON.stringify(tabTexts.map((t) => t.trim()))}`);
    const expected = ["Per Hari", "Per Outlet", "Per Package", "Per Photobox", "Per Metode Bayar"];
    if (expected.some((e) => !tabTexts.map((t) => t.trim()).includes(e)))
      addIssue("MAJOR", "tabs", `tab hilang. punya=${JSON.stringify(tabTexts)}`);
    const current = await page.locator("nav[aria-label='Breakdown revenue'] a[aria-current=page]").textContent().catch(() => "");
    p(`  active tab: "${(current || "").trim()}"`);
    if ((current || "").trim() !== "Per Hari") addIssue("MINOR", "tabs", `default tab bukan Per Hari -> "${current}"`);

    // ============ [4] DateRangeFilter ============
    p("\n== [4] DateRangeFilter ==");
    const rangeBtn = page.locator("button[aria-label='Pilih rentang tanggal']");
    if ((await rangeBtn.count()) === 0) addIssue("MAJOR", "filter", "tombol rentang tanggal tidak ada");
    const rangeLabel = ((await rangeBtn.textContent().catch(() => "")) || "").trim();
    p(`  range label: "${rangeLabel}"`);
    if (/Invalid|NaN/i.test(rangeLabel)) addIssue("MAJOR", "filter", `label tanggal invalid -> "${rangeLabel}"`);
    const presetBtns = page.locator("[role=group][aria-label='Preset periode'] button");
    p(`  preset count: ${await presetBtns.count()}`);
    if ((await presetBtns.count()) !== 3) addIssue("MINOR", "filter", "preset 7/30/90 hari tidak lengkap");

    // Capture URL + range text before preset change
    const urlBefore = page.url();
    const rangeBefore = rangeLabel;
    // Click "7 HARI" — retry until URL berubah (klik bisa jatuh sebelum hidrasi).
    const preset7 = page.locator("[role=group][aria-label='Preset periode'] button", { hasText: "7 HARI" });
    let clicked = false;
    for (let attempt = 0; attempt < 4 && !clicked; attempt++) {
      await preset7.click().catch(() => {});
      await page.waitForTimeout(1600);
      clicked = page.url() !== urlBefore;
    }
    const urlAfter7 = page.url();
    const rangeAfter7 = ((await rangeBtn.textContent().catch(() => "")) || "").trim();
    p(`  after 7 HARI -> url=${urlAfter7}`);
    p(`  after 7 HARI -> label="${rangeAfter7}"  rangeBefore="${rangeBefore}"`);
    if (urlBefore === urlAfter7) addIssue("MAJOR", "filter", "klik preset 7 HARI tidak mengubah URL/rentang");
    if (!/[?&]from=/.test(urlAfter7) || !/[?&]to=/.test(urlAfter7))
      addIssue("MAJOR", "filter", `URL preset tidak memuat from & to -> ${urlAfter7}`);

    // Verify chart still renders after change
    await page.waitForSelector("[data-slot=chart], [data-slot=empty-state], text=/Belum ada pendapatan/", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/O2-01-default-7day.png`, fullPage: true });

    // ============ [5] Chart / empty state rendering ============
    p("\n== [5] Chart / empty state ==");
    const chartCount = await page.locator("[data-slot=chart]").count();
    const emptyVisible = await page.locator("text=/Belum ada pendapatan/").first().isVisible().catch(() => false);
    const totalBadge = ((await page.locator("main [data-slot=card] span.border-2").first().textContent().catch(() => "")) || "").trim();
    p(`  chart elements: ${chartCount}`);
    p(`  empty state visible: ${emptyVisible}`);
    p(`  total badge: "${totalBadge}"`);
    if (chartCount === 0 && !emptyVisible) addIssue("BLOCKER", "chart", "tidak ada chart DAN tidak ada empty state (tab Per Hari)");
    const svgCount = await page.locator("[data-slot=chart] svg.recharts-surface").count();
    p(`  recharts svg: ${svgCount}`);
    if (chartCount > 0 && svgCount === 0) addIssue("BLOCKER", "chart", "chart container ada tapi recharts surface tidak tergambar");

    // ============ [6] Breakdown tabs interaction ============
    p("\n== [6] Tab switching + breakdown data ==");
    const tabsToTest: [string, string][] = [
      ["Per Outlet", "outlet"],
      ["Per Package", "package"],
      ["Per Photobox", "photobox"],
      ["Per Metode Bayar", "method"],
    ];
    for (const [label, key] of tabsToTest) {
      await page.locator("nav[aria-label='Breakdown revenue'] a", { hasText: label }).click();
      // Soft (SPA) navigation: networkidle tidak retrigger — tunggu URL berubah.
      await page.waitForURL((u) => u.searchParams.get("tab") === key, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const url = page.url();
      const tabParam = new URL(url).searchParams.get("tab");
      const activeTab = ((await page.locator("nav[aria-label='Breakdown revenue'] a[aria-current=page]").textContent().catch(() => "")) || "").trim();
      const hasChart = (await page.locator("[data-slot=chart]").count()) > 0;
      const hasTable = (await page.locator("main table").count()) > 0;
      const hasEmpty = await page.locator("text=/Belum ada pendapatan/").first().isVisible().catch(() => false);
      const rowCount = await page.locator("main table tbody tr").count();
      const total = ((await page.locator("main [data-slot=card] span.border-2").first().textContent().catch(() => "")) || "").trim();
      p(`  [${label}] tab=${tabParam} active="${activeTab}" chart=${hasChart} table=${hasTable} rows=${rowCount} empty=${hasEmpty} total="${total}"`);
      if (tabParam !== key) addIssue("MAJOR", "tabs", `klik "${label}" -> ?tab=${tabParam} (harusnya ${key})`);
      if (hasEmpty && hasTable) addIssue("MINOR", "chart", `[${label}] empty state tampil tapi tabel juga tampil`);
      if (hasEmpty && !hasTable && !hasChart) addIssue("MINOR", "chart", `[${label}] tidak ada chart/table — hanya empty state`);
      if (!hasEmpty && !hasChart && !hasTable) addIssue("BLOCKER", "chart", `[${label}] tidak ada chart, table, maupun empty state`);
      // table header check
      if (hasTable) {
        const ths = await page.locator("main table thead th").allTextContents();
        p(`      th: ${JSON.stringify(ths.map((t) => t.trim()))}`);
      }
      await page.screenshot({ path: `${OUT}/O2-tab-${key}.png`, fullPage: true });
    }

    // ============ [7] Tab persistence with date range ============
    p("\n== [7] Tab + date persistence ==");
    const curUrl = new URL(page.url());
    const from = curUrl.searchParams.get("from");
    const to = curUrl.searchParams.get("to");
    p(`  current from=${from} to=${to} tab=${curUrl.searchParams.get("tab")}`);
    // click Per Package to confirm tab kept when using date preset
    await page.locator("nav[aria-label='Breakdown revenue'] a", { hasText: "Per Package" }).click();
    await page.waitForURL((u) => u.searchParams.get("tab") === "package", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.locator("[role=group][aria-label='Preset periode'] button", { hasText: "30 HARI" }).click();
    await page.waitForTimeout(1800);
    const afterPreset = new URL(page.url());
    p(`  after 30 HARI while on Per Package -> tab=${afterPreset.searchParams.get("tab")} from=${afterPreset.searchParams.get("from")}`);
    if (afterPreset.searchParams.get("tab") !== "package")
      addIssue("MAJOR", "filter", `tab hilang saat ganti preset -> tab=${afterPreset.searchParams.get("tab")}`);

    // ============ [8] Overlap / layout checks @1440 ============
    p("\n== [8] Overlap & layout @1440 ==");
    await gotoRetry(page, `${BASE}/dashboard/analytics`);
    await page.waitForTimeout(1200);
    const overlaps = await detectOverlaps(page);
    p(`  overlaps: ${overlaps.length}`);
    for (const o of overlaps) { p(`    ${o}`); addIssue("MAJOR", "overlap", o); }
    const ov = await overflowOf(page);
    p(`  horizontal overflow @1440: ${ov}px`);
    if (ov > 2) addIssue("MAJOR", "responsive", `overflow horizontal @1440 = ${ov}px`);

    // ============ [9] Responsive viewports ============
    p("\n== [9] Responsive: 390 / 768 / 1280 ==");
    for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]] as [number, number][]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(900);
      const of = await overflowOf(page);
      const tabWrapOk = await page.evaluate(() => {
        const nav = document.querySelector("nav[aria-label='Breakdown revenue']");
        if (!nav) return true;
        return nav.scrollWidth <= nav.clientWidth + 2;
      });
      // tap target check for tab links
      const smallTaps = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll<HTMLElement>("nav[aria-label='Breakdown revenue'] a, [role=group][aria-label='Preset periode'] button, button[aria-label='Pilih rentang tanggal']"));
        return els.filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.height < 32);
        }).map((e) => (e.textContent || "").trim().slice(0, 24) + ` h=${Math.round(e.getBoundingClientRect().height)}`);
      });
      p(`  @${w}x${h}: overflow=${of}px tabWrapOk=${tabWrapOk} smallTaps=${JSON.stringify(smallTaps)}`);
      if (of > 2) addIssue("MAJOR", "responsive", `overflow horizontal @${w} = ${of}px`);
      await page.screenshot({ path: `${OUT}/O2-w${w}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // ============ [10] Calendar popover ============
    p("\n== [10] Calendar popover interaction ==");
    await gotoRetry(page, `${BASE}/dashboard/analytics`);
    await page.waitForTimeout(800);
    const calBtn = page.locator("button[aria-label='Pilih rentang tanggal']");
    await calBtn.click();
    await page.waitForTimeout(700);
    const popover = page.locator("[role=dialog], [data-slot=popover-content], [data-slot=popover]");
    const dias = page.locator("[role=dialog] button, .rdp button");
    const diaCount = await dias.count();
    p(`  popover visible: ${await popover.first().isVisible().catch(() => false)}  day buttons: ${diaCount}`);
    if (diaCount === 0) addIssue("MAJOR", "filter", "kalender popover tidak menampilkan tombol hari");
    // Escape close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stillOpen = await popover.first().isVisible().catch(() => false);
    p(`  popover after Escape visible: ${stillOpen}`);
    if (stillOpen) addIssue("MAJOR", "a11y", "popover kalender tidak menutup dengan Escape");

    // ============ [11] Keyboard focus ============
    p("\n== [11] Keyboard tab order ==");
    await gotoRetry(page, `${BASE}/dashboard/analytics`);
    await page.waitForTimeout(700);
    const focusChain: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return "none";
        const r = a.getBoundingClientRect();
        const outline = getComputedStyle(a).outlineStyle;
        return `${a.tagName}[${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 22)}] outline=${outline}`;
      });
      focusChain.push(f);
    }
    p(`  focus chain:\n    ${focusChain.join("\n    ")}`);
    const noOutline = focusChain.filter((f) => /outline=none/.test(f)).length;
    if (noOutline > 3) addIssue("MINOR", "a11y", `${noOutline}/8 elemen fokus tanpa outline terlihat`);
    await page.screenshot({ path: `${OUT}/O2-09-focus.png`, fullPage: true });

    // ============ [12] Guard: staff blocked ============
    p("\n== [12] RBAC: staff (transaction:read tak ada) ==");

    // ============ [13] Error/empty state via future range ============
    p("\n== [13] Empty state via future range ==");
    // far past range with no paid tx
    await gotoRetry(page, `${BASE}/dashboard/analytics?from=2020-01-01&to=2020-01-02`);
    await page.waitForTimeout(1200);
    const emptyShown = await page.locator("text=/Belum ada pendapatan/").first().isVisible().catch(() => false);
    const badge13 = ((await page.locator("main [data-slot=card] span.border-2").first().textContent().catch(() => "")) || "").trim();
    p(`  range 2020 empty visible: ${emptyShown}  total="${badge13}"`);
    if (!emptyShown) addIssue("MAJOR", "empty", "rentang tanpa data tidak menampilkan EmptyState");
    if (!/Total\s*Rp?\s*0?/.test(badge13.replace(/\u00a0/g, " ")) && !/0/.test(badge13))
      addIssue("MINOR", "empty", `total badge bukan 0 saat kosong -> "${badge13}"`);
    await page.screenshot({ path: `${OUT}/O2-10-empty.png`, fullPage: true });

    // ============ [14] Malformed / reversed dates ============
    p("\n== [14] Malformed & reversed date params ==");
    const badCases = [
      "?from=2030-05-10&to=2020-01-01",
      "?from=abc&to=xyz",
      "?to=2025-01-10",
      "?from=2024-01-01",
      "?tab=hacker",
      "?from=2020-01-01&to=2035-12-31",
    ];
    for (const q of badCases) {
      const r = await gotoRetry(page, `${BASE}/dashboard/analytics${q}`).catch(() => null);
      await page.waitForTimeout(700);
      const st = r?.status();
      const errBoundary = await page.locator("text=/GAGAL MEMUAT ANALITIK/").first().isVisible().catch(() => false);
      const h1ok = await page.locator("main h1").first().isVisible().catch(() => false);
      p(`  ${q} -> status=${st} errorBoundary=${errBoundary} pageRendered=${h1ok}`);
      if (st !== 200) addIssue("MAJOR", "validation", `${q} -> HTTP ${st}`);
      if (errBoundary) addIssue("MAJOR", "validation", `${q} -> error boundary (harus tampil normal/clamp)`);
      if (!h1ok) addIssue("MAJOR", "validation", `${q} -> halaman kosong / gagal render`);
    }

    // ============ [15] Long-label breakdown (table + chart) ============
    p("\n== [15] Long labels / table wrap ==");
    await gotoRetry(page, `${BASE}/dashboard/analytics?tab=photobox`);
    await page.waitForTimeout(1200);
    const tblOverflow = await page.evaluate(() => {
      const wrap = document.querySelector("main .overflow-x-auto");
      if (!wrap) return 0;
      return (wrap as HTMLElement).scrollWidth - (wrap as HTMLElement).clientWidth;
    });
    p(`  table inner overflow (photobox): ${tblOverflow}px`);
    await page.screenshot({ path: `${OUT}/O2-11-photobox.png`, fullPage: true });

    // ============ [16] Console errors summary ============
    p("\n== [16] Console / network errors ==");
    if (errs.length === 0) p("  (none)");
    for (const e of errs.slice(0, 30)) { p(`  ${e}`); addIssue("MAJOR", "console", e); }

    // ============ report ============
    const blockers = issues.filter((i) => i.severity === "BLOCKER").length;
    const majors = issues.filter((i) => i.severity === "MAJOR").length;
    const minors = issues.filter((i) => i.severity === "MINOR").length;
    p(`\n==== O2 SUMMARY ====`);
    p(`BLOCKER=${blockers} MAJOR=${majors} MINOR=${minors}`);
    p(`VERDICT=${blockers === 0 && majors === 0 ? "PASS" : "NEEDS FIX"}`);

    await writeFile(
      `${OUT}/o2-report.json`,
      JSON.stringify({ issues, log, errors: errs, verdict: blockers === 0 && majors === 0 ? "PASS" : "NEEDS FIX" }, null, 2)
    );
    console.log(`Report -> ${OUT}/o2-report.json  (testInfo: ${testInfo.title})`);
  });

  test("O2b RBAC — staff denied financial analytics", async ({ browser }, testInfo) => {
    test.setTimeout(90000);
    const ctx: BrowserContext = await browser.newContext({ storageState: STAFF_STATE });
    const page = await ctx.newPage();
    const errs: string[] = [];
    attach(page, "O2b-staff", errs);
    p("\n== [O2b] staff access ==");
    const r = await gotoRetry(page, `${BASE}/dashboard/analytics`).catch(() => null);
    await page.waitForTimeout(1200);
    const url = page.url();
    const denied = await page.locator("text=/Akses finansial terbatas/").first().isVisible().catch(() => false);
    const chart = await page.locator("[data-slot=chart]").count();
    p(`  staff /dashboard/analytics -> status=${r?.status()} url=${url} deniedCard=${denied} charts=${chart}`);
    if (url.includes("/login")) {
      addIssue("INFO", "rbac", "staff state expired/invalid (redirect /login) — sesi perlu refresh");
    } else if (url.includes("/staff") || denied) {
      p("  PASS: staff ditolak / dialihkan keluar dari analitik finansial");
    } else {
      addIssue("BLOCKER", "rbac", `staff tidak diblokir (deniedCard=${denied}, url=${url})`);
    }
    if (chart > 0) addIssue("BLOCKER", "rbac", "staff melihat chart revenue (harus ditolak)");
    await page.screenshot({ path: `${OUT}/O2-12-staff.png`, fullPage: true });
    await ctx.close();
    await writeFile(`${OUT}/o2b-report.json`, JSON.stringify({ issues, log, errors: errs }, null, 2));
    console.log(`O2b -> ${issues.length} issues`);
  });
});
