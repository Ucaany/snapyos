# TEST RESULTS

Tanggal: 2026-11-13. Environment: macOS (darwin), Node >= 22.18, Next 16.4.2.

## Gate yang dijalankan

| Gate | Perintah | Hasil | Bukti |
|---|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** | exit 0, tanpa error |
| ESLint | `npm run lint` | **PASS** | 0 error, 10 warning `no-img-element` (pre-existing) |
| Unit test | `npm test` | **PASS** | 52/52 |
| Production build | `npm run build` | **PASS** | exit 0, standalone siap |

## Unit test baru

`src/lib/kiosk-capture.test.ts` — 5 test untuk aturan capture parsial (K-002):

- capture pas diterima walau sesi belum expired
- capture kurang ditolak saat sesi masih berjalan
- capture parsial diterima saat sesi sudah expired (paid)
- capture berlebih tetap ditolak walau expired
- input bukan integer ditolak

## Gate yang TIDAK dijalankan

| Gate | Alasan | Status |
|---|---|---|
| E2E browser (Playwright) | Tidak ada Playwright MCP / dependency | NOT VERIFIED |
| Screenshot before/after | Tidak ada browser automation | NOT VERIFIED |
| Kamera fisik | Tidak ada perangkat | NOT VERIFIED |
| Printer CUPS fisik | Tidak ada perangkat | NOT VERIFIED |
| Redis multi-instance | Tidak ada instance Redis | NOT VERIFIED |
| Migrasi DB | Tidak ada akses DB produksi | NOT VERIFIED |
| `npm audit` | Tidak dijalankan sesi ini | NOT VERIFIED |

## Catatan

- Build menghasilkan 93+ route; tidak ada route yang hilang.
- Warning lint hanya `@next/next/no-img-element` pada komponen marketing yang
  sudah ada sebelumnya, bukan dari perubahan remediasi.
