# POS Add-on — Phase 8: Testing Konsolidasi (REVISI v2)

> Status: **SELESAI (parsial) — dieksekusi 2026-08-30.** 4 file test POS + extend rbac hijau; `tests/pos-orders.test.ts` dibuat pada eksekusi docs-sync 2026-08-30.
> Prasyarat: seluruh fase implementasi + perbaikan security selesai.
> Revisi v2: test webhook/side-effects payment POS dihapus (Phase 4 dibatalkan); fokus order/pay-manual/booth/report.

---

## Daftar Isi

1. Objective
2. Inventory Test POS
3. Regression Suite Existing (wajib tetap hijau tanpa modifikasi)
4. Perintah Eksekusi
5. Laporan Hasil (diisi saat eksekusi)
6. Rollback
7. Acceptance Criteria

---

## 1. Objective

Konsolidasi seluruh test POS + memastikan nol regresi existing. Semua unit test murni tanpa network (pola repo: mock supabase di level module).

---

## 2. Inventory Test POS

| File                            | Cakupan                                                                                                                                         | Dibuat di |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `tests/pos-math.test.ts`        | subtotal/gross/discount-hook/qty/number format WIB + retry-on-conflict                                                                          | Phase 3   |
| `tests/pos-validators.test.ts`  | schema produk/order (photoboxId wajib)/manual-pay (enum cash/bank_transfer/other), qty bound, items min/max                                     | Phase 3   |
| `tests/pos-entitlement.test.ts` | hasPosEntitlement × status subscription × add-on status; POS_NOT_SUBSCRIBED                                                                     | Phase 2   |
| `tests/rbac.test.ts` (extend)   | matrix owner/manager/staff + `pos:*` (staff sell/read ✅, manage ❌)                                                                            | Phase 2   |
| `tests/pos-orders.test.ts`      | create/cancel/pay-manual: scoping 404/403/409, POS_BOOTH_DISABLED, snapshot, stock pre-check, pay 2× → 1 transactions row, balances tak berubah | Phase 3   |
| `tests/pos-reports.test.ts`     | split POS/kiosk, by-product/booth/cashier, snapshot regression, export kolom SUMBER                                                             | Phase 5   |

Estimasi total kasus: ±45. Setiap kasus punya nama deskriptif pola existing (`test("...")`).

---

## 3. Regression Suite Existing (wajib hijau tanpa modifikasi)

- `tests/admin.test.ts`, `phase1..11`, `exit-pin`, seluruh file existing (`node --test tests/*.test.ts`).
- Fokus review hasil: idempotency payment kiosk, checkout math, settlement/withdrawal math, RBAC lama, subscription-math.
- Larangan: **TIDAK ada test existing yang di-edit agar lulus**. Merah = bug regresi → fix kode, bukan test.
- Verifikasi tambahan: diff `src/server/payment/*` vs baseline = kosong (POS v2 tidak menyentuh payment — docs/pos/07 §3 item 7).

---

## 4. Perintah Eksekusi

```bash
npm run test          # node --test tests/*.test.ts
npm run lint
npm run typecheck
npm run build         # smoke: production build tanpa error
```

---

## 5. Laporan Hasil

> Diisi saat eksekusi: tanggal, jumlah pass/fail, catatan.

Status aktual per audit 2026-08-30:

- Ada: `tests/pos-math.test.ts`, `tests/pos-validators.test.ts`, `tests/pos-entitlement.test.ts`, `tests/pos-reports.test.ts` + `tests/rbac.test.ts` extend `pos:*` (owner/manager/staff). Seluruh suite 203/203 pass (23 file).
- **`tests/pos-orders.test.ts`: BELUM ADA saat audit — dibuat pada eksekusi docs-sync ini (lihat hasil update di bawah; unit murni: schema order/manual-pay, `computePosTotals` edge case, `posOrderNumber` WIB, `posDayRange`, evaluator entitlement).** Kasus action negative ber-DB (scoping 404/403/409 live) tetap tidak tercakup — repo tidak punya harness integrasi DB; cakupan via pola "server tipis + lib murni".
- Regression existing: tidak ada test existing yang dimodifikasi (verifikasi §3 lulus).

| Tanggal    | Suite                                                   | Pass                             | Fail | Catatan                                                                          |
| ---------- | ------------------------------------------------------- | -------------------------------- | ---- | -------------------------------------------------------------------------------- |
| 2026-08-30 | `node --test tests/*.test.ts` (23 file)                 | 203                              | 0    | Audit pra docs-sync; POS math/validators/entitlement/reports + rbac extend hijau |
| 2026-08-30 | + `tests/pos-orders.test.ts` (baru, eksekusi docs-sync) | lihat laporan akhir eksekusi ini | 0    | Unit murni tanpa network (pola repo)                                             |

---

## 6. Rollback

n/a (test additive; kegagalan = fix kode implementasi).

---

## 7. Acceptance Criteria

1. Semua suite (existing + POS) hijau; `lint`, `typecheck`, `build` bersih.
2. §5 terisi; coverage manual per alur POS terdokumentasi (pilih booth → grid produk → order → bayar tunai → struk → report).
3. Tidak ada test existing yang dimodifikasi.

**STATUS: PHASE 8 — SELESAI (parsial): 4 file POS + rbac extend hijau; `pos-orders.test.ts` ditambahkan pada eksekusi docs-sync 2026-08-30.**
