/**
 * STRUK POS 58/80mm — transaksi nyata lalu byte struk diperiksa.
 *
 * Jalur: terminal POS → bayar tunai → halaman struk → tombol "Cetak SPP"
 * dengan mock Web Serial. Setiap baris teks dihitung lebar fisiknya memakai
 * ukuran font ESC/POS (GS !), sehingga regresi "terpotong" langsung gagal.
 */

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { config, requireServiceRole } from "./helpers/env.mjs";
import { launchKiosk } from "./helpers/browser.mjs";
import { installSerialMock, readSerialBytes, resetSerialBytes } from "./helpers/serial-mock.mjs";
import { createReporter } from "./helpers/report.mjs";
import { acquirePrintLock } from "./helpers/print-lock.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("pos-receipt-serial");
const sb = createClient(cfg.supabaseUrl, cfg.serviceKey, {
  auth: { persistSession: false },
});
const session = JSON.parse(readFileSync(".audit/browser/session-owner.json", "utf8"));
const businessId = "11111111-1111-4111-8111-111111111111";
const photoboxId = "33333333-3333-4333-8333-333333333332";

const { data: booth } = await sb
  .from("photoboxes")
  .select("print_settings")
  .eq("id", photoboxId)
  .maybeSingle();
const previous = booth?.print_settings ?? {};

/** Decode teks job: ukuran font aktif, perataan, dan baris. */
function decodeTextJob(bytes) {
  let size = 1;
  const lines = [];
  let current = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1d && bytes[i + 1] === 0x21) {
      const n = bytes[i + 2];
      size = (n >> 4) + 1;
      i += 2;
      continue;
    }
    if (b === 0x1b && (bytes[i + 1] === 0x61 || bytes[i + 1] === 0x45)) {
      i += 2;
      continue;
    }
    if (b === 0x1b && bytes[i + 1] === 0x64) {
      i += 2;
      continue;
    }
    if (b === 0x1d && bytes[i + 1] === 0x56) {
      i += 2;
      continue;
    }
    if (b === 0x1b && bytes[i + 1] === 0x40) {
      i += 1;
      continue;
    }
    if (b === 0x0a) {
      lines.push({ text: current, size });
      current = "";
      size = 1;
      continue;
    }
    if (b >= 0x20 && b <= 0x7e) current += String.fromCharCode(b);
  }
  if (current) lines.push({ text: current, size });
  return lines;
}

async function runOnce(paperWidthMm) {
  // Setelan ditulis SEBELUM lock dilepas; lock baru dilepas setelah browser
  // membaca struk, supaya suite Bluetooth tidak bisa mengubah lebar di tengah.
  const release = await acquirePrintLock();
  let context = null;
  let before = 0;
  let orderId = null;
  try {
    await sb
      .from("photoboxes")
      .update({
        print_settings: {
          ...previous,
          mode: "bluetooth",
          bluetooth_paper_width_mm: paperWidthMm,
        },
      })
      .eq("id", photoboxId);

    before = (
      await sb
        .from("pos_orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
    ).count;
    ({ context } = await launchKiosk({
      headed: true,
      viewport: { width: 1440, height: 1000 },
    }));
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 300));
    });
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
    await installSerialMock(page);
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: session.token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "snapyos_active_business",
        value: businessId,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);

    await page.goto(`${cfg.base}/pos/terminal?photobox=${photoboxId}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: /Kacamata/i })
      .first()
      .click({ timeout: 20_000 });
    await page
      .getByRole("button", { name: /^Bayar/ })
      .first()
      .click();
    // Dev compile server action bisa lambat pada mesin dingin; nomor order di
    // dialog dipakai untuk cleanup walau alur gagal sebelum URL struk.
    await page.getByRole("dialog").waitFor({ timeout: 90_000 });
    const dialogText = await page.getByRole("dialog").innerText();
    const orderNumber = dialogText.match(/POS-\d{8}-\d{4}/)?.[0];
    if (orderNumber) {
      const { data: created } = await sb
        .from("pos_orders")
        .select("id")
        .eq("business_id", businessId)
        .eq("number", orderNumber)
        .maybeSingle();
      orderId = created?.id ?? null;
    }
    await page
      .getByRole("button", { name: /^Tunai$/ })
      .first()
      .click();
    await page.waitForURL(/\/pos\/receipt\//, { timeout: 20_000 });
    await page.waitForTimeout(1200);
    orderId = page.url().match(/\/pos\/receipt\/([0-9a-f-]+)/)?.[1] ?? null;
    report.record(`${paperWidthMm}mm: transaksi membuka struk`, Boolean(orderId));

    await resetSerialBytes(page);
    await page.getByRole("button", { name: /Cetak SPP/i }).click();
    await page.getByText(/Perintah struk terkirim/i).waitFor({ timeout: 20_000 });
    const bytes = await readSerialBytes(page);
    report.record(
      `${paperWidthMm}mm: job struk terkirim`,
      bytes.length > 100,
      `bytes=${bytes.length}`
    );

    const lines = decodeTextJob(bytes).filter((line) => line.text.trim().length > 0);
    const columns = paperWidthMm === 58 ? 32 : 48;
    const overflow = lines.filter((line) => line.text.length * line.size > columns);
    report.record(
      `${paperWidthMm}mm: semua baris muat ${columns} kolom`,
      overflow.length === 0,
      overflow
        .map((line) => `${line.text}(${line.text.length * line.size})`)
        .join(" | ")
        .slice(0, 300)
    );
    report.record(
      `${paperWidthMm}mm: total dan nominal ada`,
      lines.some((line) => line.text.startsWith("TOTAL") && /Rp [\d.]+/.test(line.text)),
      lines.find((line) => line.text.startsWith("TOTAL"))?.text ?? "tidak ada"
    );
    report.record(
      `${paperWidthMm}mm: item dan terima kasih ada`,
      lines.some((line) => /KACAMATA/i.test(line.text)) &&
        lines.some((line) => /TERIMA KASIH/i.test(line.text))
    );
    const alerts = (await page.locator("[role=alert]").allTextContents())
      .map((text) => text.trim())
      .filter(Boolean);
    report.record(`${paperWidthMm}mm: tanpa alert error`, alerts.length === 0, alerts.join(" | "));
    report.record(
      `${paperWidthMm}mm: tanpa console/page error`,
      errors.length === 0,
      errors.join(" | ").slice(0, 300)
    );
  } catch (error) {
    report.record(`${paperWidthMm}mm: alur struk berjalan`, false, error.message);
  } finally {
    await context?.close();
    await release();
    if (orderId) {
      // transactions.pos_order_id ON DELETE SET NULL: hapus transaksi dulu,
      // kalau tidak laporan menyimpan baris yatim setelah fixture dibersihkan.
      await sb.from("transactions").delete().eq("pos_order_id", orderId);
      await sb.from("pos_order_items").delete().eq("pos_order_id", orderId);
      await sb.from("pos_orders").delete().eq("id", orderId);
    }
    const after = (
      await sb
        .from("pos_orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
    ).count;
    report.record(
      `${paperWidthMm}mm: fixture dibersihkan`,
      before === after,
      `${before}->${after}`
    );
  }
}

try {
  await runOnce(58);
  await runOnce(80);
} finally {
  await sb.from("photoboxes").update({ print_settings: previous }).eq("id", photoboxId);
  report.finish();
}
