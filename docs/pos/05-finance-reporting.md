# POS Add-on — Phase 5: Finance & Reporting (REVISI v2)

> Status: **SELESAI — dieksekusi 2026-08-28.**
> Prasyarat: Phase 3 selesai (transaksi POS offline masuk `transactions`).
> Revisi v2: tidak ada relax NOT NULL dan tidak ada creditBalance POS → fase ini murni verifikasi + breakdown, tanpa perbaikan null-safety besar.

---

## Status Eksekusi

Dieksekusi 2026-08-28. Yang jadi:

- `src/server/pos-reports.ts`: `posRevenueReport`, `posBreakdownReport` (by product/cashier/outlet/booth/day), `posVsKioskSplit` — semua `requirePosAccess` + `pos:read`, scoped `.eq(business_id)`.
- Logika agregasi pure diekstrak ke `src/lib/pos-reports-math.ts` (deviasi kecil dari §4 — agar unit-testable tanpa DB, pola repo).
- UI: panel laporan di `/dashboard/pos` (`src/components/dashboard/PosReportsPanel.tsx` — deviasi dari peta "komponen di `src/components/pos/`").
- Test: `tests/pos-reports.test.ts`.
- Prinsip double-count §9 terjaga: revenue selalu dari `transactions`; `pos_orders` hanya breakdown.

---

## Daftar Isi

1. Objective & Scope
2. Yang Otomatis (nol kode) vs Yang Ditambah
3. Verifikasi Kolom POS (pengganti R11)
4. `src/server/pos-reports.ts`
5. UI Dashboard & Admin
6. Export
7. Security
8. Testing
9. Risk & Mitigasi
10. Rollback
11. Acceptance Criteria

---

## 1. Objective & Scope

- POS otomatis masuk semua report berbasis `transactions` (finance/summary, metrics, analytics/*, reports export, admin payments/summary) — **verifikasi, bukan rewrite**.
- Tambah: breakdown POS spesifik (by product/cashier/outlet/booth/method/day) + split POS vs kiosk + badge sumber di UI transactions.
- ~~Null-safety `outlet_id`/`photobox_id` (R11)~~ — **GUGUR (v2)**: kolom TIDAK di-relax; POS selalu mengisi `photobox_id` (booth) + `outlet_id` (dari booth).

---

## 2. Yang Otomatis vs Yang Ditambah

| Report | Status |
|---|---|
| `finance/summary` (revenue/tx count by period) | ✅ otomatis (agregasi by status+business) — verifikasi angka dengan data POS |
| `analytics/revenue/by-outlet` | ✅ otomatis — POS selalu punya outlet (dari booth) → bucket terisi normal |
| `analytics/revenue/by-package` | ⚠️ otomatis; POS row package NULL → **exclude dari by-package** + footnote `/// termasuk transaksi POS non-paket` |
| `analytics/revenue/by-payment-method` | ✅ otomatis (cash/bank_transfer/other dari POS masuk bucket masing-masing) |
| `analytics/revenue/by-photobox` | ✅ otomatis — POS punya photobox_id (booth) → masuk bucket booth |
| `metrics`, admin `payments/summary` | ✅ otomatis — verifikasi |
| reports CSV/XLSX | ✅ otomatis (row transactions POS ikut); tambah kolom `sumber` (`POS`/`KIOSK`) |
| Breakdown by product/cashier/booth; split POS vs kiosk | ❌ BARU — `pos-reports.ts` (§4) |

---

## 3. Verifikasi Kolom POS (pengganti R11)

Tidak ada perubahan tipe/nullability — verifikasi saja saat eksekusi:

1. Row `transactions` POS: `outlet_id` & `photobox_id` TERISI (dari booth), `session_id`/`package_id` NULL — cek by-package aggregator menangani package NULL dengan pola existing (manual transaction sudah menyediakan preseden).
2. Angka summary data tanpa POS identik sebelum/sesudah (snapshot regression dev).

Kriteria: `npm run typecheck` hijau + snapshot diff = 0 untuk data pure-kiosk.

---

## 4. `src/server/pos-reports.ts`

```
posRevenueReport(userId, businessId, { from, to })
  → requirePosAccess + can(pos:read)
  → dari pos_orders status='paid' (paid_at in range):
     { totalGross, totalDiscount, totalFinal, count, byMethod, byStatus }

posBreakdownReport(userId, businessId, { from, to, groupBy })
  groupBy='product'  → Σ qty + Σ subtotal dari pos_order_items join orders
                       (pakai name_snapshot — bukan nama produk sekarang)
  groupBy='cashier'  → join users (name) via pos_orders.cashier_user_id
  groupBy='outlet'   → join outlets
  groupBy='booth'    → join photoboxes (per-booth performance — relevan karena POS per booth)
  groupBy='day'      → date_trunc('day', paid_at)

posVsKioskSplit(userId, businessId, { from, to })
  → dari transactions: Σ final + count WHERE pos_order_id IS NOT NULL vs IS NULL
     (satu query, coalesce)
```

Semua int IDR; semua scoped `.eq(business_id)`; range `from/to` zod-validated; timezone UTC hari-penuh pola existing (`transactions.ts:119-120`).

Admin (`src/server/admin.ts` tambah kecil): revenue POS per tenant = agregasi `transactions where pos_order_id not null` group by business — satu fungsi `adminPosRevenueSummary()` + panel di `/admin/payments` atau `/admin/businesses` detail.

---

## 5. UI Dashboard & Admin

- `/dashboard/pos` section `/// LAPORAN POS`: metric grid (revenue, tx, rata-rata, metode dominan) + tabel breakdown (tab: PRODUK/KASIR/OUTLET/BOOTH/HARI — hand-rolled tab bar border 2px) + filter tanggal. Chart recharts bar (komponen chart existing) untuk by-day.
- `/dashboard/transactions`: kolom `SUMBER` → `StatusBadge` varian `POS` / `—` (dari `pos_order_id not null`); filter `?source=pos`.
- `/dashboard/finance`: footnote `/// mencakup transaksi POS (offline)` (angka sudah termasuk — jangan double count).
- Admin: panel revenue POS per tenant (§4).

---

## 6. Export

- `reports.ts` existing: tambah kolom `SUMBER` di export transactions (turunan `pos_order_id`); formula-injection guard generator sama (tidak disentuh logikanya).
- Export breakdown POS v1: **tidak dibuat** (UI cukup; export menyusul bila diminta — YAGNI).

---

## 7. Security

- `pos-reports.ts`: `requirePosAccess` + `pos:read` (staff bisa lihat ringkasan — v1 breakdown cashier terlihat semua operator untuk `pos:read`; pembatasan per-staff = keputusan produk lanjutan, non-goal).
- Admin summary: `requireAdmin`.
- Semua query scoped business_id.

---

## 8. Testing

| Test | File | Kasus |
|---|---|---|
| Agregasi campuran | `tests/pos-reports.test.ts` (mock) | data kiosk+POS → split benar; by-product pakai snapshot; by-cashier join; by-booth join; day bucket |
| Snapshot regression | extend test transactions/analytics existing | angka summary data-pure-kiosk identik sebelum/sesudah |
| Export | extend test reports existing | kolom SUMBER; karakter `=`/`+`/`-`/`@` di name tetap di-escape |
| Rekon silang manual | dev | Σ pos_orders.paid = Σ transactions(pos_order_id) per hari; saldo/ledger TIDAK berubah oleh POS (offline — A3) |

---

## 9. Risk & Mitigasi

| Risiko | Mitigasi |
|---|---|
| R6 laporan berubah makna | Footnote eksplisit + exclude-by-design di by-package; snapshot regression dev |
| Double count POS (pos_orders + transactions dipakai bareng) | Aturan: REVENUE SELALU dari `transactions`; `pos_orders` hanya untuk breakdown detail |
| POS dianggap menaikkan saldo | Tidak ada `creditBalance` di jalur POS (A3) — test assert balances/ledger tidak berubah setelah pay |

---

## 10. Rollback

- Revert perubahan analytics/transactions/reports (additive label/kolom); hapus `pos-reports.ts` + UI section. Angka inti tidak pernah bergantung pada perubahan fase ini.

---

## 11. Acceptance Criteria

1. Admin melihat revenue POS per tenant/tanggal; owner melihat breakdown per produk/kasir/outlet/booth/hari.
2. Rekon silang dev: pos_orders Σ = transactions POS Σ (dokumentasi hasil di Lampiran saat eksekusi); balances + balance_ledger identik sebelum/sesudah transaksi POS.
3. Data pure-kiosk: semua angka existing identik (snapshot diff = 0).
4. Export CSV transactions memuat kolom SUMBER, aman formula-injection.
5. Semua test + lint + typecheck hijau.

**STATUS: PHASE 5 — SELESAI. Dieksekusi 2026-08-28 (lihat Status Eksekusi di atas).**
