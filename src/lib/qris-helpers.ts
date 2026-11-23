/**
 * Pure QRIS helpers (shared provider utilities) — docs/06 §6.3/§6.7.
 * Provider aktif: Tripay/Midtrans. Helper order ID + parsing nominal/status
 * dipakai adapter gateway dan webhook.
 * Berisi helpers umum (parseProviderAmount, buildOrderId, dll.).
 * Tanpa import server agar bisa di-unit-test.
 * Provider mengirim nominal sebagai string desimal ("1016.00") → integer IDR.
 */

/** "1016.00" / 1016 / "1.016" (rawak) → 1016 integer IDR; invalid → null. */
export function parseProviderAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  // Provider bisa mengirim ribuan dengan separator titik ("1.234.567") ATAU
  // desimal ("1016.00"). Aman: buang spasi, lalu bila ada LEBIH dari satu
  // titik → semua titik adalah separator ribuan (hapus semua); satu titik
  // (atau nol) → titik desimal dipertahankan. Mencegah "1.234.567" rusak
  // menjadi "1234.567" lalu dibulatkan salah ke 1235.
  const raw = value.trim().replace(/\s/g, "");
  const dotCount = (raw.match(/\./g) ?? []).length;
  const normalized = dotCount > 1 ? raw.replace(/\./g, "") : raw;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/** Order ID unik SnapyOS → dikirim ke provider: SnapyOS-XXXXXXXXXXXX. */
export function buildOrderId(rand: string): string {
  return `SnapyOS-${rand.toUpperCase()}`;
}

/** Datetime provider → ISO. Offset eksplisit dipertahankan; format tanpa offset = WIB. */
export function parseProviderDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const withoutZone = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/;
  const local = raw.match(withoutZone);
  const normalized = withZone.test(raw)
    ? raw
    : local
      ? `${local[1]}T${local[2]}${local[3] ?? ""}+07:00`
      : "";
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
