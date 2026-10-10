# POS Add-on — Phase 3: POS Core (Booth + Produk + Cart/Order/Pay) — REVISI v2

> Status: **SELESAI — dieksekusi 2026-08-28.**
> Prasyarat: Phase 2 selesai (migration 0019 applied, `requirePosAccess` ada, permission `pos:*` aktif).
> Revisi v2: payment offline **digabung di phase ini** (Phase 4 QRIS dibatalkan); terminal **per booth**; dipakai **staff** (tanpa role baru).
> UI WAJIB Neo-Brutalism full (`docs/11-design-system.md`, `DESIGN.md`, `docs/13`) — skill `industrial-brutalist-ui` + `design-taste-frontend` + `full-output-enforcement` di-load sebelum menulis komponen.

---

## Status Eksekusi

Dieksekusi 2026-08-28. Yang jadi, sesuai spesifikasi §1–§6:

- `src/lib/pos-math.ts` (`computePosTotals`, `posOrderNumber`, `posDayKey`, `posDayRange` — murni, integer, WIB).
- `src/server/pos-products.ts` (CRUD produk + toggle booth + kategori), `src/server/pos-orders.ts` (`createPosOrder`/`cancelPosOrder`/`payPosOrderManually`/`getPosOrder`/`listPosOrders`), `src/server/pos-actions.ts` (binding tipis + `revalidatePath`).
- Route: `src/app/(pos)/pos/{page,layout,terminal,receipt/[orderId]}`, `src/app/(dashboard)/dashboard/pos/page.tsx`.
- UI: komponen terminal di route `(pos)`; komponen dashboard POS di `src/components/dashboard/Pos*` — **deviasi dari §5.4**: `PosProductsTable`/`PosBoothsTable`/`PosReportsPanel` tidak di `src/components/pos/`.
- Test: `tests/pos-math.test.ts`, `tests/pos-validators.test.ts`.

Deviasi lain (fungsional setara):

1. Decrement stok saat pay = RPC DB-level `pos_decrement_stock()` (`0019_pos_addon.sql:77`), bukan guarded UPDATE app-level §4 langkah 6 — atomic di DB, shortfall tetap log + audit `pos.stock.shortfall`, order tetap paid.
2. `posOrderNumber` retry-on-23505 ada di `createPosOrder` (`pos-orders.ts:233-261`), bukan di lib (lib hanya format).

---

## Daftar Isi

1. Objective & Scope
2. Math Server-Side — `src/lib/pos-math.ts`
3. Produk & Booth — `src/server/pos-products.ts` + UI `/dashboard/pos`
4. Order & Pay — `src/server/pos-orders.ts` (offline)
5. Terminal Kasir — route `(pos)` + komponen
6. Server Actions — `src/server/pos-actions.ts`
7. Security
8. Testing
9. Risk & Mitigasi
10. Rollback
11. Acceptance Criteria

---

## 1. Objective & Scope

- CRUD produk POS (owner/manager) + toggle POS per booth (`posSetBoothEnabled`) di `/dashboard/pos`.
- Terminal kasir `/pos/terminal?photobox=<id>` (owner/manager/staff): grid produk + cart → `posCreateOrder` (pending, snapshot, per booth) → `posPayManually` (cash/bank_transfer/other) → paid + `transactions` row → struk.
- **Pembayaran offline-only** (A2): tidak ada QRIS, tidak ada `payments`, tidak ada polling. Seluruh alur uang = fungsi di file ini.

File dibuat: `src/lib/pos-math.ts`, `src/server/pos-products.ts`, `src/server/pos-orders.ts`, `src/server/pos-actions.ts`, `src/app/(pos)/pos/**`, `src/app/(dashboard)/dashboard/pos/page.tsx`, `src/components/pos/*`.
File dimodifikasi: sidebar dashboard (nav POS conditional), `src/lib/rbac.ts`, `src/lib/validators.ts`, `src/lib/api-errors.ts` (sudah di Phase 2).

---

## 2. Math Server-Side — `src/lib/pos-math.ts`

```ts
export function computePosTotals(
  items: ReadonlyArray<{ unitPrice: number; qty: number }>,
  discountAmount = 0
): { gross: number; discount: number; final: number } {
  // subtotal per item = unitPrice * qty (int), gross = Σ subtotal,
  // final = gross - discount (v1 discount selalu 0 — hook A11)
}

export function posOrderNumber(seq: number, now = new Date()): string {
  // `POS-YYYYMMDD-<seq 4 digit>` — tanggal zona Asia/Jakarta (A14, offset tetap +07:00):
  //   const jakarta = new Date(now.getTime() + 7 * 3600_000) → format UTC-nya
  // seq dari count order business hari itu (WIB) + 1;
  // retry on conflict (unique business_id+number) max 3×
}
```

- Semua int; tidak ada float; murni → unit test tanpa mock.
- Reporting existing tetap UTC (pola `transactions.ts`) — hanya penomoran order yang WIB.

---

## 3. Produk & Booth — `src/server/pos-products.ts` + UI `/dashboard/pos`

### 3.1 Server functions

```
listPosProducts(userId, businessId, { search?, category?, activeOnly? })
  → requirePosAccess + can(pos:read)
  → select pos_products where business_id = X [and is_active / ilike name|sku / eq category]
    order by category, name

createPosProduct(userId, businessId, input)      → can(pos:manage) + validator
updatePosProduct(userId, businessId, input)      → can(pos:manage); .eq(id).eq(business_id) → 0 rows = 404
deactivatePosProduct(userId, businessId, id)     → can(pos:manage); is_active=false (soft delete)
listPosCategories(userId, businessId)            → select distinct category (where is_active)

listPosBooths(userId, businessId)                → can(pos:read)
  → select photoboxes (id, name, outlet_id, pos_enabled, status) scoped business_id
    join outlets(name); order by name

setPosBoothEnabled(userId, businessId, photoboxId, enabled)
  → can(pos:manage)
  → conditional UPDATE photoboxes set pos_enabled=? where id=? and business_id=? → 0 rows = 404
  → insertAudit("pos.booth.toggle")
```

- SKU uniqueness: DB `unique (business_id, sku)` → tangani 23505 → `VALIDATION_ERROR` field `sku`.
- Kategori default (data, bukan enum): `keychain`, `gantungan`, `additional_print`, `merchandise`, `lainnya` — datalist di form; user boleh ketik kategori baru (text bebas non-kosong). Katalog per business (A16) — semua booth menjual katalog yang sama.

### 3.2 UI `/dashboard/pos` (pola halaman dashboard existing)

```
/// POS
MANAJEMEN POS                          [+ PRODUK BARU]
┌ filter: [LiveSearch] [kategori▾] [status: aktif/nonaktif] ┐
│ tabel hand-rolled: NAMA | SKU | KATEGORI | HARGA | STOCK | STATUS | AKSI │
│ StatusBadge aktif/nonaktif · harga Space Mono formatIDR                     │
└─────────────────────────────────────────────────────────────────────────────┘

/// BOOTH POS
│ tabel: BOOTH | OUTLET | STATUS DEVICE | POS | AKSI (toggle pos_enabled)    │
└─────────────────────────────────────────────────────────────────────────────┘
empty state: dashed border `/// BELUM ADA PRODUK`
```

- ProductForm (dialog hand-rolled pola repo): nama, sku, kategori (datalist), deskripsi, harga (int input, suffix `IDR`), cost opsional, stock opsional (`—` = untracked), `image_url` string (URL eksternal, max 500 — TIDAK diupload ke Supabase storage).
- Tabel booth: toggle `pos_enabled` per booth (A13 — "bisa diaktifkan dan bisa tidak") + status device existing.
- Panel aktivasi add-on: server-side cek `hasPosEntitlement` → jika false: blok `/// POS BELUM AKTIF` + harga dari `add_ons` (server) + tombol ke `/dashboard/subscription`. Jika true: ringkasan order hari ini (Phase 5 memperluas).
- Sidebar: item `POS` render hanya `can(pos:read) && hasPosEntitlement`.

---

## 4. Order & Pay — `src/server/pos-orders.ts` (offline)

```
createPosOrder(userId, businessId, { photoboxId, items })
  1. requirePosAccess + can(pos:sell)
  2. validator: photoboxId uuid; items min 1 max 50, qty 1..999, productId uuid
  3. fetch photobox where id=? and business_id=? and pos_enabled=true
     → tidak ada → 404 (bukan milik tenant) / POS_BOOTH_DISABLED (milik tenant, toggle off)
  4. fetch pos_products where id in (...) and business_id = X and is_active = true
     → ada productId hilang/inactive → POS_PRODUCT_INACTIVE (details: nama/id)
  5. computePosTotals dari harga DB (bukan client)
  6. stock pre-check ringan (stock != null && stock < qty → INSUFFICIENT_STOCK) —
     final tetap guarded UPDATE saat pay (langkah pay)
  7. insert pos_orders (pending, photobox_id, outlet_id=photobox.outlet_id,
     cashier_user_id=userId, number=posOrderNumber(seq), payment_method default 'cash')
     + pos_order_items (snapshot name/sku/unit_price/cost × qty)
  8. insertAudit("pos.order.create")
  → return { order, items }

cancelPosOrder(userId, businessId, orderId)
  → requirePosAccess + can(pos:sell)
  → conditional UPDATE pos_orders set status='cancelled'
    where id=? and business_id=? and status='pending'
  → 0 rows → fetch awal: bukan milik tenant = 404; milik tenant bukan pending = POS_ORDER_NOT_PAYABLE

payPosOrderManually(userId, businessId, orderId, method)   // cash | bank_transfer | other
  1. requirePosAccess + can(pos:sell)
  2. fetch order scoped (+ items) → 404 / bukan pending → POS_ORDER_NOT_PAYABLE
  3. exists-check: transactions where pos_order_id=? → ada = no-op idempotent (return)
  4. conditional UPDATE pending→paid (single winner) + paid_at=now(), payment_method=method
  5. insert transactions (paid):
     business_id, outlet_id (dari order/booth — selalu terisi), photobox_id (booth),
     session_id=NULL, package_id=NULL, customer_id (dari order), payment_method=method,
     gross/discount/final dari order, number (generator existing `transactions.number`
     di src/server/transactions.ts — JANGAN bikin scheme baru), pos_order_id,
     cashier_user_id, paid_at=now()
     → TANPA creditBalance (A3 — konsisten kebijakan 0016; saldo tak berubah)
  6. decrementPosStock(items) — guarded per item:
     update pos_products set stock = stock - qty where id=? and business_id=? and stock >= qty
     rows=0 → shortfall: log + audit `pos.stock.shortfall` — TIDAK throw
     (order SUDAH paid — kasir menerima uang; dicatat untuk rekonsiliasi)
  7. insertAudit("pos.order.paid.manual")
  → return { orderId }

getPosOrder / listPosOrders  → requirePosAccess + can(pos:read); scoped; join booth/outlet/cashier names
```

- Idempotency pay: langkah 3 (exists-check) + langkah 4 (conditional UPDATE single-winner) — double-click / dua tab → tepat 1 transactions row.
- Semua dalam satu request server action; tidak ada state payment eksternal.

---

## 5. Terminal Kasir — route `(pos)` + komponen

### 5.1 Layout guard `(pos)/pos/layout.tsx`

```
requireUser (redirect /login) → activeBusiness (cookie; null → /dashboard)
→ membership role ∈ {owner, manager, staff} else redirect /dashboard
→ hasPosEntitlement else redirect /dashboard/pos (halaman aktivasi)
```

### 5.2 `/pos` (gate page — pilih booth)

List booth `pos_enabled=true` (komponen `BoothPicker`, join outlet name) + tombol `BUKA TERMINAL` per booth → navigasi `/pos/terminal?photobox=<id>`. Booth disabled tidak tampil (server yang memvalidasi ulang saat submit — UI bukan pengaman).

### 5.3 `/pos/terminal?photobox=<id>` — full-screen (referensi `src/components/kiosk/*`)

```
┌──────────────────────────────────────────────────────────────────┐
│ /// TERMINAL KASIR   BOOTH: <nama>   OUTLET: <nama>   STAFF: <nama> │ ← bar atas mono, border-b 2px
├─────────────────────────────────┬────────────────────────────────┤
│ [SEARCH________] [kategori ▾]   │ KERANJANG        (eyebrow)     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │ item × qty  Rp15.000  [−][+]   │
│ │PROD│ │PROD│ │PROD│ │PROD│    │ item × qty  Rp35.000  [−][+]   │
│ │RP15│ │RP35│ │RP10│ │RP50│    │ ────────────────────────       │
│ └────┘ └────┘ └────┘ └────┘    │ SUBTOTAL        Rp50.000       │ ← angka Space Mono
│  (grid 2px-gap bg-ink, card    │ DISKON           Rp0           │
│   produk: nama + harga +       │ TOTAL            Rp50.000      │
│   badge stock `SISA 3`/`—`)    │ [ BAYAR TUNAI ]  [ TRANSFER ]  │
└─────────────────────────────────┴────────────────────────────────┘
```

- Interaksi client-state murni (cart di `useState`); harga hanya display dari server data.
- Submit → `posCreateOrder` → panel `PayMethodDialog` (TUNAI / TRANSFER / LAINNYA) → `posPayManually` → sukses: layar struk (`/pos/receipt/[orderId]`, tombol `CETAK` = window.print, tombol `TRANSAKSI BARU`).
- Booth toggle off saat terminal terbuka → submit menerima `POS_BOOTH_DISABLED` → banner merah + link kembali ke `/pos`.
- Stok tampilan habis (`stock=0`) → kartu produk disabled + stripe diagonal.
- Motion: feedback press (translate 2px + shadow collapse) — perilaku interaksi standar, estetika tetap Neo-Brutalism.

### 5.4 Komponen `src/components/pos/`

`ProductGrid`, `ProductCard`, `CartPanel`, `BoothPicker`, `PayMethodDialog` (hand-rolled dialog pola repo), `ReceiptView`, `StockBadge`. Semua memakai tokens `src/styles/tokens.css`; TIDAK ada design system/tailwind-theme baru.

---

## 6. Server Actions — `src/server/pos-actions.ts`

Binding tipis (pola `*-actions.ts` existing): setiap action = auth → baca cookie `snapyos_active_business` → delegate ke `pos-products.ts`/`pos-orders.ts` → `revalidatePath` bila perlu. Tidak ada logika bisnis di file ini.

---

## 7. Security

- Semua fungsi server: `requirePosAccess` (entitlement) + `can()` (RBAC) + scoped `.eq(business_id)` + composite `.eq(id).eq(business_id)` (cross-tenant = 404).
- `businessId` dari cookie server-side (A8) — param client tidak dipercaya.
- Harga/qty: harga dari DB; qty zod 1..999; total server-computed; client hanya display.
- `photoboxId` dari client → validasi scoped + `pos_enabled=true` (server) → `POS_BOOTH_DISABLED`.
- Upload gambar: `upload-validation.ts` (tipe/size) + path per-tenant.
- Menyembunyikan booth/tombol ≠ pengaman — semua check server-side.

---

## 8. Testing

| Test | File | Kasus |
|---|---|---|
| pos-math | `tests/pos-math.test.ts` | subtotal, gross multi item, discount hook, qty max, number format WIB + retry |
| validator | extend `tests/*validators*` (pola existing) | qty 0/1000 reject; items kosong reject; method enum cash/bank_transfer/other; sku duplicate |
| action negative | `tests/pos-orders.test.ts` (mock supabase pola existing) | non-member 404; tanpa entitlement 403; produk inactive 400; order bukan pending 409; booth disabled 409; booth tenant lain 404; pay 2× → 1 transactions row; stock pre-check |
| manual | dev | CRUD produk; toggle booth; staff buka terminal → cart → bayar tunai → struk; manager kelola produk; owner toggle |

`npm run test && npm run typecheck && npm run lint` hijau. Pre-flight `docs/13` §13.6 sebelum declare done (UI).

---

## 9. Risk & Mitigasi

| Risiko | Mitigasi |
|---|---|
| R4 gate terlewat | Semua entry server via `pos-products/pos-orders` yang baris pertamanya `requirePosAccess`; code review checklist |
| R8 manipulasi payload | Total server-computed; test negative tampered payload |
| R5 stock race (2 kasir/booth jual item terakhir) | Guarded UPDATE `stock >= qty`; shortfall → log+audit, transaksi tetap paid |
| R6 transaksi POS di laporan | Row `transactions` dengan photobox_id terisi; verifikasi agregasi Phase 5 |
| Terminal menyimpang dari design system | Skill wajib di-load; pre-flight 13.6; review visual vs kiosk |
| Pay double-fire (double-click/2 tab) | exists-check + conditional UPDATE single winner (test) |

---

## 10. Rollback

- Hapus `src/app/(pos)/`, `src/app/(dashboard)/dashboard/pos/`, `src/components/pos/`, `src/server/pos-{products,orders,actions}.ts`, `src/lib/pos-math.ts`; revert nav sidebar + rbac/validators/api-errors.
- Data `pos_orders` paid + `transactions` POS TIDAK dihapus (transaksi keuangan nyata); hapus tabel hanya via rollback Phase 2 (§10 docs/pos/02) setelah data dievaluasi.

---

## 11. Acceptance Criteria

1. Owner/manager CRUD produk + kategori bebas; gambar upload jalan; soft-delete tidak merusak riwayat.
2. Owner toggle `pos_enabled` per booth; booth off tidak muncul di gate page dan menolak submit (`POS_BOOTH_DISABLED`).
3. Staff (tanpa role baru) buka `/pos` → pilih booth → cart → bayar tunai → order paid + `transactions` row (photobox_id, outlet_id, pos_order_id, cashier_user_id terisi; saldo TIDAK berubah) + struk tercetak.
4. Tenant B (member sama beda business): akses product/order/booth tenant A → 404 (test + manual).
5. Owner/manager: menu manajemen; staff: terminal saja (pos:manage ditolak server-side).
6. Tenant tanpa entitlement: redirect ke halaman aktivasi dengan harga dari server; action → `POS_NOT_SUBSCRIBED`.
7. Pay 2× → tepat 1 `transactions` row (test).
8. Semua test + lint + typecheck hijau; pre-flight 13.6 lulus; **grep membuktikan nol diff** di `src/server/payment/*`.

**STATUS: PHASE 3 — SELESAI. Dieksekusi 2026-08-28 (lihat Status Eksekusi di atas).**
