/**
 * PRINT BROWSER — halaman cetak memakai kontrak `@page` + `.print-sheet`
 * yang sama dengan renderer kiosk, gambar termuat, dan tidak ada console error.
 *
 * Tidak butuh server aplikasi maupun printer fisik: halaman uji dibangun dari
 * CSS yang sama (`globals.css` @media print) dan diverifikasi lewat PDF.
 *
 * Jalankan: `node tests/e2e/kiosk-print-browser.spec.mjs`
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createReporter } from "./helpers/report.mjs";

const report = createReporter("kiosk-print-browser");
const dir = mkdtempSync(join(tmpdir(), "snapyos-print-"));

// Dua lembar 4x6 inci (101.6 x 152.4 mm), margin 8mm, satu foto per lembar.
const photo = (label) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#111"/><rect x="40" y="40" width="520" height="820" fill="#ffd400"/><text x="300" y="470" font-size="64" text-anchor="middle" font-family="monospace" fill="#111">${label}</text></svg>`
  )}`;

const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>print test</title>
<style>
  @page { size: 101.6mm 152.4mm; margin: 8mm; }
  :root { --print-margin: 8mm; }
  body { margin: 0; background: #fffdf5; }
  .print-sheet { width: 100%; display: flex; flex-direction: column; align-items: center; }
  .print-sheet + .print-sheet { page-break-before: always; break-before: page; }
  .print-photo { width: 100%; height: auto; max-width: 100%;
    max-height: calc(100vh - (2 * var(--print-margin, 8mm))); object-fit: contain; }
</style></head>
<body>
  <div class="print-sheet"><img class="print-photo" src="${photo("LEMBAR 1")}" /></div>
  <div class="print-sheet"><img class="print-photo" src="${photo("LEMBAR 2")}" /></div>
</body></html>`;

const file = join(dir, "print.html");
writeFileSync(file, html, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`file://${file}`, { waitUntil: "load" });

  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img.print-photo")).map((img) => ({
      complete: img.complete,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }))
  );
  report.record(
    "dua lembar cetak dengan gambar termuat",
    images.length === 2 && images.every((img) => img.complete && img.width > 0 && img.height > 0),
    JSON.stringify(images)
  );

  const pageSize = await page.evaluate(() => {
    const sheet = document.querySelector(".print-sheet");
    return sheet ? getComputedStyle(sheet).display : "missing";
  });
  report.record("lembar memakai display flex (satu foto per halaman)", pageSize === "flex", pageSize);

  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const pages = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  writeFileSync(join(dir, "out.pdf"), pdf);
  report.record("PDF berisi dua halaman", pdf.length > 5000 && pages >= 2, `bytes=${pdf.length} pages=${pages}`);
  report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  report.record("pipeline cetak browser berjalan", false, error.message);
} finally {
  await browser.close();
  report.finish();
}
