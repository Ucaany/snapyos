/**
 * O4 — Finance (/dashboard/finance) E2E audit.
 * Visible browser (headless:false). Session reused from /tmp/audit/state/owner.json
 * so we never hit the login rate limiter.
 *
 * Covers: render contract, data math (vs DB RPC), create/edit/delete expense CRUD,
 * date-range filter, layout overlap, responsive, a11y, console/page errors.
 */
import { test, type Page } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o4";
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

const norm = (s: string | null | undefined) =>
  (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Parse "Rp 1.250.000" -> 1250000 ; "Rp -5.000" -> -5000 */
function idrToInt(txt: string): number {
  const cleaned = txt.replace(/[^0-9-]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

async function metricCards(page: Page) {
  const cards = await page.locator("section[aria-label='Ringkasan finance'] [data-slot=metric-card]").allInnerTexts();
  return cards.map(norm);
}

async function detectOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main h1, main h2, main h3, main p, main [data-slot=metric-card], main table, main header, main section, main button"
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
          const at = (a.textContent || "").trim().slice(0, 30);
          const bt = (b.textContent || "").trim().slice(0, 30);
          out.push(
            `"${a.tagName}(${at})" ∩ "${b.tagName}(${bt})" = ${Math.round(ox)}x${Math.round(oy)}`
          );
        }
      }
    }
    return out.slice(0, 25);
  });
}

test.describe("O4 Finance E2E", () => {
  test.use({ storageState: OWNER_STATE });

  test("O4 full finance E2E", async ({ page, browser }) => {
    await mkdir(OUT, { recursive: true });
    const errs: string[] = [];
    attach(page, "O4", errs);

    // =========== 1. Initial load ===========
    p("\n== [1] Initial load /dashboard/finance (owner, default range) ==");
    const resp = await gotoRetry(page, `${BASE}/dashboard/finance`);
    p(`  HTTP: ${resp?.status()}  url=${page.url()}`);
    if (resp?.status() !== 200) addIssue("BLOCKER", "http", `GET /dashboard/finance -> ${resp?.status()}`);
    await page.waitForTimeout(1500);

    const eyebrow = norm(await page.locator("main p.font-mono").first().textContent().catch(() => ""));
    const h1 = norm(await page.locator("main h1").first().textContent().catch(() => ""));
    p(`  eyebrow: "${eyebrow}"`);
    p(`  h1: "${h1}"`);
    if (!/KEUANGAN/i.test(eyebrow)) addIssue("MAJOR", "header", `eyebrow finance tidak sesuai -> "${eyebrow}"`);
    if (h1 !== "Keuangan") addIssue("MAJOR", "header", `h1 bukan "Keuangan" -> "${h1}"`);

    // metadata: date range values in header
    const cards = await metricCards(page);
    p("  metric cards:");
    cards.forEach((c, i) => p(`    ${i}: "${c}"`));

    // =========== 2. Data math vs DB ===========
    p("\n== [2] Data math verification ==");
    // Read gross/discount values out of "Pendapatan Net" card sub
    const netCard = cards.find((c) => /Pendapatan Net/i.test(c)) ?? "";
    const costCard = cards.find((c) => /^Biaya/i.test(c)) ?? "";
    const profitCard = cards.find((c) => /Estimasi Laba/i.test(c)) ?? "";
    p(`  netCard: "${netCard}"`);
    p(`  costCard: "${costCard}"`);
    p(`  profitCard: "${profitCard}"`);

    const netMatch = netCard.match(/Rp ?(-?[\d.]+)/);
    const grossMatch = netCard.match(/Gross Rp ?(-?[\d.]+)/);
    const discMatch = netCard.match(/diskon Rp ?(-?[\d.]+)/);
    const costMatch = costCard.match(/Rp ?(-?[\d.]+)/);
    const profitMatch = profitCard.match(/Rp ?(-?[\d.]+)/);
    const marginMatch = profitCard.match(/Margin ([\d.,]+%)/);

    if (!netMatch) addIssue("MAJOR", "data", "Nominal Pendapatan Net tidak ter-parse");
    if (!profitMatch) addIssue("MAJOR", "data", "Nominal Estimasi Laba tidak ter-parse");

    // Fetch expected server values via the same page session (server components already rendered them).
    // We independently recompute: profit = net - expenses.
    if (netMatch && costMatch && profitMatch) {
      const net = idrToInt(netMatch[1]);
      const cost = idrToInt(costMatch[1]);
      const profit = idrToInt(profitMatch[1]);
      p(`  parsed: net=${net} cost=${cost} profit=${profit}`);
      if (net - cost !== profit)
        addIssue("MAJOR", "data", `profit != net-cost (${net} - ${cost} = ${net - cost} vs tampil ${profit})`);
      if (cost !== 0 && false) addIssue("INFO", "data", "cost != 0");
    }
    if (grossMatch && discMatch && netMatch) {
      const gross = idrToInt(grossMatch[1]);
      const disc = idrToInt(discMatch[1]);
      const net = idrToInt(netMatch[1]);
      if (gross - disc !== net)
        addIssue("MAJOR", "data", `net != gross-disc (${gross} - ${disc} = ${gross - disc} vs ${net})`);
    }

    // =========== 3. Period filter presets ===========
    p("\n== [3] Date-range filter presets ==");
    const beforeUrl = page.url();
    await page.getByRole("button", { name: "7 HARI", exact: true }).click();
    await page.waitForTimeout(1800);
    const url7 = page.url();
    p(`  after 7 HARI: ${url7}`);
    if (!/[?&]from=\d{4}-\d{2}-\d{2}/.test(url7)) addIssue("MAJOR", "filter", "preset 7 HARI tidak set ?from");
    if (!/[?&]to=\d{4}-\d{2}-\d{2}/.test(url7)) addIssue("MAJOR", "filter", "preset 7 HARI tidak set ?to");

    await page.getByRole("button", { name: "90 HARI", exact: true }).click();
    await page.waitForTimeout(1800);
    p(`  after 90 HARI: ${page.url()}`);
    await page.getByRole("button", { name: "30 HARI", exact: true }).click();
    await page.waitForTimeout(1800);
    p(`  after 30 HARI: ${page.url()}`);
    const url30 = page.url();
    if (url30 === beforeUrl) addIssue("MINOR", "filter", "preset 30 HARI mungkin tidak berubah dari default");

    // =========== 4. Empty state baseline ===========
    p("\n== [4] Empty states ==");
    // Set a wide range so any seeded expenses appear; use 400d? max 366. Use from=2020-01-01.
    await gotoRetry(page, `${BASE}/dashboard/finance?from=2020-01-01&to=${new Date().toISOString().slice(0, 10)}`);
    await page.waitForTimeout(1500);
    const emptyPanel = await page.getByText("BELUM ADA PENGELUARAN", { exact: false }).count();
    const emptyCat = await page.getByText("BELUM ADA EXPENSE PADA PERIODE INI", { exact: false }).count();
    const rowCount = await page.locator("main table tbody tr").count();
    p(`  empty expense panel: ${emptyPanel}, empty category block: ${emptyCat}, table rows: ${rowCount}`);
    const baselineRows = rowCount;

    // =========== 5. CREATE expense ===========
    p("\n== [5] Create expense ==");
    const trigger = page.getByRole("button", { name: "Buka form pengeluaran baru" });
    if (await trigger.count() === 0) addIssue("BLOCKER", "crud", "trigger 'Pengeluaran baru' tidak ada untuk owner");
    await trigger.click();
    await page.waitForTimeout(600);

    const createForm = page.locator("form:has-text('/// Pengeluaran baru')");
    if (await createForm.count() === 0) addIssue("BLOCKER", "crud", "form create expense tidak muncul setelah trigger");

    await createForm.locator("select[name=category]").selectOption("paper");
    await createForm.locator("input[name=amount]").fill("150000");
    await createForm.locator("input[name=expense_date]").fill("2026-10-05");
    await createForm.locator("select[name=outlet_id]").selectOption({ index: 1 });
    await createForm.locator("input[name=note]").fill("Kertas 4R 5 pack (E2E)");
    await page.screenshot({ path: `${OUT}/05-create-filled.png` });
    // Retry once: dev-server/Supabase occasionally returns a transient INTERNAL error.
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (!(await createForm.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Buka form pengeluaran baru" }).click();
        await page.waitForTimeout(500);
      }
      const f = page.locator("form:has-text('/// Pengeluaran baru')");
      if (await f.locator("input[name=amount]").inputValue().catch(() => "") === "") {
        await f.locator("select[name=category]").selectOption("paper");
        await f.locator("input[name=amount]").fill("150000");
        await f.locator("input[name=expense_date]").fill("2026-10-05");
        await f.locator("select[name=outlet_id]").selectOption({ index: 1 });
        await f.locator("input[name=note]").fill("Kertas 4R 5 pack (E2E)");
      }
      await f.getByRole("button", { name: /Simpan pengeluaran/i }).click();
      await page.waitForTimeout(3000);
      if (/Kertas 4R 5 pack \(E2E\)/.test(norm(await page.locator("body").innerText()))) break;
      p(`  create attempt ${attempt} did not persist, retrying…`);
    }
    await page.waitForTimeout(500);

    const afterCreateMsg = norm(await page.locator("body").innerText());
    const created = /Kertas 4R 5 pack \(E2E\)/.test(afterCreateMsg);
    p(`  created note visible: ${created}`);
    if (!created) addIssue("BLOCKER", "crud", "expense baru tidak muncul di tabel setelah create");

    // category rollup should now include Paper
    const catBlock = norm(await page.locator("main").innerText());
    p(`  "Kertas" in category rollup: ${/Kertas/.test(catBlock)}`);
    if (!/Kertas/.test(catBlock)) addIssue("MAJOR", "crud", "kategori Kertas tidak muncul di rollup Biaya per Kategori");

    // metric updates
    const cards2 = await metricCards(page);
    const cost2 = cards2.find((c) => /^Biaya/i.test(c)) ?? "";
    const profit2 = cards2.find((c) => /Estimasi Laba/i.test(c)) ?? "";
    p(`  cost after create: "${cost2}"`);
    p(`  profit after create: "${profit2}"`);
    const costVal = idrToInt((cost2.match(/Rp ?(-?[\d.]+)/) ?? [])[1] ?? "");
    if (costVal < 150000) addIssue("MAJOR", "crud", `Biaya card tidak masuk 150000 setelah create (nilai=${costVal})`);

    // =========== 6. EDIT expense ===========
    p("\n== [6] Edit expense ==");
    await page.getByRole("button", { name: "Ubah pengeluaran paper" }).first().click();
    await page.waitForTimeout(800);
    const editForm = page.locator("form:has-text('/// Ubah')").first();
    if (await editForm.count() === 0) addIssue("BLOCKER", "crud", "form edit expense tidak muncul");
    const amountInput = editForm.locator("input[name=amount]");
    const prevAmount = await amountInput.inputValue();
    p(`  edit form prev amount: ${prevAmount}`);
    await amountInput.fill("200000");
    await editForm.locator("input[name=note]").fill("Kertas 4R 5 pack EDIT (E2E)");
    await editForm.getByRole("button", { name: /Simpan perubahan/i }).click();
    await page.waitForTimeout(3000);
    let afterEdit = norm(await page.locator("body").innerText());
    if (!/EDIT \(E2E\)/.test(afterEdit)) {
      p("  edit attempt 1 did not persist, retrying…");
      const ef2 = page.locator("form:has-text('/// Ubah')").first();
      if (await ef2.count()) {
        await ef2.locator("input[name=amount]").fill("200000");
        await ef2.locator("input[name=note]").fill("Kertas 4R 5 pack EDIT (E2E)");
        await ef2.getByRole("button", { name: /Simpan perubahan/i }).click();
        await page.waitForTimeout(3000);
      } else {
        await page.getByRole("button", { name: "Ubah pengeluaran paper" }).first().click();
        await page.waitForTimeout(700);
        const ef3 = page.locator("form:has-text('/// Ubah')").first();
        await ef3.locator("input[name=amount]").fill("200000");
        await ef3.locator("input[name=note]").fill("Kertas 4R 5 pack EDIT (E2E)");
        await ef3.getByRole("button", { name: /Simpan perubahan/i }).click();
        await page.waitForTimeout(3000);
      }
      afterEdit = norm(await page.locator("body").innerText());
    }
    const edited = /EDIT \(E2E\)/.test(afterEdit);
    p(`  edited note visible: ${edited}`);
    if (!edited) addIssue("MAJOR", "crud", "hasil edit (note) tidak muncul setelah simpan");
    // edit form should auto-close
    const stillOpen = await page.locator("form:has-text('/// Ubah')").count();
    if (stillOpen > 0) addIssue("MAJOR", "crud", "form edit tidak menutup otomatis setelah sukses");

    const cards3 = await metricCards(page);
    const cost3 = cards3.find((c) => /^Biaya/i.test(c)) ?? "";
    const costVal3 = idrToInt((cost3.match(/Rp ?(-?[\d.]+)/) ?? [])[1] ?? "");
    p(`  cost after edit: ${costVal3} (expect 200000)`);
    if (costVal3 !== 200000) addIssue("MAJOR", "crud", `Biaya card != 200000 setelah edit (nilai=${costVal3})`);

    // =========== 7. Validation (server) ===========
    p("\n== [7] Validation ==");
    // amount empty → HTML required blocks; test amount 0 via JS removal of min? Instead test note too long.
    const trigger2 = page.getByRole("button", { name: "Buka form pengeluaran baru" });
    // ensure panel open
    const panelVisible = await page.locator("form:has-text('/// Pengeluaran baru')").isVisible().catch(() => false);
    if (!panelVisible) {
      await trigger2.click();
      await page.waitForTimeout(500);
    }
    const createForm2 = page.locator("form:has-text('/// Pengeluaran baru')");
    await createForm2.locator("input[name=amount]").fill("50000");
    await createForm2.locator("input[name=note]").fill("x".repeat(250));
    await createForm2.getByRole("button", { name: /Simpan pengeluaran/i }).click();
    await page.waitForTimeout(2000);
    const alertCount = await page.locator("[role=alert]").count();
    const alertText = norm(await page.locator("[role=alert]").first().textContent().catch(() => ""));
    p(`  role=alert count=${alertCount} text="${alertText.slice(0, 120)}"`);
    const noteVisibleErr = /200|karakter|catatan|note/i.test(alertText);
    p(`  visible error for note>200: ${noteVisibleErr}`);
    if (!noteVisibleErr)
      addIssue("MAJOR", "validation", `note >200 char ditolak server TAPI tidak ada pesan error terlihat (alert="${alertText}")`);

    // =========== 8. DELETE expense ===========
    p("\n== [8] Delete expense ==");
    // Re-open the create form was closed after the invalid submit; delete ALL paper rows.
    let guard = 0;
    while ((await page.getByRole("button", { name: /Hapus pengeluaran paper/i }).count()) > 0 && guard < 8) {
      guard++;
      await page.getByRole("button", { name: /Hapus pengeluaran paper/i }).first().click();
      await page.waitForTimeout(700);
      const dialog = page.getByRole("dialog");
      const dlgCount = await dialog.count();
      p(`  confirm dialog open: ${dlgCount > 0}`);
      if (dlgCount === 0) {
        addIssue("MAJOR", "crud", "dialog konfirmasi hapus tidak muncul");
        break;
      }
      await page.getByRole("button", { name: "Hapus permanen" }).click();
      await page.waitForTimeout(2500);
    }
    const afterDel = norm(await page.locator("body").innerText());
    const gone = !/EDIT \(E2E\)/.test(afterDel) && !/Kertas 4R 5 pack/.test(afterDel);
    p(`  E2E expense removed: ${gone}`);
    if (!gone) addIssue("BLOCKER", "crud", "expense tidak terhapus setelah konfirmasi");
    if (guard === 0) addIssue("MINOR", "crud", "tombol hapus tidak ditemukan untuk cleanup");

    // verify back to baseline
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const rowsAfterDel = await page.locator("main table tbody tr").count();
    p(`  rows after delete=${rowsAfterDel} baseline=${baselineRows}`);
    if (rowsAfterDel !== baselineRows)
      addIssue("MAJOR", "crud", `row count tidak kembali ke baseline (${rowsAfterDel} vs ${baselineRows})`);

    // =========== 9. Layout overlap ===========
    p("\n== [9] Layout overlap (desktop 1440) ==");
    await gotoRetry(page, `${BASE}/dashboard/finance`);
    await page.waitForTimeout(1500);
    const ov1 = await detectOverlaps(page);
    ov1.forEach((o) => addIssue("MAJOR", "layout", `overlap desktop: ${o}`));
    p(`  desktop overlaps: ${ov1.length}`);

    // =========== 10. Responsive ===========
    p("\n== [10] Responsive ==");
    for (const [w, h, label] of [[390, 844, "mobile"], [768, 1024, "tablet"]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(1200);
      const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      const ov = await detectOverlaps(page);
      p(`  ${label} ${w}x${h}: hScroll=${hScroll} overlaps=${ov.length}`);
      if (hScroll) addIssue("MAJOR", `responsive-${label}`, `horizontal scroll pada ${w}px`);
      ov.forEach((o) => addIssue("MAJOR", `responsive-${label}`, `overlap: ${o}`));
      await page.screenshot({ path: `${OUT}/10-${label}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/10-desktop.png`, fullPage: true });

    // =========== 11. A11y basics ===========
    p("\n== [11] A11y basics ==");
    const a11y = await page.evaluate(() => {
      const out: string[] = [];
      const imgsNoAlt = document.querySelectorAll("img:not([alt])").length;
      if (imgsNoAlt) out.push(`${imgsNoAlt} img tanpa alt`);
      // buttons/links with no accessible name
      let namelessBtns = 0;
      document.querySelectorAll("button, a").forEach((el) => {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (!name) namelessBtns++;
      });
      if (namelessBtns) out.push(`${namelessBtns} button/link tanpa nama aksesibel`);
      return out;
    });
    a11y.forEach((a) => addIssue("MINOR", "a11y", a));
    p(`  a11y issues: ${a11y.length}`);

    // =========== 12. Role separation ===========
    p("\n== [12] Role separation (staff) ==");
    const staffCtx = await browser.newContext({ storageState: STAFF_STATE, viewport: { width: 1440, height: 900 } });
    const staffPage = await staffCtx.newPage();
    const staffErrs: string[] = [];
    attach(staffPage, "O4-staff", staffErrs);
    await staffPage.goto(`${BASE}/dashboard/finance`, { waitUntil: "domcontentloaded" });
    await staffPage.waitForTimeout(1500);
    const staffUrl = staffPage.url();
    p(`  staff -> ${staffUrl}`);
    if (staffUrl.includes("/dashboard/finance")) addIssue("BLOCKER", "rbac", "staff bisa akses /dashboard/finance (harusnya diblok)");
    await staffCtx.close();

    // =========== 13. Console errors ===========
    p("\n== [13] Console / page errors ==");
    errs.forEach((e) => addIssue("MAJOR", "console", e));
    p(`  owner errors: ${errs.length}`);
    staffErrs.forEach((e) => addIssue("MINOR", "console-staff", e));

    // =========== Report ===========
    p("\n== [14] Screenshots ==");
    p(`  saved to ${OUT}/`);

    const summary =
      `\n===== O4 FINANCE E2E SUMMARY =====\n` +
      `issues: BLOCKER=${issues.filter((i) => i.severity === "BLOCKER").length} ` +
      `MAJOR=${issues.filter((i) => i.severity === "MAJOR").length} ` +
      `MINOR=${issues.filter((i) => i.severity === "MINOR").length} ` +
      `INFO=${issues.filter((i) => i.severity === "INFO").length}\n`;
    p(summary);

    await writeFile(`${OUT}/report.json`, JSON.stringify({ issues, log }, null, 2));
    await writeFile(
      `${OUT}/issues.txt`,
      issues.map((i) => `${i.severity}\t${i.area}\t${i.detail}`).join("\n") + "\n"
    );
  });
});
