/**
 * Aturan jumlah capture saat finalize — pure agar bisa diuji tanpa DB.
 *
 * Normal: jumlah capture harus sama persis dengan slot frame/paket.
 * Sesi yang sudah lewat timer (paid) boleh finalize dengan capture parsial:
 * customer sudah membayar, jadi hasil yang ada tetap diproses (docs/05 §5.1b).
 * Kelebihan capture tetap ditolak (anti manipulasi kuota).
 */
export function captureCountAllowed(args: {
  expired: boolean;
  captureCount: number;
  expected: number;
}): boolean {
  const { expired, captureCount, expected } = args;
  if (!Number.isInteger(captureCount) || !Number.isInteger(expected)) return false;
  if (captureCount === expected) return true;
  if (!expired) return false;
  return captureCount < expected;
}
