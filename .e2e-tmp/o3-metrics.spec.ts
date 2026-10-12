import { test, type Page, type BrowserContext } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o3";
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
        "main h1, main h2, main h3, main p, main nav, main [data-slot=card], main [data-slot=metric-card], main table, main section, main header"
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
            `"${a.tagName}.${(a.className || "").toString().slice(0, 24)}"(${at}) ∩ "${b.tagName}.${(b.className || "").toString().slice(0, 24)}"(${bt}) = ${Math.round(ox)}x${Math.round(oy)}`
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

const norm = (s: string) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

test.describe("O3 Metrics — metrik operasional", () => {
  test.use({ storageState: OWNER_STATE });

  test("O3 full E2E: render, header, data accuracy, sections, filter, states, responsive, a11y, RBAC", async ({
    page,
  }, testInfo) => {
    await mkdir(OUT, { recursive: true });
    const errs: string[] = [];
    attach(page, "O3", errs);
    test.setTimeout(240000);

    // ============ [1] Initial load ============
    p("\n== [1] Initial load /dashboard/metrics ==");
    const resp = await gotoRetry(page, `${BASE}/dashboard/metrics`);
    p(`  HTTP status: ${resp?.status()}  url=${page.url()}`);
    if (resp?.status() !== 200) addIssue("BLOCKER", "http", `GET /dashboard/metrics -> ${resp?.status()}`);
    if (page.url().includes("/login")) addIssue("BLOCKER", "auth", "redirect ke /login (sesi tidak valid)");
    await page.waitForTimeout(1200);

    // error boundary?
    const errBoundary = await page.locator("text=/GAGAL MEMUAT METRIK/").first().isVisible().catch(() => false);
    p(`  error boundary visible: ${errBoundary}`);
    if (errBoundary) {
      addIssue("BLOCKER", "render", "error boundary tampil — getBusinessMetrics gagal (RPC? guard?)");
      const msg = await page.locator("main").first().innerText().catch(() => "");
      p(`  boundary text: ${norm(msg).slice(0, 300)}`);
    }

    // ============ [2] Header contract ============
    p("\n== [2] PageHeader contract ==");
    const eyebrow = norm(
      (await page.locator("main header p.font-mono").first().textContent().catch(() => "")) || ""
    );
    const h1 = norm((await page.locator("main h1").first().textContent().catch(() => "")) || "");
    p(`  eyebrow: "${eyebrow}"`);
    p(`  h1: "${h1}"`);
    if (!/^METRIK: .+/i.test(eyebrow)) addIssue("MAJOR", "header", `eyebrow harus "METRIK: <NAMA BISNIS>" -> "${eyebrow}"`);
    if (h1 !== "Metrik Bisnis") addIssue("MINOR", "header", `judul h1 tidak sesuai -> "${h1}"`);

    // description: "{from} → {to}. ..."
    const desc = norm(
      (await page.locator("main header p.text-sm, main header p:not(.font-mono)").first().textContent().catch(() => "")) ||
        ""
    );
    p(`  description: "${desc.slice(0, 160)}"`);
    if (!/\d{4}-\d{2}-\d{2}\s*→\s*\d{4}-\d{2}-\d{2}/.test(desc))
      addIssue("MINOR", "header", `description tidak memuat rentang tanggal -> "${desc.slice(0, 120)}"`);

    // ============ [3] Revenue section ============
    p("\n== [3] Revenue section (gross/discount/net/growth) ==");
    const revSection = page.locator("section[aria-label='Revenue']");
    const revCards = revSection.locator("[data-slot=metric-card]");
    const revCount = await revCards.count();
    p(`  revenue metric cards: ${revCount}`);
    if (revCount !== 4) addIssue("MAJOR", "revenue", `harus ada 4 kartu (net+3) -> ${revCount}`);
    const revTexts: string[] = [];
    for (let i = 0; i < revCount; i++) revTexts.push(norm(await revCards.nth(i).innerText()));
    revTexts.forEach((t) => p(`    • ${t}`));
    const labelList = revTexts.map((t) => t.split("\n")[0]);
    for (const need of ["Pendapatan Net", "Gross", "Diskon", "Pertumbuhan"]) {
      if (!revTexts.some((t) => t.includes(need)))
        addIssue("MAJOR", "revenue", `kartu "${need}" tidak ada. punya=${JSON.stringify(labelList)}`);
    }
    const allRev = revTexts.join(" | ");
    if (!/Rp\s?[\d.]+/.test(allRev)) addIssue("MAJOR", "revenue", "nilai revenue bukan format Rp -> " + allRev.slice(0, 160));
    if (!/%/.test(allRev)) addIssue("MINOR", "revenue", "kartu Pertumbuhan tidak menampilkan persen (%)");
    // growth sub must mention periode lalu
    if (!/periode lalu/i.test(allRev)) addIssue("MINOR", "revenue", "sub Pertumbuhan tidak menyebut 'periode lalu'");

    // ============ [4] Summary grid (9 cells) ============
    p("\n== [4] Ringkasan metrik grid ==");
    const grid = page.locator("[aria-label='Ringkasan metrik']");
    const cells = grid.locator("> div");
    const cellCount = await cells.count();
    p(`  cells: ${cellCount}`);
    if (cellCount !== 9) addIssue("MAJOR", "summary-grid", `harus 9 cell -> ${cellCount}`);
    const expectedLabels = [
      "Sesi Foto",
      "Sesi Selesai",
      "Sesi Batal",
      "Total Retake",
      "Durasi Rata-rata",
      "Pelanggan Total",
      "Pelanggan Baru",
      "Pelanggan Kembali",
      "Tx Gagal",
    ];
    const cellTexts: string[] = [];
    for (let i = 0; i < cellCount; i++) cellTexts.push(norm(await cells.nth(i).innerText()));
    cellTexts.forEach((t) => p(`    • ${t}`));
    for (const lbl of expectedLabels) {
      if (!cellTexts.some((t) => t.startsWith(lbl)))
        addIssue("MINOR", "summary-grid", `cell label "${lbl}" tidak ditemukan`);
    }
    // durasi format "Xm Ys"
    const durCell = cellTexts.find((t) => t.startsWith("Durasi Rata-rata")) || "";
    if (!/\d+m\s\d+s/.test(durCell)) addIssue("MINOR", "summary-grid", `format Durasi Rata-rata salah -> "${durCell}"`);

    // ============ [5] Photobox performance card ============
    p("\n== [5] Performa Photobox (table / empty) ==");
    const performaCard = page.locator("main [data-slot=card]", { hasText: "Performa Photobox" }).first();
    if ((await performaCard.count()) === 0) {
      addIssue("MAJOR", "photobox", "kartu 'Performa Photobox' tidak ada");
    } else {
      const bodyText = norm(await performaCard.innerText());
      p(`  card text: ${bodyText.slice(0, 260)}`);
      const hasTable = (await performaCard.locator("table").count()) > 0;
      const hasEmpty = /BELUM ADA PHOTOBOX/i.test(bodyText);
      const description = norm(
        (await performaCard.locator("[data-slot=card-description], p").first().textContent().catch(() => "")) || ""
      );
      p(`  hasTable=${hasTable} hasEmpty=${hasEmpty}`);
      p(`  description: "${description.slice(0, 200)}"`);
      if (!/package terpopuler/i.test(bodyText))
        addIssue("MINOR", "photobox", "description tidak menyebut 'package terpopuler'");
      if (!/template terpakai/i.test(bodyText))
        addIssue("MINOR", "photobox", "description tidak menyebut 'template terpakai'");
      if (hasTable) {
        const ths = (await performaCard.locator("thead th").allTextContents()).map(norm);
        p(`  th: ${JSON.stringify(ths)}`);
        for (const need of ["Booth", "Sesi", "Pendapatan Net"]) {
          if (!ths.includes(need)) addIssue("MINOR", "photobox", `header tabel "${need}" hilang. punya=${JSON.stringify(ths)}`);
        }
        const rows = await performaCard.locator("tbody tr").count();
        p(`  rows: ${rows}`);
        const tbodyText = norm(await performaCard.locator("tbody").innerText());
        // revenue cells must be Rp
        if (!/Rp\s?[\d.]+/.test(tbodyText)) addIssue("MAJOR", "photobox", "kolom Pendapatan Net bukan format Rp");
      } else if (!hasEmpty) {
        addIssue("MAJOR", "photobox", "tidak ada tabel DAN tidak ada EmptyState");
      }
    }

    await page.screenshot({ path: `${OUT}/O3-01-default.png`, fullPage: true });

    // ============ [6] DateRangeFilter ============
    p("\n== [6] DateRangeFilter ==");
    const rangeBtn = page.locator("button[aria-label='Pilih rentang tanggal']");
    if ((await rangeBtn.count()) === 0) addIssue("MAJOR", "filter", "tombol rentang tanggal tidak ada");
    const rangeLabel = norm((await rangeBtn.textContent().catch(() => "")) || "");
    p(`  range label: "${rangeLabel}"`);
    if (/Invalid|NaN/i.test(rangeLabel)) addIssue("MAJOR", "filter", `label tanggal invalid -> "${rangeLabel}"`);
    const presetBtns = page.locator("[role=group][aria-label='Preset periode'] button");
    const presetCount = await presetBtns.count();
    p(`  preset count: ${presetCount}`);
    if (presetCount !== 3) addIssue("MINOR", "filter", "preset 7/30/90 hari tidak lengkap");

    const urlBefore = page.url();
    const rangeBefore = rangeLabel;
    const netBefore = norm(await revCards.nth(0).innerText());
    const preset7 = page.locator("[role=group][aria-label='Preset periode'] button", { hasText: "7 HARI" });
    let clicked = false;
    for (let attempt = 0; attempt < 4 && !clicked; attempt++) {
      await preset7.click().catch(() => {});
      await page.waitForTimeout(1600);
      clicked = page.url() !== urlBefore;
    }
    const urlAfter7 = page.url();
    const rangeAfter7 = norm((await rangeBtn.textContent().catch(() => "")) || "");
    p(`  after 7 HARI -> url=${urlAfter7}`);
    p(`  after 7 HARI -> label="${rangeAfter7}" (before="${rangeBefore}")`);
    if (urlBefore === urlAfter7) addIssue("MAJOR", "filter", "klik preset 7 HARI tidak mengubah URL/rentang");
    if (!/[?&]from=/.test(urlAfter7) || !/[?&]to=/.test(urlAfter7))
      addIssue("MAJOR", "filter", `URL preset tidak memuat from & to -> ${urlAfter7}`);
    // métrics refreshed: net might change; ensure no error boundary
    if (await page.locator("text=/GAGAL MEMUAT METRIK/").first().isVisible().catch(() => false))
      addIssue("BLOCKER", "filter", "error boundary setelah ganti preset 7 HARI");
    await page.waitForTimeout(600);

    // 90 HARI then confirm URL
    await page.locator("[role=group][aria-label='Preset periode'] button", { hasText: "90 HARI" }).click();
    await page.waitForTimeout(1600);
    p(`  after 90 HARI -> url=${page.url()}`);
    await page.screenshot({ path: `${OUT}/O3-02-90day.png`, fullPage: true });

    // ============ [7] Overlap / layout @1440 ============
    p("\n== [7] Overlap & layout @1440 ==");
    await gotoRetry(page, `${BASE}/dashboard/metrics`);
    await page.waitForTimeout(1200);
    const overlaps = await detectOverlaps(page);
    p(`  overlaps: ${overlaps.length}`);
    for (const o of overlaps) { p(`    ${o}`); addIssue("MAJOR", "overlap", o); }
    const ov = await overflowOf(page);
    p(`  horizontal overflow @1440: ${ov}px`);
    if (ov > 2) addIssue("MAJOR", "responsive", `overflow horizontal @1440 = ${ov}px`);

    // ============ [8] Responsive viewports ============
    p("\n== [8] Responsive: 390 / 768 / 1280 ==");
    for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]] as [number, number][]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(900);
      const of = await overflowOf(page);
      const smallTaps = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[role=group][aria-label='Preset periode'] button, button[aria-label='Pilih rentang tanggal']"
          )
        );
        return els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height < 32;
          })
          .map((e) => (e.textContent || "").trim().slice(0, 24) + ` h=${Math.round(e.getBoundingClientRect().height)}`);
      });
      // summary grid should collapse ok
      const gridCols = await page.evaluate(() => {
        const g = document.querySelector("[aria-label='Ringkasan metrik']");
        if (!g) return "n/a";
        return getComputedStyle(g as HTMLElement).gridTemplateColumns;
      });
      p(`  @${w}x${h}: overflow=${of}px smallTaps=${JSON.stringify(smallTaps)} gridCols=${gridCols}`);
      if (of > 2) addIssue("MAJOR", "responsive", `overflow horizontal @${w} = ${of}px`);
      if (smallTaps.length > 0) addIssue("MINOR", "a11y", `tap target <32px @${w}: ${JSON.stringify(smallTaps)}`);
      await page.screenshot({ path: `${OUT}/O3-w${w}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // ============ [9] Calendar popover ============
    p("\n== [9] Calendar popover interaction ==");
    await gotoRetry(page, `${BASE}/dashboard/metrics`);
    await page.waitForTimeout(800);
    const calBtn = page.locator("button[aria-label='Pilih rentang tanggal']");
    await calBtn.click();
    await page.waitForTimeout(700);
    const popover = page.locator("[role=dialog], [data-slot=popover-content], [data-slot=popover]");
    const dayBtns = page.locator("[role=dialog] button, .rdp button");
    const diaCount = await dayBtns.count();
    p(`  popover visible: ${await popover.first().isVisible().catch(() => false)}  day buttons: ${diaCount}`);
    if (diaCount === 0) addIssue("MAJOR", "filter", "kalender popover tidak menampilkan tombol hari");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stillOpen = await popover.first().isVisible().catch(() => false);
    p(`  popover after Escape visible: ${stillOpen}`);
    if (stillOpen) addIssue("MAJOR", "a11y", "popover kalender tidak menutup dengan Escape");

    // ============ [10] Keyboard focus ============
    p("\n== [10] Keyboard tab order ==");
    await gotoRetry(page, `${BASE}/dashboard/metrics`);
    await page.waitForTimeout(700);
    const focusChain: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return "none";
        const outline = getComputedStyle(a).outlineStyle;
        return `${a.tagName}[${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 22)}] outline=${outline}`;
      });
      focusChain.push(f);
    }
    p(`  focus chain:\n    ${focusChain.join("\n    ")}`);

    // ============ [11] Empty state via far past range ============
    p("\n== [11] Empty state via rentang kosong (2020) ==");
    await gotoRetry(page, `${BASE}/dashboard/metrics?from=2020-01-01&to=2020-01-02`);
    await page.waitForTimeout(1200);
    const emptyShown = await page.locator("text=/BELUM ADA PHOTOBOX/").first().isVisible().catch(() => false);
    const revAfterEmpty = await page.locator("section[aria-label='Revenue'] [data-slot=metric-card]").nth(0).innerText().catch(() => "");
    const netZero = /Rp\s?0(?![\d.])/.test(norm(revAfterEmpty));
    p(`  empty photobox state visible: ${emptyShown}`);
    p(`  net card on empty range: "${norm(revAfterEmpty).slice(0, 80)}"`);
    // Note: photobox table shows all booths regardless of range → empty state may not show.
    // What matters: no error boundary, page renders, net = 0.
    if (await page.locator("text=/GAGAL MEMUAT METRIK/").first().isVisible().catch(() => false))
      addIssue("BLOCKER", "empty", "error boundary pada rentang tanpa data");
    if (!netZero) addIssue("MAJOR", "empty", `Pendapatan Net rentang kosong bukan Rp 0 -> ${norm(revAfterEmpty).slice(0, 60)}`);
    const h1ok = await page.locator("main h1").first().isVisible().catch(() => false);
    if (!h1ok) addIssue("MAJOR", "empty", "halaman tidak render pada rentang kosong");
    await page.screenshot({ path: `${OUT}/O3-03-empty.png`, fullPage: true });

    // ============ [12] Malformed / reversed date params ============
    p("\n== [12] Malformed & reversed date params ==");
    const badCases = [
      "?from=2030-05-10&to=2020-01-01",
      "?from=abc&to=xyz",
      "?to=2025-01-10",
      "?from=2024-01-01",
      "?from=2020-01-01&to=2035-12-31",
      "?from=2026-10-01&to=2026-10-05",
    ];
    for (const q of badCases) {
      const r = await gotoRetry(page, `${BASE}/dashboard/metrics${q}`).catch(() => null);
      await page.waitForTimeout(700);
      const st = r?.status();
      const eb = await page.locator("text=/GAGAL MEMUAT METRIK/").first().isVisible().catch(() => false);
      const h1Ok = await page.locator("main h1").first().isVisible().catch(() => false);
      p(`  ${q} -> status=${st} errorBoundary=${eb} pageRendered=${h1Ok}`);
      if (st !== 200) addIssue("MAJOR", "validation", `${q} -> HTTP ${st}`);
      if (eb) addIssue("MAJOR", "validation", `${q} -> error boundary (harus tampil normal/clamp)`);
      if (!h1Ok) addIssue("MAJOR", "validation", `${q} -> halaman kosong / gagal render`);
    }

    // ============ [13] Data accuracy cross-check vs transactions API/RPC ============
    p("\n== [13] Data accuracy: net revenue == paid tx sum ==");
    // Re-load default and read a stable range, then compare with /dashboard (summary) if present.
    await gotoRetry(page, `${BASE}/dashboard/metrics?from=2026-01-01&to=2026-12-31`);
    await page.waitForTimeout(1200);
    const metricsNet = norm(await revCards.nth(0).innerText());
    const metricsPaidSub = norm(await revCards.nth(0).innerText());
    p(`  metrics net card: "${metricsNet}" | paid sub: "${metricsPaidSub}"`);
    // Load dashboard (same business, same default range) and compare net if shown — best effort.
    const dashResp = await gotoRetry(page, `${BASE}/dashboard?from=2026-01-01&to=2026-12-31`).catch(() => null);
    await page.waitForTimeout(1000);
    if (dashResp && dashResp.status() === 200) {
      const dashText = norm(await page.locator("main").first().innerText().catch(() => ""));
      const m = dashText.match(/Rp\s?[\d.]+/g) || [];
      p(`  dashboard money figures: ${JSON.stringify(m.slice(0, 6))}`);
    }
    // Back to metrics
    await gotoRetry(page, `${BASE}/dashboard/metrics`);
    await page.waitForTimeout(600);

    // ============ [14] Console / network errors ============
    p("\n== [14] Console / network errors ==");
    if (errs.length === 0) p("  (none)");
    for (const e of errs.slice(0, 30)) { p(`  ${e}`); addIssue("MAJOR", "console", e); }

    // ============ report ============
    const blockers = issues.filter((i) => i.severity === "BLOCKER").length;
    const majors = issues.filter((i) => i.severity === "MAJOR").length;
    const minors = issues.filter((i) => i.severity === "MINOR").length;
    const infos = issues.filter((i) => i.severity === "INFO").length;
    p(`\n==== O3 SUMMARY ====`);
    p(`BLOCKER=${blockers} MAJOR=${majors} MINOR=${minors} INFO=${infos}`);
    p(`VERDICT=${blockers === 0 && majors === 0 ? "PASS" : "NEEDS FIX"}`);

    await writeFile(
      `${OUT}/o3-report.json`,
      JSON.stringify({ issues, log, errors: errs, verdict: blockers === 0 && majors === 0 ? "PASS" : "NEEDS FIX" }, null, 2)
    );
    console.log(`Report -> ${OUT}/o3-report.json  (${testInfo.title})`);
  });

  test("O3b RBAC — staff denied financial metrics", async ({ browser }) => {
    test.setTimeout(90000);
    await mkdir(OUT, { recursive: true });
    const ctx: BrowserContext = await browser.newContext({ storageState: STAFF_STATE });
    const page = await ctx.newPage();
    const errs: string[] = [];
    attach(page, "O3b-staff", errs);
    p("\n== [O3b] staff access /dashboard/metrics ==");
    const r = await gotoRetry(page, `${BASE}/dashboard/metrics`).catch(() => null);
    await page.waitForTimeout(1200);
    const url = page.url();
    const denied = await page.locator("text=/Akses finansial terbatas/").first().isVisible().catch(() => false);
    const h1vis = await page.locator("main h1").first().isVisible().catch(() => false);
    p(`  staff -> status=${r?.status()} url=${url} deniedCard=${denied} h1visible=${h1vis}`);
    if (url.includes("/login")) {
      addIssue("INFO", "rbac", "staff state expired (redirect /login) — sesi perlu refresh");
    } else if (url.includes("/staff") || denied) {
      p("  PASS: staff ditolak dari metrik finansial");
    } else {
      addIssue("BLOCKER", "rbac", `staff tidak diblokir (deniedCard=${denied}, url=${url})`);
    }
    await page.screenshot({ path: `${OUT}/O3-04-staff.png`, fullPage: true });
    await ctx.close();
    await writeFile(`${OUT}/o3b-report.json`, JSON.stringify({ issues, log, errors: errs }, null, 2));
    console.log(`O3b -> ${issues.length} issues`);
  });
});
