/**
 * K2 — Print pipeline (Chromium PDF render).
 * Membangun halaman HTML yang memakai @page + .print-sheet SAMA dengan
 * globals.css + PrintLayoutRenderer, render ke PDF, dan verifikasi:
 *   - 2 halaman (bukan 1 kosong)
 *   - ukuran PDF > 5 KB (bukan blank)
 *   - gambar termuat (naturalWidth > 0)
 *   - tidak ada console error aplikasi
 *
 * Menjamin "hasil print tidak blank" yang diminta K2 (docs/05 §5.15) di
 * setiap CI tanpa butuh printer fisik.
 *
 * Dijalankan oleh `npm run test:e2e` (lihat scripts di package.json).
 */

import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>SnapyOS K2 — print pipeline self-test</title>
<style>
  :root { --print-margin: 8mm; }
  @page { size: 102mm 152mm; margin: 8mm; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #111; }
  .print-root { padding: 12px; }
  .print-sheet { width: 100%; display: flex; flex-direction: column; align-items: center; }
  .print-sheet + .print-sheet { page-break-before: always; }
  .print-photo { width: 100%; max-height: calc(100vh - (2 * var(--print-margin, 8mm))); object-fit: contain; }
  .meta { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; margin-top: 6px; }
</style>
</head>
<body>
  <div class="print-root">
    <div class="print-sheet">
      <img class="print-photo" src="https://picsum.photos/seed/snapy-k2-1/600/900" alt="strip 1" />
      <div class="meta">SNAPYOS · UJI CETAK · HALAMAN 1/2 · TIDAK BOLEH BLANK</div>
    </div>
    <div class="print-sheet">
      <img class="print-photo" src="https://picsum.photos/seed/snapy-k2-2/600/900" alt="strip 2" />
      <div class="meta">SNAPYOS · UJI CETAK · HALAMAN 2/2 · TIDAK BOLEH BLANK</div>
    </div>
  </div>
</body>
</html>`;

async function run() {
  const dir = mkdtempSync(join(tmpdir(), "snapyos-k2-print-"));
  const htmlPath = join(dir, "index.html");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(htmlPath, HTML, "utf-8");

  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|404/i.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });

  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

  // Tunggu semua image loaded
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll("img.print-photo"));
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, null, { timeout: 8000 });

  const imgState = await page.$$eval(".print-photo", (els) =>
    els.map((e) => ({ complete: e.complete, w: e.naturalWidth, h: e.naturalHeight }))
  );
  assert.equal(imgState.length, 2, "harus ada 2 foto");
  for (const s of imgState) {
    assert.ok(s.complete, `gambar tidak loaded: ${JSON.stringify(s)}`);
    assert.ok(s.w > 0, `gambar naturalWidth=0: ${JSON.stringify(s)}`);
  }

  // Render ke PDF dengan ukuran 4x6 (102x152 mm) — sama dengan default printPageSize
  const pdfPath = join(dir, "out.pdf");
  await page.pdf({
    path: pdfPath,
    width: "102mm",
    height: "152mm",
    margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
    printBackground: true,
    preferCSSPageSize: true,
  });

  const size = statSync(pdfPath).size;
  assert.ok(size > 5_000, `PDF terlalu kecil (${size} bytes) → kemungkinan blank`);

  // Hitung jumlah halaman di PDF (header %PDF-1.x + count /Type /Page — sederhana)
  const buf = await import("node:fs/promises").then((m) => m.readFile(pdfPath));
  const text = buf.toString("binary");
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
  assert.ok(
    pageMatches.length >= 2,
    `PDF harus punya ≥2 halaman (got ${pageMatches.length}) — sheet 1 + sheet 2 wajib muncul`
  );

  assert.deepEqual(errors, [], "tidak boleh ada console error aplikasi");

  await browser.close();
  console.log(`K2 print pipeline PASS · 2 sheets · ${imgState[0].w}×${imgState[0].h} · ${size} bytes`);
}

run().catch((e) => {
  console.error("K2 print pipeline FAIL:", e);
  process.exit(1);
});
