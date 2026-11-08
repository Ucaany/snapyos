# 4. Owner Platform — Feature Specifications

> **UPDATE Fase 5 (2026-09-16):** semua referensi REST `/api/v1/business/:businessId/*` di dokumen ini untuk CRUD/data dashboard adalah kontrak historis dan telah diganti server actions (`src/server/*`). REST yang tetap aktif hanya `devices`, `photoboxes/:id/activation`, `customers/:id`, dan `reports`; inventaris canonical ada di `docs/08-api-spec.md` §8.4–§8.13b.

## Status Implementasi (audit 2026-09-15)

SESUAI (inti): satu shell Neo-Brutalist sidebar+topbar, dashboard metric/chart SSR, outlet/photobox CRUD + plan limit, branding + logo upload, package/template/voucher/transaction/customer/staff/subscription/finance/reports/settings, template builder (`/dashboard/templates/builder/[id]`, Phase 12), dan subscription add-on via invoice QRIS. UI konfigurasi direct-merchant payment owner dihapus pada Fase 5; provider/webhook legacy tetap sebagai fallback untuk credential DB existing.

Aturan owner dashboard: katalog `add_ons` bersifat platform-global dan hanya CRUD admin. Owner hanya memilih quantity, membayar invoice, lalu membatalkan add-on pada akhir periode; semua harga, promo, entitlement, dan aktivasi diulang hitung server-side.

BELUM (backlog jujur):

- Dialog detail transaksi (klik row → detail).
- `PATCH photoboxes/:id/settings` terpisah (settings photobox via PATCH photoboxes umum).
- Session settings owner-configurable (`photoboxes.session_settings` ada kolomnya; UI owner belum).
- Print test dari dashboard.
- Booking §4.14 — BELUM ada (UI/API).
- Event mode §4.15 — BELUM ada.
- Business profile edit + danger zone §4.17 — BELUM ada.
- Topbar global search & notifications.
- Preset filter dashboard.

TIDAK SESUAI (kecil): CTA pada empty-state sebagian disabled; detail lihat `docs/audit-2026-08.md`.

Owner platform adalah pusat pengelolaan bisnis. Layout: **sidebar navigation** + **topbar** (search, notifications, workspace switcher, user menu).

## Konvensi format per fitur

Setiap fitur dijabarkan dengan: **Purpose, User, User flow, UI, Components, Data, Backend logic, API, Validation, Error/Loading/Empty state, Permission, Security, Acceptance criteria.**

---

## 4.1 Dashboard (Overview)

**Purpose:** Memberi business overview instan, revenue sebagai informasi utama.

**Metric cards (default):**

- Revenue Today
- Revenue This Month
- Gross Revenue
- Net Revenue
- Total Sessions
- Paid Transactions
- Total Customers
- Average Transaction Value
- Active Photobox
- Active Outlets

Contoh tampilan ringkas:

```
Gross Revenue   Rp10.000.000
Discount        Rp750.000
Net Revenue     Rp9.250.000
Sessions        428
Avg Transaction Rp21.612
```

**UI/Components:** `Card` (neo-brutal thick border + hard shadow), `MetricCard`, `AreaChart`/`BarChart` (shadcn/ui Charts), `DateRangeFilter`, `DataTable` ringkas (top outlets).

**Data:** agregasi dari `transactions` (source of truth) + `sessions` + `customers` + `outlets` + `photoboxes`, dihitung **server-side** (SQL aggregate), bukan di client.

**Backend logic:**

- Gross = sum(`final_amount` di transaksi berstatus `paid`).
- Discount = sum(`discount_amount`) pada transaksi paid.
- Net = gross − discount.
- Avg transaction = net / count(paid transactions).

**API:** `GET /api/v1/business/:businessId/dashboard?from=&to=`

**Validation:** `from`/`to` tanggal valid, default this month.

**States:**

- Loading: `Skeleton` metric cards + chart.
- Empty: "Belum ada transaksi" + CTA "Launch Photobox".
- Error: `Alert` dengan retry.

**Permission:** OWNER, MANAGER. STAFF hanya subset (lihat RBAC `09-security-storage.md`).

**Security:** semua aggregate di-scope `business_id` dari sesi; tidak boleh query lintas tenant.

**Acceptance:** (AC 35–39) revenue masuk dashboard, discount tidak dihitung sebagai revenue, gross/net tampil benar.

---

## 4.2 Revenue Analytics

**Purpose:** Revenue chart dengan filter waktu & breakdown.

**Filters:** Today, Last 7 days, Last 30 days, This month, Last month, This year, Custom date range.

**Breakdowns:**

- Revenue by day
- Revenue by outlet
- Revenue by package
- Revenue by Photobox
- Revenue by payment method

**UI/Components:** `Tabs` (breakdown), `AreaChart`, `BarChart`, `PieChart`/`DonutChart` dari shadcn/ui Charts, `DateRangeFilter` + `Popover` + `Calendar`.

**Backend logic:** SQL `GROUP BY` pada `transactions` (status `paid`) sesuai dimensi + filter rentang tanggal.

**API:**

- `GET /api/v1/business/:businessId/analytics/revenue?from=&to=`
- `GET /api/v1/business/:businessId/analytics/revenue/by-outlet`
- `GET /api/v1/business/:businessId/analytics/revenue/by-package`
- `GET /api/v1/business/:businessId/analytics/revenue/by-photobox`
- `GET /api/v1/business/:businessId/analytics/revenue/by-payment-method`

**Acceptance:** chart menggunakan shadcn/ui Charts; filter custom range berfungsi.

---

## 4.3 Business Metrics

**Purpose:** Satu halaman metrik operasional menyeluruh.

**Sections:**

1. **Revenue:** gross, discount, net, revenue growth.
2. **Transactions:** total, paid, pending, failed, cancelled, refunded.
3. **Sessions:** total, completed, cancelled, retakes, average duration.
4. **Customers:** total, new, returning.
5. **Photobox:** sessions per booth, revenue per booth, most popular package, most used template.

**UI/Components:** `Card`, `Stat`, `Progress`, `Table`, charts.

**API:** `GET /api/v1/business/:businessId/metrics?from=&to=`

**Acceptance:** semua angka konsisten dengan halaman Dashboard & Transactions.

---

## 4.4 Finance

**Purpose:** Basic business finance (income vs expense → estimated profit). Bukan accounting software kompleks.

**Income categories:** Photobox session, Event, Printing, Additional services, Other income.
**Expense categories:** Rent, Electricity, Internet, Paper, Ink, Maintenance, Staff, Equipment, Advertising, Other operational.

**Perhitungan:** `Revenue − Expenses = Estimated Profit`, plus `Profit Margin`.

**Tampilan:**

- Gross Revenue
- Discounts
- Net Revenue
- Expenses
- Estimated Profit
- Profit Margin

**Expense input:** form manual (`name`, `amount`, `category`, `date`, `outlet_id` opsional, `note`).

**UI/Components:** `Card`, `Form` (shadcn), `Dialog` (tambah expense), `DataTable` (list expense), `Select` kategori.

**Data:** `expenses` table; income dihitung dari `transactions`.

**Backend logic:** profit = net revenue − sum(expenses dalam rentang); margin = profit / net revenue.

**API:**

- `GET /api/v1/business/:businessId/finance/summary?from=&to=`
- `GET/POST/PATCH/DELETE /api/v1/business/:businessId/expenses`

**Validation:** amount > 0 integer; kategori valid; tanggal valid.

**Permission:** lihat ringkasan OWNER + MANAGER (`finance:read`); **input/ubah/hapus expense OWNER saja** (`expense:write`); uang yang dicatat manual tidak withdrawable. STAFF tanpa akses.

**Acceptance:** (AC 39–40) owner melihat expenses & estimated profit.

---

## 4.5 Transaction Management

**Purpose:** Seluruh transaksi bisnis.

**Table columns:** Transaction ID, Date, Customer, Package, Outlet, Photobox, Payment Method, Gross Amount, Discount, Final Amount, Status.

**Status enum:** `pending`, `paid`, `failed`, `cancelled`, `refunded`.

**Filters:** Date, Outlet, Photobox, Package, Payment method, Status.
**Search:** Transaction ID, Customer, Phone/email (jika ada).

**UI/Components:** `DataTable` (shadcn `Table` + `ColumnDef`), `Input` search, `Select`/`Combobox` filter, `Popover`+`Calendar` date filter, `Badge` status, `Dialog` detail transaksi.

**Data:** `transactions` join `customers`, `packages`, `outlets`, `photoboxes`, `payments`.

**API:**

- `GET /api/v1/business/:businessId/transactions?status=&outlet=&photobox=&package=&method=&from=&to=&q=&page=`
- `GET /api/v1/business/:businessId/transactions/:id`

**Backend logic:** list dengan pagination + filter server-side; detail menampilkan breakdown gross/discount/final + status payment.

**States:** Loading skeleton, empty ("Belum ada transaksi"), error alert.

**Security:** hanya transaksi milik business; `id` tidak boleh diakses lintas tenant.

**Acceptance:** (AC 41) owner melihat transaction history dengan filter & search.

---

## 4.6 Photobox Management

**Purpose:** Buat & kelola photobox.

Contoh: Business `KLIK FOTO` → Outlet `Malioboro` → Photobox `Booth 01`.

**Fields:** Name, Slug, Outlet, Status, Camera, Printer, Display, Default template, Available packages, Session settings (timer sesi — lihat §4.6.1).

**Status enum:** `online`, `offline`, `maintenance`.

**UI/Components:** `DataTable`/grid, `Dialog` create/edit, `Form`, `Badge` status, `Select` outlet & default template, multi-select packages, device status (jika tersedia).

**Data:** `photoboxes` join `outlets`, `templates`, `photobox_packages`.

**API:**

- `GET /api/v1/business/:businessId/photoboxes`
- `POST /api/v1/business/:businessId/photoboxes`
- `PATCH /api/v1/business/:businessId/photoboxes/:id`
- `DELETE /api/v1/business/:businessId/photoboxes/:id`
- `GET /api/v1/business/:businessId/photoboxes/:id/activation` — kode+QR aktivasi device
- `GET /api/v1/business/:businessId/devices` — daftar device teraktivasi
- `DELETE /api/v1/business/:businessId/devices/:id` — revoke device

**Validation:** name wajib; slug unik per business; outlet harus milik business; status enum valid; cek limit plan (`max_photoboxes`).

**Permission:** OWNER, MANAGER.

**Acceptance:** (AC 5, 44) owner membuat photobox & melihat performanya.

### 4.6.1 Setelan mesin: milik aplikasi booth

Kamera, printer fisik, durasi sesi, dan **kustomisasi tampilan per booth** tidak diatur dari
dashboard. Semuanya milik aplikasi booth (runtime lokal), karena hanya mesin di lokasi yang
tahu nilai sebenarnya.

**Yang diatur dari dashboard** (form ubah booth, dua seksi):

- **Identitas booth**: `name`, `slug`, `outlet_id`, `status`.
- **Kebijakan bisnis**: `payment_mode`, `print_settings.copies` (biaya bahan),
  `print_settings.layout` (bentuk output pelanggan).

**Yang diatur di aplikasi booth** (panel **Setelan booth**, dibuka dengan PIN petugas):

| Grup                 | Field                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `camera_settings`    | `provider`, `countdown_seconds`, `capture_width/height`, `mirror_preview`, `screen_orientation` |
| `print_settings`     | `enabled`, `mode`, `paper_size`, `orientation`, `auto_print`, `margins_mm`, `printer_name`     |
| `session_settings`   | `timer_seconds`, `warning_seconds`, `max_retakes`                                              |
| `appearance_settings`| `bg_color`, `text_color`, `font_scale`, `button_radius`, `padding`, judul/hint layar, `guide_steps`, override per-layar |

Field mesin yang dikirim lewat form dashboard **ditolak** dengan pesan yang menyebut nama
field-nya (`src/lib/photobox-form-fields.ts`), bukan dibuang diam-diam.

Jalur tulis setelan ada dua, dan keduanya tidak bisa saling menimpa:

- **`PUT /v1/settings`** (runtime lokal) — semua grup di atas, termasuk `appearance_settings`.
- **`PATCH /api/v1/public/devices/settings`** (cloud) — hanya tiga grup mesin. Payload yang
  membawa `appearance_settings` dijawab `403 LOCAL_ONLY_SETTING`; payload yang membawa
  `copies`/`layout`/`payment_mode` dijawab `403 FIELD_NOT_DEVICE_OWNED`.

**Kustomisasi tampilan adalah milik satu booth.** `appearance_settings` disimpan di store
lokal booth dan **tidak** ikut laporan ke cloud: kalau ikut, satu booth yang mengganti warna
latar akan menimpa `photoboxes.*` yang dibaca seluruh booth di business yang sama. Di kiosk,
nilai booth di-merge **di atas** branding cloud (`src/lib/appearance-merge.ts`), sehingga logo,
warna brand, dan video promosi tetap milik website. Runtime mati → branding cloud dipakai apa
adanya dan booth tetap bisa menjual.

**Panel cermin** (dialog **Perangkat**, `DeviceDialog`) menampilkan laporan booth:

- Resolusi kamera dan status uji printer dari `device_status`.
- Printer aktif (`print_settings.printer_name`) dan ukuran kertas (`paper_size`).
- "Dilaporkan: <waktu>" dari `last_seen_at`; belum pernah → "Belum pernah dilaporkan".
- **[ ULANGI SETUP ]** — revoke device → re-pair → setup wizard jalan lagi.

Tidak ada tombol "minta booth melapor": belum ada kanal perintah cloud → runtime, laporan
datang sendiri lewat heartbeat. Tidak ada halaman uji kamera jarak jauh; hardware hanya bisa
diuji di lokasi, lewat SetupWizard saat pairing (`05-customer-photobox.md` §5.0.1).

---

## 4.7 Multi-Outlet Management

**Purpose:** Mendukung banyak outlet & booth.

Contoh:

```
KLIK FOTO
  Malioboro     → Booth 01, Booth 02
  Pakuwon Mall  → Booth 01
  Hartono Mall  → Booth 01
```

**Owner dapat:** create/edit/delete outlet, assign photobox, assign staff, lihat performa outlet.

**Outlet analytics:** Revenue, Sessions, Customers, Average transaction, Most popular package.

**UI/Components:** `DataTable`, `Dialog`/`Sheet` form, outlet detail dengan `Tabs` (overview, photobox, staff).

**Data:** `outlets`, `photoboxes`, `staff_roles`, `transactions`.

**API:**

- `GET /api/v1/business/:businessId/outlets`
- `POST/PATCH/DELETE /api/v1/business/:businessId/outlets/:id`
- `GET /api/v1/business/:businessId/outlets/:id/analytics`

**Validation:** cek `max_outlets`; delete hanya jika tidak ada data dependen (atau soft-delete).

**Acceptance:** (AC 43) owner melihat outlet performance.

---

## 4.8 Photobox Builder (Branding)

**Purpose:** Membangun pengalaman photobox milik brand sendiri.

**Konfigurasi:**

- Branding: business name, logo, primary color, secondary color, background, typography.
- Welcome screen: judul, tagline, tombol start.
- Kiosk (customer app, 5 layar — welcome, payment, foto, edit, result): teks per layar, warna latar/teks, skala font, radius tombol, padding, perataan konten full-element (kiri/tengah/kanan — global `kiosk.align`, timpa per layar), layout struktural (welcome split/center, posisi QR result), visibilitas logo/tagline, video background loop ≤5s.
- Override per-layar (`branding.kiosk.pages`): timpa nilai global kiosk per layar (warna, perataan, font scale, radius, padding) — fallback ke nilai global bila kosong. Legacy `payment_align` tetap dihormati bila `align` belum diset.

Contoh welcome:

```
KLIK FOTO
"Capture your moment."
[ START ]
```

**UI/Components:** `Form` + `Tabs` (branding, welcome), color picker, logo upload, live `Preview` panel.

**Data:** `business_settings` (jsonb) — brand colors, logo, welcome text.

**API:** `GET/PATCH /api/v1/business/:businessId/settings/branding`

**Validation:** warna valid hex; logo ukuran & tipe divalidasi (PNG/JPG/WebP — SVG dihapus dari allowlist, audit keamanan 2026-10-09, max size).

**Security:** upload logo divalidasi (file type + size), disimpan di storage bucket private.

**Acceptance:** branding muncul di customer-facing app (AC 6).

---

## 4.9 Package Management

**Purpose:** Membuat package layanan.

Contoh:

```
BASIC   Rp20.000  — 3 photos, 1 print, digital copy
PREMIUM Rp35.000  — 5 photos, 2 prints, digital copy, premium templates
```

**Fields:** name, price, number of photos, number of prints, digital output (boolean), available templates (multi), description, active/inactive, applicable outlet, applicable photobox.

**UI/Components:** `DataTable`, `Dialog` form, multi-select (`Combobox`), `Switch` active, price input.

**Data:** `packages`, `package_templates` (m2m), `package_outlets`, `package_photoboxes`.

**API:**

- `GET/POST/PATCH/DELETE /api/v1/business/:businessId/packages`

**Validation:** price integer > 0; photo/print count ≥ 1; name wajib.

**Backend logic:** package adalah dasar perhitungan final amount di checkout (server-side).

**Acceptance:** (AC 7) owner membuat package; package muncul di customer app.

---

## 4.10 Template Management

**Purpose:** Mengelola template/frame milik brand sendiri, plus memakai template platform (global) secara read-only.

**Default categories:** Minimal, Cute, Retro, Y2K, Wedding, Birthday, Graduation, Event, Custom.

**Owner dapat:** upload, create, edit, delete, kategorisasi, preview, active/inactive, assign ke package, **mendesain slot foto via Template Builder** (`15-template-builder.md`), dan membeli template premium (§15.9b).

**UI/Components:** grid preview (menampilkan frame/thumbnail — **bukan** composite slot), `Dialog` upload/create dengan pilihan eksplisit **Draft (default) / Publish**, `Select` kategori, `Switch` active, `Tabs` assign package, `TemplateBuilderCanvas` (`src/components/dashboard/TemplateBuilderCanvas.tsx`) untuk builder owner.

**Data:** `templates` (file di storage + metadata + `layout` slot), `package_templates`, `business_template_purchases`.

**API:** owner CRUD/upload/builder memakai **server actions** (`src/server/templates.ts`, `src/server/catalog-actions.ts`), bukan REST. REST owner dihapus Fase 5. Endpoint publik template tetap `GET /api/v1/public/:businessSlug/templates` (§8.7a `08-api-spec.md`).

**Validation:** tipe file gambar (PNG/JPG/WebP — SVG dihapus dari allowlist, audit keamanan 2026-10-09), max size, nama wajib, `layout` valid (`layoutSchema` §15.2 — id unik, z kontigu, preset cocok dimensi, bounds rotation-aware, radius ≤ min(w,h)/2, circle persegi, max 8 slot). Assign ke paket tidak dibatasi jumlah slot.

**Builder (terimplementasi):**

- Route `/dashboard/templates/builder/[id]`; admin `/admin/templates/builder/[id]` memakai komponen yang sama.
- Kontrol: tambah/hapus slot (maks 8), drag pindah, resize handle, input numerik x/y/w/h + rotation, shape rect/rounded/circle/ellipse, fit cover/contain/fill, radius, z naik/turun (renumber 0..n-1), preset kanvas (4x6-portrait, 4x6-landscape, 2x6-strip, square, custom maks 3000), background hex.
- Keyboard arrow nudge 1px / Shift 10px; semua mutasi juga tersedia lewat tombol/input.
- Simpan eksplisit: "Simpan draft" (`is_active=false`) atau "Publish" (`is_active=true`); tidak pernah auto-publish.
- **Thumbnail berasal dari frame WebP yang diunggah**, bukan digenerate dari preview builder.
- Builder tidak menyediakan kontrol chroma key; chroma hanya di editor kiosk.
- Preview builder memakai `composeFrame` yang sama dengan kiosk (client-authoritative); server tidak punya engine composite.

**Read-only global:** baris milik business (`is_global=false`) bisa diedit. Template platform (`TEMPLATE PLATFORM`) tampil read-only tanpa edit/delete/simpan; global gratis aktif + yang sudah dibeli dapat di-assign; global yang dibeli membuka builder read-only ("Template platform — read-only").

**Security:** upload divalidasi; preview pakai signed URL jika private. Template global tidak bisa ditulis dari sisi owner. Mutasi template meng-invalidate public config kiosk (tag per-business + global, TTL 30 detik).

**Acceptance:** (AC 8) owner upload template; template bisa dipilih customer; builder slot berfungsi (§15.9).

### 4.10.1 Custom Template — Slot Builder (lihat `15-template-builder.md`)

UMKM **bisa** membuat/mengkustomisasi template **lengkap dengan slot foto**:

**MVP (terimplementasi):**

- Upload frame/overlay template sendiri (PNG transparan yang mereka desain di Canva/Figma/Photoshop).
- **Template Builder** (`/dashboard/templates/builder/[id]`): tambah **slot foto** (rect/rounded/circle/ellipse) via drag atau input numerik di atas frame — atur posisi, ukuran, rotasi, fit, z. Hasil foto customer ter-composite pas ke slot (detail penuh: `15-template-builder.md`).
- Simpan sebagai draft atau publish; kategorisasi, preview, aktif/nonaktif, assign ke package. Template assignable = milik sendiri atau global aktif yang gratis/sudah dibeli.
- Template dipasangkan dengan **sticker & text tool** milik SnapyOS di editor customer.
- Library template default per kategori (seed platform).

**Phase 2 (ekstensi builder):**

- Shape custom/path mask, layer frame z-configurable, reusable block/undo-redo, export/publish template.

> Marketplace template premium **bukan** Phase 2 lagi: pembelian template global sudah terimplementasi (`15-template-builder.md` §15.9b). Template milik owner tetap dikelola seperti biasa.

## 4.11 Voucher Management

**Purpose:** Membuat voucher untuk checkout customer.

**Types:** percentage discount, fixed amount discount.

**Settings:** code, discount type, discount amount, start date, end date, usage limit, usage per customer, minimum transaction, maximum discount, applicable package, applicable outlet, active/inactive.

**UI/Components:** `DataTable`, `Dialog` form, `Select` tipe, `Switch` active, multi-select package/outlet.

**Data:** `vouchers`, `voucher_usages`.

**API:**

- `GET/POST/PATCH/DELETE /api/v1/business/:businessId/vouchers`

**Validation:** code unik per business, uppercase; amount sesuai tipe; tanggal valid; minimum ≤ maximum (jika ada).

**Acceptance:** (AC 9) owner membuat voucher; voucher tervalidasi server-side saat dipakai.

### Voucher Analytics

**Purpose:** Performa voucher.

**Tampilan (per voucher):** Total usage, Total discount, Revenue generated, Active vouchers, Expired vouchers.

Contoh: `GRANDOPENING` → Usage 48, Total Discount Rp420.000, Revenue Generated Rp6.800.000.

**API:** `GET /api/v1/business/:businessId/vouchers/:id/analytics`

**Data:** agregasi dari `voucher_usages` join `transactions`.

**Acceptance:** (AC 42) owner melihat voucher usage.

---

## 4.12 Customer Management

**Purpose:** Melihat data customer (tanpa pengumpulan data personal berlebihan).

**Fields:** name, contact (jika diberikan), session history, transaction history, booking history, total spending.

**UI/Components:** `DataTable`, `Dialog` detail customer (tab: transaksi, sesi, booking).

**Data:** `customers`, `transactions`, `sessions`, `bookings`.

**API:**

- `GET /api/v1/business/:businessId/customers?q=&page=`
- `GET /api/v1/business/:businessId/customers/:id`

**Security:** hanya data customer milik business; hindari menyimpan data personal tak perlu.

**Acceptance:** owner melihat total spending & riwayat customer.

---

## 4.13 Staff Management (RBAC)

**Purpose:** Mengelola akses staff dengan role.

**Roles:** OWNER (full), MANAGER (photobox, transactions, customers, bookings, templates, operations), STAFF (photobox operation, sessions, basic transaction ops — tanpa akses penuh ke financial info).

**UI/Components:** `DataTable`, `Dialog` invite/assign role, `Select` role, `Badge` role.

**Data:** `staff_roles` (business_id, user_id, role), `users`.

**API:**

- `GET /api/v1/business/:businessId/staff`
- `POST /api/v1/business/:businessId/staff/invite`
- `PATCH /api/v1/business/:businessId/staff/:userId` (ubah role)
- `DELETE /api/v1/business/:businessId/staff/:userId`

**Backend logic:** cek `max_staff`; RBAC dievaluasi server-side pada tiap endpoint.

**Acceptance:** (AC 47) RBAC berjalan — staff tidak otomatis melihat seluruh financial info.

---

## 4.14 Booking System

**Purpose:** Booking sederhana (bukan marketing automation).

**Customer pilih:** `starts_at`, `ends_at`, package, name, contact. Backend menyimpan UTC; UI menampilkan `businesses.timezone`.
**Owner melihat:** upcoming, completed, cancelled, booking revenue.

**UI/Components:** `Calendar` month/agenda, `DataTable` bookings, `Dialog` detail, status `Badge`.

**Data:** `bookings` (status: `pending`, `confirmed`, `completed`, `cancelled`).

**Calendar contract:** endpoint menjadi source of truth; query memakai `[from, to)`, response memakai `starts_at`, `ends_at`, resource, dan status yang sama dengan detail booking. Overlap mengembalikan HTTP 409 `BOOKING_SLOT_CONFLICT` lalu UI refresh data.

**Layout acceptance:** toolbar terpisah dari header bulan dan grid dengan gap minimum 16px desktop, 12px mobile; event inset minimal 4px dari garis; tombol/event tidak overlap garis atau keluar cell; garis tidak dobel; mobile memakai agenda list.

**API:**

- Public: `POST /api/v1/business/:businessId/bookings` (customer)
- Owner: `GET/PATCH /api/v1/business/:businessId/bookings`

**Acceptance:** owner melihat daftar booking & revenue dari booking.

---

## 4.15 Event Mode

**Purpose:** Konfigurasi photobox untuk event dengan branding terpisah.

**Fields:** event name, date, branding, logo, custom templates, package, event code, event analytics.

**UI/Components:** `Tabs` event list/detail, `Dialog` form, `Preview` branding event.

**Data:** `events` (business_id), link ke photobox config via `event_code`.

**API:**

- `GET/POST/PATCH/DELETE /api/v1/business/:businessId/events`
- Public customer app bisa dibuka dengan `?event=<event_code>`.

**Acceptance:** owner membuat event; customer app menampilkan branding event via event code.

---

## 4.16 Reports

**Purpose:** Report & export.

**Report types:** Daily, Weekly, Monthly, Revenue, Transactions, Outlet, Photobox, Expenses, Voucher.

**Export formats:** CSV, XLSX, PDF.

**UI/Components:** `Card` pilihan tipe, `Select` format, `Button` export, `DateRangeFilter`.

**API:** `GET /api/v1/business/:businessId/reports?type=&from=&to=&format=csv|xlsx|pdf`

**Backend logic:** generate dari aggregate `transactions`/`expenses`/`voucher_usages`; CSV/XLSX server-side stream; PDF (future).

**Acceptance:** owner dapat export laporan.

---

## 4.17 Settings

**Purpose:** Pengaturan bisnis & workspace.

**Sub-sections:** Business profile, Branding (lihat 4.8), Payment settings, Staff (lihat 4.13), Danger zone.

**API:** `GET/PATCH /api/v1/business/:businessId/settings`

---

## 4.18 Workspace Switching & Topbar

**Purpose:** User dengan banyak business bisa switch workspace.

**UI/Components:** `Command`/`Dropdown` workspace switcher, `Breadcrumb`, `Notification` (list), `User menu`.

**Backend logic:** sesi menyimpan `businessIds`; switching men-set `activeBusinessId` (cookie/session), semua request memakai context business aktif.

**Security:** user hanya bisa switch ke business yang menjadi member (dicek server-side).

---

## 4.19 Bantuan / Dokumentasi (Help Center)

**Purpose:** Membantu UMKM yang tidak paham teknologi setup & operasional SnapyOS.

**Akses:** dua entry point:

1. **Owner platform** — item "Bantuan" di sidebar + link "?" di topbar.
2. **Public** — halaman `/bantuan` (tanpa login) untuk calon pengguna.

**Konten (struktur):**

- **Mulai Cepat (Quick Start):** langkah register → buat business → outlet → photobox → package → template → voucher → launch.
- **Panduan per modul:** Dashboard, Photobox, Outlet, Template (upload & custom), Package, Voucher, Transaksi, Finance/Saldo & Penarikan, Staff, Subscription.
- **Panduan Pembayaran QRIS (Pakasir):** cara aktifkan payment, memahami `total_amount` (kode unik), status pembayaran, penarikan dana.
- **FAQ:** pertanyaan umum (cara ganti warna brand, cara buat voucher, kapan saldo bisa ditarik, dst).
- **Troubleshooting:** kamera tidak muncul, QRIS tidak tampil, webhook, download foto.
- **Kontak support:** WhatsApp/email.

**UI/Components:** `Sidebar` (daftar artikel), `Accordion` (FAQ), `Breadcrumb`, konten markdown, search (`Command`).

**Data:** artikel disimpan sebagai file markdown/MDX di repo, atau table `help_articles` (title, slug, category, content, is_published). Rekomendasi MVP: **file MDX** (sederhana, versi via git), tidak perlu CMS.

**API:** `GET /api/v1/help?category=` (public) — daftar artikel; artikel dirender dari MDX.

**States:** empty (kategori kosong), loading skeleton, search tanpa hasil ("Tidak ditemukan").

**Acceptance:** owner bisa menemukan panduan setup & troubleshooting tanpa kontak support; halaman bantuan accessible (public) & dari dashboard.

## 4.20 Tiket Bantuan (Support Tickets)

**Purpose:** Owner melaporkan masalah yang tidak tercakup dokumentasi dan memantau
perkembangannya langsung dari dashboard.

**Akses:** sidebar owner — item "Tiket Bantuan" (`/dashboard/support`).

**Alur:**

1. Owner klik "Tiket baru" → isi **subjek**, **kategori** (Pembayaran, Kiosk/Photobox,
   Template & Frame, Voucher, Paket & Harga, Dashboard & Laporan, Subscription, Lainnya),
   **bagian yang bermasalah** (Checkout/QRIS, Gateway, Sesi foto/kamera, Cetak/printer,
   Aktivasi device, POS kasir, Aplikasi web, Lainnya), dan **deskripsi** masalah.
2. Tiket tersimpan dengan status `open`.
3. Owner memantau status tiap tiket — **Terbuka** (`open`), **Butuh tindakan**
   (`needs_action`), **Selesai** (`resolved`).
4. Owner bisa membalas (`support_ticket_replies`) selama tiket belum `resolved`;
   balasan owner membuka kembali tiket yang sudah `resolved` → `open`.

**Data:** tabel `support_tickets` + `support_ticket_replies` (migration 0050).

**UI/Components:** `SupportTicketsPanel` (list + form baru), `SupportTicketDetail`
(thread balasan + form balasan), `StatusBadge` (open/needs_action/resolved).

**States:** empty (belum ada tiket), error form (validasi), pending (submit), resolved
(tidak menerima balasan baru).

**Acceptance:** owner bisa submit masalah, melihat status (terbuka/butuh tindakan/selesai),
dan membalas; admin platform menindaklanjuti via `/admin/support` (docs/10 §10.6).
