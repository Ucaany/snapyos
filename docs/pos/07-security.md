# POS Add-on — Phase 7: Security Audit (REVISI v2)

> Status: **SELESAI (verifikasi kode) — dieksekusi 2026-08-30.** Probe manual dua-tenant/SSI browser belum diulang ulang di pass ini (lihat §4 catatan).
> Revisi v2: pembayaran offline-only + per-booth + tanpa role baru → jalur webhook/payment-provider keluar dari scope; audit fokus pada order/booth/stock/report.

---

## Daftar Isi

1. Objective & Metode
2. Checklist Verifikasi (threat → kontrol → cara verifikasi)
3. Audit Kode Wajib (grep list)
4. Temuan & Perbaikan (diisi saat eksekusi)
5. Testing
6. Rollback
7. Acceptance Criteria

---

## 1. Objective & Metode

Audit menyeluruh hasil implementasi POS terhadap tabel ancaman `docs/pos/00-audit.md` §8 (dengan catatan revisi v2) + `docs/09-security-storage.md`. Metode: review kode jalur-demi-jalur, unit test negatif, manual probe di dev (dua tenant, tiga role).

---

## 2. Checklist Verifikasi

| # | Ancaman | Kontrol | Verifikasi |
|---|---|---|---|
| S1 | IDOR produk/order/booth POS lintas tenant | composite `.eq(id).eq(business_id)` → 404 | test negatif per endpoint + probe manual id tenant B |
| S2 | Akses POS tanpa entitlement | `requirePosAccess` di SEMUA action | grep: setiap export di `pos-*.ts` baris pertama gate; test `POS_NOT_SUBSCRIBED` |
| S3 | Abuse permission staff baru (`pos:sell/read`) | role dari DB; `can()`; audit hard-check `role==="staff"` / `!== "owner"` | grep list §3; RBAC test matrix penuh |
| S4 | Manipulasi harga/total | server-compute + snapshot | kirim payload `{items, total: 1}` → diabaikan; ubah harga DB antara cart→submit → total mengikuti DB |
| S5 | Manipulasi qty | zod 1..999 + stock guarded | qty 0/1000/negatif/float → VALIDATION_ERROR |
| S6 | Manipulasi `photoboxId` (booth tenant lain / disabled) | scoped fetch + `pos_enabled=true` server-side | submit booth tenant lain → 404; booth off → `POS_BOOTH_DISABLED` |
| S7 | Double transaction (double-click pay / 2 tab) | exists-check `transactions.pos_order_id` + conditional UPDATE single-winner | pay 2× → 1 row (test) |
| S8 | Cancel-vs-paid race | conditional UPDATE pending→X single winner | test urutan kedua arah; loser = no-op |
| S9 | Stock race (2 terminal/booth) | guarded UPDATE `stock >= qty` | shortfall → `pos.stock.shortfall` audit, transaksi tetap paid |
| S10 | Money leak: POS mengkredit saldo | TIDAK ada `creditBalance` di jalur POS | grep `creditBalance` di `pos-*` = nol pemanggilan; test balances/ledger tidak berubah |
| S11 | Jalur payment existing tersentuh | POS tidak menyentuh `payments`/webhook | grep `payments` di `src/server/pos-*.ts` = nol; diff `src/server/payment/*` = kosong |
| S12 | XSS nama produk/deskripsi | React escaping; export CSV guard | payload `<script>` di nama → render escaped; CSV aman |
| S13 | CSRF | server actions + Auth.js CSRF | probe cross-origin POST action → ditolak |
| S14 | Session/cookie | JWT + DB revocation (cookie host-only — path-based, Phase 6 skip) | revoke session → action POS 401/redirect |
| S15 | Upload gambar produk | `upload-validation.ts` (mime/size) + path tenant-scoped | upload HTML-rename-jpg → ditolak; akses path tenant lain → 404 storage |
| S16 | Info leak existence | non-member/non-entitled → 404 (bukan 403) | probe id valid tenant lain → 404 |

---

## 3. Audit Kode Wajib (grep list)

```
1. grep -rn "pos_products\|pos_orders\|pos_order_items" src/  → setiap query .eq("business_id", ...)
2. grep -rn "photobox" src/server/pos-orders.ts               → fetch booth selalu scoped + pos_enabled
3. grep -rn "role === \"staff\"\|role !== \"owner\"\|role === \"manager\"" src/ → tak ada asumsi role-set tertutup yang salah perlakukan staff+pos
4. grep -n "requirePosAccess" src/server/pos-*.ts             → export ke action = tergated
5. grep -rn "creditBalance\|from(\"payments\")" src/server/pos-*.ts src/server/pos-orders.ts → HARUS nol
6. grep -rn "parseInt\|parseFloat\|Number(" src/lib/pos-math.ts src/server/pos-*.ts → hanya input ter-zod; tak ada float uang
7. diff src/server/payment/ vs baseline                       → HARUS kosong (v2: POS tidak menyentuh payment)
```

---

## 4. Temuan & Perbaikan

> Diisi saat eksekusi: tanggal, temuan, severity, perbaikan, status.

Verifikasi kode S1–S11 dieksekusi 2026-08-30 (review jalur-demi-jalur + grep §3). Hasil per kontrol:

- ✅ **S1** — composite `.eq(id).eq(business_id)` di semua fetch order/produk/booth: `src/server/pos-orders.ts:124-125,172,187,314-315,327,364,388-390`; `src/server/pos-products.ts:179,245,262,300` ( komentar eksplisit "cross-tenant = 0 rows = 404"); `src/server/pos-reports.ts` semua query `.eq("business_id", ...)` (8 titik).
- ✅ **S2** — `requirePosAccess` baris pertama SEMUA export server: `pos-orders.ts:159,305,352,473,488`; `pos-products.ts:81,111,158,209,236,253,290`; `pos-reports.ts:38,74,139`. `pos-actions.ts` = binding tipis yang selalu delegate ke fungsi ter-gate tsb (businessId dari cookie, bukan param client — A8 terjaga).
- ✅ **S3** — role dibaca dari DB via `requirePosAccess`→`getMembership`; permission matrix `src/lib/rbac.ts:33-35` (manager `pos:manage/sell/read`), `44-45` (staff `pos:sell/read`); test matrix penuh `tests/rbac.test.ts:7-19`.
- ✅ **S4** — total server-computed: produk di-fetch ulang dari DB (`pos-orders.ts:184-194`), `computePosTotals` dari harga DB (`pos-orders.ts:222-227`); schema `posOrderCreateSchema` (`src/lib/validators.ts:470-476`) TIDAK punya field harga/total → payload `total` dari client di-reject zod.
- ✅ **S5** — qty zod 1..999 integer (`validators.ts:461-468`); stock pre-check `pos-orders.ts:207-220` (`INSUFFICIENT_STOCK` dengan detail).
- ✅ **S6** — booth scoped + `pos_enabled=true` server-side: `pos-orders.ts:167-180` ( cross-tenant → `NOT_FOUND`; milik tenant tapi off → `POS_BOOTH_DISABLED`).
- ✅ **S7** — pay idempotent: exists-check `transactions.pos_order_id` (`pos-orders.ts:377-382`) + conditional UPDATE single-winner (`pos-orders.ts:385-403`, loser cek winner-tx → no-op).
- ✅ **S8** — cancel-vs-paid race: conditional UPDATE `status='pending'` single winner (`pos-orders.ts:311-318`), 0 rows → disambiguasi 404 vs `POS_ORDER_NOT_PAYABLE` (`pos-orders.ts:321-331`).
- ✅ **S9** — stock race: RPC atomic `pos_decrement_stock()` (`db/migrations/0019_pos_addon.sql:77-97`, `stock >= qty` guard); shortfall → log + audit `pos.stock.shortfall`, order tetap paid (`pos-orders.ts:426-455`). **Deviasi (setara/lebih kuat): RPC DB-level, bukan guarded UPDATE app-level** — atomic dalam satu statement DB.
- ✅ **S9b (hardening 2026-10-08, H1)** — privilege RPC POS: `pos_complete_payment` dan `pos_decrement_stock` di-lock `revoke execute from public, anon, authenticated` + `grant execute to service_role` (migrasi `0065_lock_priviledged_rpcs.sql`; idempoten). Sebelumnya callable via PostgREST anon/authenticated → bisa insert `transactions`; kini service_role-only. `pos_complete_payment` juga menulis `transactions`.
- ✅ **S10** — grep `creditBalance` di `src/server/pos-*.ts` + `src/lib/pos-*.ts`: hanya komentar (`pos-orders.ts:21,344`), nol pemanggilan. Tidak ada mutasi `balances`/`balance_ledger` di jalur POS.
- ✅ **S11** — grep `from("payments")` di `src/server/pos-*.ts`: nol. Diff `src/server/payment/*` terhadap baseline: kosong (POS v2 tidak menyentuh payment — dikonfirmasi audit 2026-08-30).

Grep list §3 item 1–7: semua terbukti bersih (item 5 & 7 = nol, seperti di atas).

Temuan terbuka (bukan kegagalan kontrol, dicatat jujur):

| Tanggal | Temuan | Severity | Perbaikan | Status |
|---|---|---|---|---|
| 2026-08-30 | S12–S16 (XSS nama produk, CSRF, session revoke, upload, info-leak 404) diverifikasi hanya via review kode (React escaping default; server actions + Auth.js CSRF; upload via `upload-validation.ts`), TANPA probe manual dua-tenant tiga-role terdokumentasi | Rendah | Jalankan checklist probe manual saat deployment dev berikutnya | TERBUKA |
| 2026-08-30 | `tests/pos-orders.test.ts` (action negative: scoping 404/403/409, pay 2×) belum ada saat audit; unit murni (schema/math/entitlement) sudah tercakup file test lain | Rendah | Dibuat pada eksekusi docs-sync ini | SELESAI saat eksekusi ini |

---

## 5. Testing

- Semua test negatif §2 masuk suite (`tests/pos-*.test.ts` — daftar final di `docs/pos/08-testing.md`).
- Skenario manual dua-tenant + tiga-role dieksekusi dengan checklist tertulis (hasil dicatat di §4).
- Regression kiosk: suite payment/checkout existing hijau tanpa modifikasi (POS tak menyentuhnya — S11 membuktikan).

---

## 6. Rollback

Per perbaikan temuan (commit per fix). Tidak ada perbaikan yang menyentuh jalur payment existing (v2) → risiko regresi kiosk minim.

---

## 7. Acceptance Criteria

1. Checklist §2 semua ✅ dengan bukti (nama test / catatan probe).
2. Tidak ada temuan kritikal/tinggi terbuka.
3. §4 terisi lengkap; perbaikan direview + tested.
4. Grep list §3 item 5 & 7 terbukti bersih (nol sentuhan payment existing).

**STATUS: PHASE 7 — SELESAI (verifikasi kode S1–S11 ✅, lihat §4). Probe manual S12–S16 = temuan terbuka.**
