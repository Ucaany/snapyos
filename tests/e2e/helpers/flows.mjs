/**
 * Langkah UI kiosk yang dipakai banyak spec. Tidak ada assertion di sini —
 * spec yang memutuskan apa yang harus benar.
 */

/** Welcome → (tutorial) → pilih paket pertama. `DEV_SKIP_PAYMENT=true` wajib
 *  agar paket langsung membuka sesi; tanpa itu spec harus menyelesaikan
 *  pembayaran sungguhan. */
export async function startPackage(page, packageName) {
  const start = page.getByRole("button", { name: /mulai|start/i });
  if (await start.isVisible().catch(() => false)) await start.click();
  const pkg = packageName
    ? page.getByRole("button", { name: new RegExp(packageName, "i") })
    : page.locator("button", { hasText: /Rp/ }).first();
  await pkg.first().click();
}

/** Pilih frame berdasarkan nama; `null` = kartu "Tanpa frame". */
export async function selectFrame(page, name) {
  const card = name
    ? page.getByRole("button", { name: new RegExp(name, "i") }).first()
    : page.getByRole("button", { name: /tanpa frame/i }).first();
  await card.click();
  await page.getByRole("button", { name: /gunakan frame/i }).click();
}

/** Ambil foto sebanyak slot: tekan tombol, tunggu review, konfirmasi. */
export async function captureAll(page, count) {
  for (let i = 0; i < count; i++) {
    const shutter = page.getByRole("button", { name: /ambil foto/i }).first();
    await shutter.waitFor({ state: "visible", timeout: 20_000 });
    await shutter.click();
    const next = page.getByRole("button", { name: /^lanjut( edit)?$/i }).first();
    await next.waitFor({ state: "visible", timeout: 20_000 });
    await next.click();
  }
}

/** Selesaikan editor dan tunggu layar print/result. */
export async function finishEditor(page) {
  await page
    .getByRole("button", { name: /^selesai$/i })
    .first()
    .click();
}
