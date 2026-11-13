# Remediation Report — Agent A (Kiosk Core, Session & Customer Flow)

## 1. Scope
K-001, K-002, K-003, K-004, K-007, K-008, K-026; verifikasi K-005, K-006,
K-009, K-011..K-017.

## 2. Findings Verified
- K-001: CSP tidak punya `media-src` → video eksternal diblokir. Terverifikasi.
- K-002: count validation menolak capture parsial saat timer habis.
- K-003: status `maintenance` tidak dicek di jalur transaksi; kiosk tidak
  merender layar perawatan.
- K-007: `color-mix()` di header editor tanpa fallback.
- K-008: QR memakai warna theme tanpa validasi kontras.
- K-026: paket sintetis resume memaksa `print_count: 0`.

## 3. Root Cause
Finalize memperlakukan capture parsial sebagai error mutlak; status booth hanya
dipakai untuk tampilan dashboard; resume menyusun paket dari subset field.

## 4. Changes Implemented
- `next.config.ts`: `media-src 'self' https: blob: data:`.
- `src/server/kiosk-sessions.ts`: tolak sesi baru saat maintenance; izinkan
  finalize capture parsial saat sesi expired lewat helper
  `captureCountAllowed`.
- `src/lib/kiosk-capture.ts` + test: aturan capture pure.
- `src/server/devices.ts`: expose `photoboxes.status`, kirim `print_count` di
  `active_session`.
- `src/components/kiosk/KioskApp.tsx`: layar maintenance; pakai `print_count`
  asli.
- `src/components/kiosk/Editor.tsx`: `mixHex()`.
- `src/components/kiosk/ResultScreen.tsx`: fallback QR `#111`/`#fff` bila
  kontras < 7:1.
- `src/server/payment/checkout-shared.ts`: `requireDevice` menolak maintenance.

## 5. Files Changed
`next.config.ts`, `src/server/kiosk-sessions.ts`, `src/server/devices.ts`,
`src/server/payment/checkout-shared.ts`, `src/components/kiosk/KioskApp.tsx`,
`src/components/kiosk/Editor.tsx`, `src/components/kiosk/ResultScreen.tsx`,
`src/lib/kiosk-capture.ts`, `src/lib/kiosk-capture.test.ts`, `package.json`.

## 6. Tests Executed
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 7. Test Results
PASS semua (typecheck 0 error, lint 0 error, test 52/52, build exit 0).

## 8. Before & After
Sebelum: timer habis → sesi paid gagal finalize; video background diblokir;
booth maintenance tetap bisa transaksi; resume menghapus hak cetak.
Sesudah: capture parsial diterima saat expired; video diizinkan; maintenance
ditolak backend dan dirender; `print_count` bertahan.

## 9. Remaining Issues
- K-004 state empty/error/offline belum semuanya terhubung.
- K-011/O-005 voucher per-customer butuh identitas.
- K-012/K-016/K-017 belum diverifikasi.
- Sesi 0 foto saat timer habis masih di-abort (tidak ada produk).

## 10. Risks
Capture parsial mengubah ekspektasi jumlah foto untuk sesi expired. Sudah
dibatasi: hanya bila `expired` dan tidak melebihi `expected`.

## 11. Finding Status
K-001 FIXED; K-002 FIXED; K-003 FIXED; K-007 FIXED; K-008 FIXED; K-026 FIXED;
K-004 PARTIALLY FIXED; K-005/K-006 FIXED (already in code); K-011 BLOCKED;
K-012/K-016/K-017 NOT VERIFIED.

## 12. Handover
Integration Lead perlu memastikan route checkout/payment memakai
`requireDevice` (sudah) dan tidak ada jalur transaksi yang memanggil
`resolveActiveDevice` langsung tanpa cek maintenance.
