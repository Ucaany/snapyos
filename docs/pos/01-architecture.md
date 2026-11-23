# POS Add-on — Phase 1: Architecture (REVISI v2)

> Status: **SELESAI — dieksekusi 2026-08-28.**
> Revisi v2 (2026-08-27) mengubah arah desain atas arahan owner: **pembayaran POS = offline-only** (tanpa integrasi `payments`/gateway online/webhook sama sekali), **digunakan staff per booth** (photobox), tanpa role baru.
> Prinsip: additive-only, reuse maksimal, backend = source of truth, uang integer IDR.

---

## Status Eksekusi

Dieksekusi 2026-08-28 (tanggal commit `db/migrations/0019_pos_addon.sql`). Arsitektur §1–§9 terimplementasi sesuai kontrak REVISI v2: offline-only (cash/bank_transfer/other), per-booth `photoboxes.pos_enabled`, tanpa role cashier, tanpa QRIS/payments/webhook. File aktual:

- Migration: `db/migrations/0019_pos_addon.sql` + `db/migrations/0019_pos_addon_rollback.sql`.
- Server: `src/server/pos-entitlement.ts`, `pos-products.ts`, `pos-orders.ts`, `pos-reports.ts`, `pos-actions.ts`.
- Lib: `src/lib/pos-math.ts`, `src/lib/pos-entitlement.ts`, `src/lib/pos-reports-math.ts`, schema POS di `src/lib/validators.ts`, error POS di `src/lib/api-errors.ts`, permission `pos:*` di `src/lib/rbac.ts`.
- Route: `src/app/(pos)/pos/{page,layout,terminal,receipt/[orderId]}`, `src/app/(dashboard)/dashboard/pos/`.

Deviasi dari peta file §4 (fungsional setara):

1. Decrement stok = RPC DB-level `pos_decrement_stock()` (`0019_pos_addon.sql:77`) alih-alih guarded UPDATE app-level — atomic & race-safe di DB.
2. Komponen dashboard POS di `src/components/dashboard/Pos*` (PosProductsTable, PosBoothsTable, PosReportsPanel), bukan `src/components/pos/` — hanya komponen terminal yang di bawah route `(pos)`.
3. Tambahan file lib `src/lib/pos-entitlement.ts` (evaluator pure) + `src/lib/pos-reports-math.ts` agar unit-testable tanpa DB (pola repo: server file tipis, logika di lib).

---

## Daftar Isi

1. Keputusan yang Dibekukan
2. Diagram Alur Order & Payment (offline)
3. Struktur Route
4. Pemetaan File (file map)
5. Kontrak Server Actions
6. Matriks Role × Endpoint
7. Kontrak Error
8. Kontrak Data (ringkas → detail di Phase 2)
9. Keputusan YANG DITOLAK (non-goals)
10. Acceptance Criteria

---

## 1. Keputusan yang Dibekukan

| #            | Keputusan                                                                                                                                                                                                                                    | Alasan                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1           | POS = add-on ber-entitlement via `add_ons` (`code='pos'`, `unit='feature'`) + `subscription_add_ons`                                                                                                                                         | Nol alur billing baru; harga dikustomisasi admin via `/admin/add-ons` existing                                                                                                                                            |
| **A2 (v2)**  | **POS = offline-only.** Tidak ada integrasi `payments`, `payment_webhooks`, gateway online, webhook branch, polling, `settlement-recovery`, `creditBalance`. Pembayaran = kasir menerima uang langsung → order paid server-side                     | Arahan owner: "pembayaran offline saja, tidak ada kaitannya dengan pembayaran yang ada, tidak bentrok". Menghilangkan R1, R2, R7 seluruhnya                                                                               |
| **A3 (v2)**  | Semua payment POS (cash/bank_transfer/other) → insert `transactions` (paid) **tanpa** `creditBalance`                                                                                                                                        | Konsisten kebijakan migration 0016 (saldo hanya dari QRIS kiosk); kini berlaku ke SEMUA POS karena tak ada QRIS POS                                                                                                       |
| A4           | `transactions` = tetap satu-satunya source of truth reporting; POS insert row paid dengan `pos_order_id` + `cashier_user_id`                                                                                                                 | Semua report existing otomatis menghitung POS                                                                                                                                                                             |
| A5           | Terminal POS = route path-based `/pos/*` (route group `(pos)`), active business via cookie `snapyos_active_business`                                                                                                                         | Nol perubahan auth; konsisten pola dashboard; subdomain tetap non-goal                                                                                                                                                    |
| **A6 (v2)**  | **TANPA role baru.** `staff` mendapat `pos:sell` + `pos:read`; manager `+pos:manage/sell/read`; owner `*`. Tidak ada value role `cashier` di DB                                                                                              | Arahan owner: POS dipakai **staff**. Menghilangkan migration CHECK role + risiko R3                                                                                                                                       |
| A7           | Entitlement gate tunggal `requirePosAccess(businessId)` dipanggil SEMUA server action POS                                                                                                                                                    | Satu gerbang = tidak ada endpoint bocor (R4)                                                                                                                                                                              |
| **A8 (v2)**  | Client TIDAK PERNAH mengirim harga/total — payload order hanya `[{productId, qty}]` + `photoboxId`. `businessId` SELALU dari cookie server-side `snapyos_active_business`, tidak pernah parameter client (mismatch membership → 404)         | Anti-manipulasi (R8) + resolusi ambiguitas sumber businessId                                                                                                                                                              |
| A9           | Snapshot harga per line item di `pos_order_items`                                                                                                                                                                                            | Perubahan harga produk tidak merusak riwayat                                                                                                                                                                              |
| A10          | Stock opsional per produk (`stock NULL` = tidak ditrack); decrement guarded `stock >= qty`                                                                                                                                                   | Arsitektur existing bukan inventory-based                                                                                                                                                                                 |
| A11          | Voucher/discount POS v1 = 0 (hook signature menerima `discountAmount=0`)                                                                                                                                                                     | Voucher kiosk terikat checkout_sessions; integrasi = fase lanjutan                                                                                                                                                        |
| A12          | Struk = cetak browser (window.print) dari `/pos/receipt/[orderId]`, tanpa printer SDK                                                                                                                                                        | YAGNI                                                                                                                                                                                                                     |
| **A13 (v2)** | **POS per-booth:** `pos_orders.photobox_id NOT NULL` (setiap order terikat satu photobox); toggle `photoboxes.pos_enabled` (default `false`) — owner aktif/nonaktifkan POS per booth; terminal hanya membuka booth dengan `pos_enabled=true` | Arahan owner: "per booth, bisa diaktifkan dan bisa tidak". `photoboxes.outlet_id` NOT NULL (schema.sql:209) → outlet order selalu terisi dari booth → **TIDAK perlu relax NOT NULL `transactions.outlet_id/photobox_id`** |
| **A14 (v2)** | Nomor order harian `POS-YYYYMMDD-<seq>` memakai **zona Asia/Jakarta (WIB)**; reporting existing tetap UTC (pola `transactions.ts`)                                                                                                           | Hari operasional kasir = kalender lokal; resolusi ambiguitas day-boundary                                                                                                                                                 |
| **A15 (v2)** | Status order: `pending \| paid \| cancelled` saja — `expired` DIHAPUS dari CHECK                                                                                                                                                             | Pembayaran offline tidak punya expiry; nilai mati tidak boleh ada di schema                                                                                                                                               |
| **A16 (v2)** | Katalog produk per **business** (owner kelola terpusat di `/dashboard/pos`); booth hanya punya toggle + identitas order                                                                                                                      | Satu sumber katalog, tidak duplikasi per booth; per-booth pricing = non-goal v1                                                                                                                                           |

---

## 2. Diagram Alur Order & Payment (offline-only)

```
┌──────────────────┐  1. pilih booth (pos_enabled=true)  ┌──────────────────────────────┐
│ /pos (gate page) │ ──────────────────────────────────▶ │ /pos/terminal?photobox=<id>  │
│ list booth aktif │                                     │ grid produk + cart (client   │
└──────────────────┘                                     │ display only)                │
                                                         └──────────────┬───────────────┘
                                                                        │ 2. submit cart
                                                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ server action createPosOrder:                                                     │
│ ─ requirePosAccess (entitlement add-on 'pos') + can(pos:sell) + membership        │
│ ─ businessId dari cookie snapyos_active_business (A8 — bukan param client)           │
│ ─ fetch photobox by (id, business_id, pos_enabled=true) → disabled → 409          │
│ ─ fetch produk by (id, business_id, is_active) → hitung total server-side (int)   │
│ ─ insert pos_orders(pending, photobox_id, number=posOrderNumber WIB)              │
│   + pos_order_items (snapshot name/sku/price/cost)                                │
│ ─ insertAudit("pos.order.create")                                                 │
└───────────────────────────────────────────────────────────────────────────────────┘
                                                                        │ 3. pilih metode
                                                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ payPosOrderManually(orderId, method: cash|bank_transfer|other):                   │
│  1. conditional UPDATE pos_orders pending→paid + paid_at (single winner)          │
│  2. insert transactions(paid): outlet_id = photobox.outlet_id,                    │
│     photobox_id = booth, session/package NULL, pos_order_id, cashier_user_id,     │
│     number pola existing, paid_at=now()  — REPORTING ONLY, TANPA creditBalance    │
│  3. decrementPosStock guarded (shortfall → log + audit pos.stock.shortfall)       │
│  4. insertAudit("pos.order.paid.manual")                                          │
└───────────────────────────────────────────────────────────────────────────────────┘
                                                                        │ 4.
                                                                        ▼
                                              /pos/receipt/[orderId] → window.print
```

Cancel: `cancelPosOrder` → conditional UPDATE pending→cancelled (tanpa side effects). Tidak ada expiry (A15).

**Idempotency (tanpa payment gateway):** transisi single-winner via conditional UPDATE; transaksi ganda dicegah exists-check `transactions.pos_order_id`; order number uniq per business; double-click pay → rows=0 → no-op.

---

## 3. Struktur Route

```
src/app/(pos)/
  pos/
    page.tsx                 → gate: list booth (pos_enabled=true) + CTA buka terminal
    terminal/
      page.tsx               → terminal kasir full-screen per booth (?photobox=<id>)
    receipt/[orderId]/
      page.tsx               → struk siap-cetak (window.print)
    layout.tsx               → guard: requireUser → active business →
                               role ∈ {owner, manager, staff} → hasPosEntitlement else redirect
src/app/(dashboard)/dashboard/pos/page.tsx
                             → manajemen POS owner/manager: produk CRUD, toggle booth,
                               aktivasi add-on, ringkas laporan (Phase 5)
```

- Layout guard = UX + redirect; **keamanan tetap di `requirePosAccess` per action** (R4).
- Nav sidebar dashboard: item "POS" render hanya jika `can(role, "pos:read") && hasPosEntitlement`.

---

## 4. Pemetaan File

| File                                                       | Phase | Isi                                                                                                               |
| ---------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `db/migrations/0019_pos_addon.sql`                         | 2     | DDL §Phase 2 (tanpa sentuh payments/business_members)                                                             |
| `src/server/pos-entitlement.ts`                            | 2     | `hasPosEntitlement`, `requirePosAccess`                                                                           |
| `src/lib/rbac.ts`                                          | 2     | `pos:*` untuk manager + staff (tanpa role baru)                                                                   |
| `src/lib/validators.ts`                                    | 2     | `posProductCreate/Update`, `posOrderCreate` (+photoboxId), `posManualPay`                                         |
| `src/lib/api-errors.ts`                                    | 2     | `POS_NOT_SUBSCRIBED`, `INSUFFICIENT_STOCK`, `POS_ORDER_NOT_PAYABLE`, `POS_PRODUCT_INACTIVE`, `POS_BOOTH_DISABLED` |
| `src/lib/pos-math.ts`                                      | 3     | `computePosTotals` (integer, discount hook = 0), `posOrderNumber` (WIB, retry 3×)                                 |
| `src/server/pos-products.ts`                               | 3     | CRUD produk (scoped `.eq(business_id)`)                                                                           |
| `src/server/pos-orders.ts`                                 | 3     | createPosOrder, cancelPosOrder, payPosOrderManually, getPosOrder (transactions insert + stock)                    |
| `src/server/pos-actions.ts`                                | 3     | server actions terminal + manajemen (binding tipis)                                                               |
| `src/components/pos/*`                                     | 3     | ProductGrid, CartPanel, ProductForm, ProductsTable, BoothPicker, PayMethodDialog, ReceiptView                     |
| `src/server/pos-reports.ts`                                | 5     | agregasi by product/cashier/outlet/booth/status/tanggal                                                           |
| `src/server/analytics.ts`, `metrics.ts`, `transactions.ts` | 5     | label sumber POS vs kiosk (tipe kolom TIDAK berubah — tidak ada relax)                                            |
| ~~`docs/pos/04-payment-qris.md`~~                          | —     | **DIBATALKAN (v2)** — payment offline digabung ke Phase 3                                                         |
| `docs/pos/06..09`                                          | 6–9   | subdomain (opsional/skip), security, testing, deployment                                                          |

---

## 5. Kontrak Server Actions

> Semua action: server-side, authenticated (Auth.js session); `businessId` dari cookie `snapyos_active_business` (A8) — parameter businessId dari client tidak diterima; membership mismatch → 404.

| Action               | Permission   | Input (zod)                                                                 | Output                                        | Efek                                       |
| -------------------- | ------------ | --------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `posListBooths`      | `pos:read`   | —                                                                           | booth list (`pos_enabled=true`) + outlet name | —                                          |
| `posListProducts`    | `pos:read`   | `{ search?, category?, activeOnly? }`                                       | produk list (dengan stock)                    | —                                          |
| `posCreateProduct`   | `pos:manage` | `{ name, sku?, category, description?, price>0, cost?, stock?, imageUrl? }` | produk                                        | insert `pos_products`                      |
| `posUpdateProduct`   | `pos:manage` | `{ id, ...fields }`                                                         | produk                                        | update scoped `.eq(business_id)`           |
| `posDeleteProduct`   | `pos:manage` | `{ id }`                                                                    | —                                             | soft: `is_active=false`                    |
| `posListCategories`  | `pos:read`   | —                                                                           | kategori unik dari data                       | —                                          |
| `posSetBoothEnabled` | `pos:manage` | `{ photoboxId, enabled }`                                                   | —                                             | update `photoboxes.pos_enabled` scoped     |
| `posCreateOrder`     | `pos:sell`   | `{ photoboxId, items: [{productId, qty 1..999}] }`                          | order pending + items snapshot                | total server-side; booth wajib pos_enabled |
| `posCancelOrder`     | `pos:sell`   | `{ orderId }`                                                               | —                                             | pending→cancelled                          |
| `posPayManually`     | `pos:sell`   | `{ orderId, method: cash\|bank_transfer\|other }`                           | order paid                                    | insert transactions (tanpa credit) + stock |
| `posGetOrder`        | `pos:read`   | `{ orderId }`                                                               | order + items                                 | scoped                                     |
| `posReports`         | `pos:read`   | `{ from, to, groupBy: product\|cashier\|outlet\|booth\|method\|day }`       | agregasi int IDR                              | dari `pos_orders`+items+`transactions`     |

- **REST mirror: TIDAK dibuat** (YAGNI — terminal web ter-authentikasi, tidak ada device-token POS).
- Tidak ada action payment QRIS/poll (A2).

---

## 6. Matriks Role × Endpoint

| Action                                                                         | owner | manager | staff |
| ------------------------------------------------------------------------------ | ----- | ------- | ----- |
| posListBooths / posListProducts / posListCategories / posGetOrder / posReports | ✅    | ✅      | ✅    |
| posCreateProduct / posUpdateProduct / posDeleteProduct / posSetBoothEnabled    | ✅    | ✅      | ❌    |
| posCreateOrder / posCancelOrder / posPayManually                               | ✅    | ✅      | ✅    |

Permission mapping (`src/lib/rbac.ts`) — tanpa perubahan DB role:

```
owner:   ["*"]  (otomatis semua)
manager: [ /* existing... */, "pos:manage", "pos:sell", "pos:read" ]
staff:   [ /* existing read-only... */, "pos:sell", "pos:read" ]
```

Halaman `/dashboard/pos` (manajemen) → `pos:manage`; terminal `/pos/*` → `pos:sell`.

---

## 7. Kontrak Error

Kode baru di `src/lib/api-errors.ts` (pola `{CODE: httpStatus}`):

| Kode                    | HTTP | Kapan                                                      |
| ----------------------- | ---- | ---------------------------------------------------------- |
| `POS_NOT_SUBSCRIBED`    | 403  | entitlement tidak aktif (semua action POS)                 |
| `INSUFFICIENT_STOCK`    | 409  | stock guarded-update gagal (item + sisa stok di `details`) |
| `POS_ORDER_NOT_PAYABLE` | 409  | order bukan pending saat pay/cancel                        |
| `POS_PRODUCT_INACTIVE`  | 400  | produk di-cart dinonaktifkan sebelum submit                |
| `POS_BOOTH_DISABLED`    | 409  | photobox `pos_enabled=false` saat create order             |

Reuse: `VALIDATION_ERROR`, `NOT_FOUND` (cross-tenant = 404), `FORBIDDEN`.

---

## 8. Kontrak Data (ringkas)

Detail DDL penuh di `docs/pos/02-database-subscription.md`. Ringkas:

- `pos_products(business_id, name, sku? uniq-per-business, category text, price int>0, cost?, stock? NULL=untracked, is_active, image_url?)`
- `pos_orders(business_id, photobox_id NOT NULL → photoboxes, outlet_id → outlets (dari booth), cashier_user_id → users, number uniq-per-business, status pending|paid|cancelled, gross/discount/final int, payment_method cash|bank_transfer|other, paid_at?)`
- `pos_order_items(pos_order_id, pos_product_id?, name_snapshot, sku_snapshot?, unit_price_snapshot, cost_snapshot?, quantity>0, subtotal)`
- `photoboxes` + `pos_enabled boolean not null default false`
- `transactions` + `pos_order_id`, `cashier_user_id` (additive; **TIDAK ada** relax NOT NULL — outlet_id & photobox_id selalu terisi dari booth)
- `add_ons` seed `code='pos'` — **TIDAK ada** perubahan `payments` atau `business_members`
- Migration = `0019_pos_addon.sql` (0018 sudah terpakai `member-photoboxes`)

---

## 9. Keputusan YANG DITOLAK (non-goals v1)

- ❌ **Pembayaran QRIS/online POS apa pun** — tanpa integrasi `payments`/gateway online/webhook (v2: dibatalkan permanen; bila suatu saat dibutuhkan, buka dokumen baru, jangan revive 04).
- ❌ Role baru `cashier` / per-user permission table.
- ❌ Katalog/ harga per booth (katalog per business; booth hanya toggle).
- ❌ Voucher/discount di POS v1 (hook `discount=0` fixed).
- ❌ Refund POS UI (koreksi via existing manual adjustment).
- ❌ REST API publik POS, printer thermal SDK / email struk, held/reserved table, tabel kategori terpisah, inventory ledger, assignment staff-ke-booth (staff boleh operasikan semua booth `pos_enabled`).

---

## 10. Acceptance Criteria

1. Dokumen ini disetujui user — kontrak §3–§8 fix, tidak berubah tanpa amendmen tertulis.
2. Cross-check: setiap file di §4 muncul di dokumen phase pemiliknya; tidak ada file phase 2/3/5 di luar peta ini.
3. Matriks §6 konsisten dengan `src/lib/rbac.ts` target (diverifikasi saat Phase 2).
4. Tidak ada keputusan yang bertentangan dengan guardrails POS + catatan revisi v2.
5. **Tidak ada diff** di `src/server/payment/*`, `payments`, `payment_webhooks`, `business_members` (verifikasi grep saat eksekusi).

**STATUS: PHASE 1 — SELESAI. Dieksekusi 2026-08-28 bersama Phase 2/3/5 (lihat Status Eksekusi di atas).**
