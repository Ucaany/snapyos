# 02 — Owner Dashboard Flow

**Role**: `business_members.role = 'owner' | 'manager'` (business role)

**Route Group**: `(dashboard)` → `/dashboard/*`

**Purpose**: Mengelola bisnis photobox — outlets, photoboxes, packages, templates, vouchers, staff, transactions, finance, analytics, subscription, settings.

---

## 1. Overview Dashboard

**Page**: `/dashboard` → `src/app/(dashboard)/dashboard/page.tsx`

**Server Actions**: `src/server/dashboard.ts`

- `getDashboardMetrics` — revenue today/month, gross/net, sessions, transactions, avg transaction
- `getDashboardCharts` — revenue chart data

**Data Flow**:

```
SSR page component → getDashboardMetrics(businessId)
   ↓ query transactions (status='paid', business_id scoped)
   ↓ compute: gross=sum(final_amount), discount=sum(discount_amount), net=gross−discount
   ↓ avg_transaction = net / count(paid), active_photoboxes, active_outlets
   ↓ render MetricCard grid + AreaChart
```

**Metrics Cards**:

- Revenue Today (IDR integer)
- Revenue This Month
- Gross Revenue (final_amount sum)
- Net Revenue (gross − discount)
- Total Sessions
- Paid Transactions
- Total Customers
- Average Transaction Value (net / count)
- Active Photoboxes (`status='online'`)
- Active Outlets (`status='active'`)

**Components**: `Card` (Neo-Brutalism thick border 4px + hard shadow), `MetricCard`, `AreaChart` (shadcn/ui Charts), `DateRangeFilter`.

**Validation**: `from`/`to` tanggal valid; default this month.

**States**:

- Loading: skeleton metric cards + chart
- Empty: "Belum ada transaksi" + CTA disabled (backlog)
- Error: Alert dengan retry

**Permission**: OWNER, MANAGER (full). STAFF read-only subset (metrics tanpa financial detail).

**Security**: semua query `.eq('business_id', businessId)` dari `getMembership()`; tidak boleh lintas tenant.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/page.tsx`
- Server: `src/server/dashboard.ts`
- Components: `src/components/dashboard/MetricCard.tsx`, `src/components/ui/card.tsx`

**Acceptance**: (AC 35–39) revenue masuk dashboard, discount tidak dihitung sebagai revenue, gross/net tampil benar.

---

## 2. Revenue Analytics

**Page**: `/dashboard/analytics` → `src/app/(dashboard)/dashboard/analytics/page.tsx`

**Server Actions**: `src/server/analytics.ts`

- `getRevenueAnalytics` — revenue by day
- `getRevenueByOutlet`
- `getRevenueByPackage`
- `getRevenueByPhotobox`
- `getRevenueByPaymentMethod`

**Filters**:

- Today, Last 7 days, Last 30 days, This month, Last month, This year, Custom date range
- Breakdown: by day, by outlet, by package, by photobox, by payment method

**Data Flow**:

```
Filter change → server action with (businessId, from, to, breakdown)
   ↓ SQL GROUP BY transactions (status='paid')
   ↓ aggregate: sum(final_amount), count, group by dimension
   ↓ return chart data [{date, revenue}, ...] or [{name, value}, ...]
   ↓ render Chart component
```

**Components**: `Tabs` (breakdown), `AreaChart`, `BarChart`, `PieChart` (shadcn/ui Charts), `DateRangeFilter` + `Popover` + `Calendar`.

**Validation**: date range valid; breakdown enum valid.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/analytics/page.tsx`
- Server: `src/server/analytics.ts`
- Components: `src/components/analytics/RevenueChart.tsx`, `src/components/ui/chart.tsx`

**Acceptance**: chart menggunakan shadcn/ui Charts; filter custom range berfungsi; data konsisten dengan dashboard overview.

---

## 3. Business Metrics

**Page**: `/dashboard/metrics` → `src/app/(dashboard)/dashboard/metrics/page.tsx`

**Server Actions**: `src/server/metrics.ts`

- `getBusinessMetrics` — metrik operasional menyeluruh

**Sections**:

1. **Revenue**: gross, discount, net, growth %
2. **Transactions**: total, paid, pending, failed, cancelled, refunded (count per status)
3. **Sessions**: total, completed, cancelled, retakes count, avg duration
4. **Customers**: total, new (this period), returning
5. **Photobox**: sessions per booth, revenue per booth, most popular package, most used template

**Data Flow**:

```
SSR → getBusinessMetrics(businessId, from, to)
   ↓ query transactions, sessions, customers aggregates
   ↓ compute growth = (current − previous) / previous * 100
   ↓ render metric sections
```

**Components**: `Card`, `Stat`, `Progress`, hand-rolled `Table`, charts.

**Acceptance**: semua angka konsisten dengan halaman Dashboard & Transactions.

---

## 4. Finance

**Page**: `/dashboard/finance` → `src/app/(dashboard)/dashboard/finance/page.tsx`

**Server Actions**: `src/server/finance.ts`, `src/server/finance-actions.ts`

- `getFinanceSummary` — income vs expense
- `createExpenseAction`, `updateExpenseAction`, `deleteExpenseAction`

**Income categories**: Photobox session, Event, Printing, Additional services, Other income.

**Expense categories**: Rent, Electricity, Internet, Paper, Ink, Maintenance, Staff, Equipment, Advertising, Other operational.

**Perhitungan**:

```
Net Revenue = sum(transactions.final_amount where status='paid')
Expenses = sum(expenses.amount)
Estimated Profit = Net Revenue − Expenses
Profit Margin = Profit / Net Revenue * 100
```

**Tampilan**:

- Gross Revenue (transactions sum final_amount)
- Discounts (transactions sum discount_amount)
- Net Revenue
- Total Expenses
- Estimated Profit
- Profit Margin %

**Expense CRUD**:

- `Dialog` form: name, amount (int > 0), category (select), expense_date (date), outlet_id (nullable), note (textarea)
- `DataTable` list expenses + filter by date/category/outlet

**Data Flow**:

```
Owner tekan [ TAMBAH PENGELUARAN ]
   ↓ Dialog form (controlled useActionState)
   ↓ submit → createExpenseAction(businessId, data)
      ↓ validate: amount > 0, category valid, date valid
      ↓ insert expenses (business_id scoped)
      ↓ revalidatePath('/dashboard/finance')
   ↓ Dialog close, list refresh
```

**Components**: `Card`, `Form` (shadcn), `Dialog` (tambah expense), `DataTable`, `Select` kategori.

**Validation**: amount > 0 integer; kategori enum valid; tanggal valid; outlet_id harus milik business (jika diisi).

**Permission**: OWNER, MANAGER. STAFF read-only (jika diizinkan di RBAC).

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/finance/page.tsx`
- Server: `src/server/finance.ts`, `src/server/finance-actions.ts`
- Components: `src/components/finance/ExpenseDialog.tsx`, `src/components/finance/ExpenseTable.tsx`

**Acceptance**: (AC 39–40) owner melihat expenses & estimated profit; CRUD expense berfungsi.

---

## 5. Transaction Management

**Page**: `/dashboard/transactions` (list belum ada dedicated page — backlog; list ada di dashboard finance)

**Server Actions**: `src/server/transactions.ts`

- `listTransactions` — filter, pagination
- `getTransaction` — detail satu transaksi
- `createManualTransaction` — pencatatan manual (cash/other)

**Table columns**: Transaction ID (number), Date (paid_at), Customer (name atau "—"), Package (name), Outlet (name), Photobox (name), Payment Method (qris/cash/bank_transfer/other/offline/manual), Gross Amount (IDR), Discount (IDR), Final Amount (IDR), Status (badge).

**Status enum**: `pending`, `paid`, `failed`, `cancelled`, `refunded`.

**Filters**:

- Date range (from/to)
- Outlet (dropdown businesses.outlets)
- Photobox (dropdown businesses.photoboxes)
- Package (dropdown businesses.packages)
- Payment method (select enum)
- Status (select enum)

**Search**: Transaction number, customer name/phone/email (jika ada).

**Data Flow (List)**:

```
Filter/search → listTransactions(businessId, filters, page, limit)
   ↓ query transactions join customers, packages, outlets, photoboxes, payments
   ↓ filter: .eq('business_id'), status IN, method IN, date range, etc.
   ↓ pagination: offset/limit, count total
   ↓ return { data: Transaction[], meta: { page, limit, total, totalPages } }
   ↓ render DataTable
```

**Data Flow (Detail)**:

```
Klik row → getTransaction(businessId, transactionId)
   ↓ query single transaction + joins
   ↓ breakdown: gross, discount, final, payment_method, voucher (if any), paid_at, status
   ↓ render Dialog detail
```

**Data Flow (Manual Transaction)**:

```
Owner tekan [ CATAT TRANSAKSI MANUAL ]
   ↓ Dialog form: outlet, photobox, package, payment_method (cash/bank_transfer/other), amount, note
   ↓ submit → createManualTransaction(businessId, data)
      ↓ validate: amount > 0, method valid, outlet/photobox/package exists
      ↓ insert transactions (status='paid', payment_method='manual', withdrawable=false)
      ↓ insert audit_log (action='transaction.manual_create')
      ↓ **TIDAK** creditBalance (kebijakan: manual tidak masuk saldo)
   ↓ revalidate, list refresh
```

**Components**: `DataTable` (shadcn `Table` + `ColumnDef`), `Input` search, `Select`/`Combobox` filter, `Popover`+`Calendar` date filter, `StatusBadge`, `Dialog` detail transaksi.

**Validation**: manual transaction amount > 0; method enum valid; resource ID harus milik business.

**States**: Loading skeleton, empty ("Belum ada transaksi"), error alert.

**Security**: hanya transaksi milik business; composite `.eq('id', transactionId).eq('business_id', businessId)` → 404.

**Permission**: OWNER, MANAGER (full). STAFF read-only (tanpa manual create).

**File Locations**:

- Server: `src/server/transactions.ts`
- Components: `src/components/transactions/TransactionsTable.tsx`, `src/components/transactions/TransactionDetail.tsx`

**Acceptance**: (AC 41) owner melihat transaction history dengan filter & search; manual transaction tercatat tanpa kredit saldo.

---

## 6. Outlets Management

**Page**: `/dashboard/outlets` → `src/app/(dashboard)/dashboard/outlets/page.tsx`

**Server Actions**: `src/server/outlets.ts`

- `createOutlet`, `updateOutlet`, `deleteOutlet`, `getOutletAnalytics`

**Fields**: name (text), address (textarea nullable), city (text nullable — kabupaten/kota), province (text nullable — provinsi), status (`active`/`inactive`).

**Data Flow (Create)**:

```
Owner tekan [ BUAT OUTLET ]
   ↓ Dialog form
   ↓ submit → createOutlet(businessId, data)
      ↓ check plan limit: max_outlets
         ↓ if reached → throw OUTLET_LIMIT_REACHED
      ↓ validate: name not empty
      ↓ insert outlets (business_id scoped)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Update)**:

```
Edit outlet → updateOutlet(businessId, outletId, data)
   ↓ composite query .eq('id', outletId).eq('business_id', businessId)
   ↓ update fields
   ↓ revalidate
```

**Data Flow (Delete)**:

```
Delete outlet → deleteOutlet(businessId, outletId)
   ↓ check dependencies (photoboxes, transactions, packages m2m, vouchers m2m)
   ↓ if has dependencies → throw CANNOT_DELETE (or soft-delete: status='inactive')
   ↓ delete cascade or soft-delete
   ↓ revalidate
```

**Outlet Analytics**:

- Revenue (sum transactions.final_amount where outlet_id)
- Sessions count
- Customers count (distinct customer_id)
- Average transaction (revenue / count)
- Most popular package (group by package_id, max count)

**Data Flow (Analytics)**:

```
Klik outlet row → getOutletAnalytics(businessId, outletId, from, to)
   ↓ aggregate transactions, sessions, customers
   ↓ render detail view (Sheet/Dialog) dengan metrics + chart
```

**Components**: `DataTable`, `Dialog`/`Sheet` form, `StatusBadge`, outlet detail Tabs (overview, photoboxes, analytics).

**Validation**: name wajib; city/province nullable; status enum valid; check `max_outlets` plan limit.

**Permission**: OWNER, MANAGER. STAFF read-only.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/outlets/page.tsx`
- Server: `src/server/outlets.ts`
- Components: `src/components/outlets/OutletForm.tsx`, `src/components/outlets/OutletTable.tsx`

**Acceptance**: (AC 5, 43) owner membuat outlet & melihat performanya; limit plan di-enforce.

---

## 7. Photoboxes Management

**Page**: `/dashboard/photoboxes` → `src/app/(dashboard)/dashboard/photoboxes/page.tsx`

**Server Actions**: `src/server/photoboxes.ts`, `src/server/booth-actions.ts`

- `createPhotobox`, `updatePhotobox`, `deletePhotobox`

**Fields**: name, slug (unique per business), outlet_id (FK), status (`online`/`offline`/`maintenance`), camera (text nullable), printer (text nullable), display (text nullable), default_template_id (FK nullable), camera_settings (jsonb), print_settings (jsonb), session_settings (jsonb), exit_pin_hash (hash nullable), pos_enabled (boolean default false).

**Status enum**: `online`, `offline`, `maintenance`.

**Data Flow (Create)**:

```
Owner tekan [ BUAT PHOTOBOX ]
   ↓ Dialog form: name, slug, outlet
   ↓ submit → createPhotobox(businessId, data)
      ↓ check plan limit: max_photoboxes
         ↓ if reached → throw PHOTOBOX_LIMIT_REACHED
      ↓ validate: name, slug unique per business, outlet_id milik business
      ↓ insert photoboxes (business_id scoped)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Update)**:

```
Edit photobox → updatePhotobox(businessId, photoboxId, data)
   ↓ composite .eq('id').eq('business_id')
   ↓ update: name, slug, outlet, status, default_template, settings
   ↓ revalidate
```

**Data Flow (Delete)**:

```
Delete photobox → deletePhotobox(businessId, photoboxId)
   ↓ check dependencies (sessions, devices, transactions)
   ↓ if has → throw CANNOT_DELETE atau soft-delete
   ↓ delete/soft-delete
   ↓ revalidate
```

**Device Activation** (lihat §7.1):

- Owner buka detail photobox → [ TAMPILKAN KODE/QR ]
- Generate activation_codes (expires ~5 menit, sekali pakai)
- Display kode + QR
- Device scan/input → POST /api/v1/public/devices/activate → device_token issued
- Device persisten sampai di-revoke

**Device Management**:

- List devices teraktivasi (`GET /api/v1/business/:businessId/devices`)
- Revoke device (`DELETE /api/v1/business/:businessId/devices/:id`)

**Components**: `DataTable`/grid, `Dialog` create/edit, `Form`, `StatusBadge`, `Select` outlet & default template, multi-select packages, device status (jika tersedia).

**Validation**: name wajib; slug unique per business, lowercase alphanumeric+dash; outlet harus milik business; status enum valid; cek `max_photoboxes` limit.

**Permission**: OWNER, MANAGER. STAFF read-only.

**API Endpoints (device)**:

- `GET /api/v1/business/:businessId/photoboxes/:id/activation` — generate kode+QR
- `GET /api/v1/business/:businessId/devices` — daftar device
- `DELETE /api/v1/business/:businessId/devices/:id` — revoke

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/photoboxes/page.tsx`
- Server: `src/server/photoboxes.ts`, `src/server/booth-actions.ts`, `src/server/devices.ts`
- Components: `src/components/photoboxes/PhotoboxForm.tsx`, `src/components/photoboxes/PhotoboxTable.tsx`, `src/components/photoboxes/DeviceDialog.tsx`

**Acceptance**: (AC 5, 44) owner membuat photobox & melihat performanya; device activation berfungsi; limit plan di-enforce.

---

(runtime lokal), bukan dari browser owner. Tidak ada tombol uji kamera jarak jauh: hardware
hanya bisa diuji di lokasi, dan halaman yang mencoba melakukannya sudah dihapus.

**Yang tetap di dashboard** (form ubah booth):

- `name`, `slug`, `outlet_id`, `status`, `payment_mode`
- `exit_pin` (write-only, 4–8 digit; di-hash argon2id di server — form tidak pernah menampilkan PIN lama)
- `print_settings.copies` (biaya bahan) dan `print_settings.layout` (bentuk output pelanggan)

**Yang ditolak dari sesi pengguna** (`src/lib/photobox-form-fields.ts`): seluruh field kamera,
printer fisik, dan sesi. Bila dikirim lewat form, action mengembalikan error yang
menyebut field mana, bukan membuangnya diam-diam. Jalur sah satu-satunya adalah device token
(`PATCH /api/v1/public/devices/settings`).

**Panel cermin** (dialog **Perangkat**, `DeviceDialog`):

- Resolusi kamera dan status uji printer dari `device_status` (laporan setup wizard)
- Printer aktif (`print_settings.printer_name`) dan ukuran kertas (`paper_size`)
- "Dilaporkan: <waktu>" dari `last_seen_at`; belum pernah → "Belum pernah dilaporkan"
- [ ULANGI SETUP ] — revoke device → re-pair → setup wizard jalan lagi

Tidak ada tombol "minta booth melapor": belum ada kanal perintah cloud → runtime. Laporan
datang sendiri lewat heartbeat device.

**Setup Wizard (device-side, tidak ada UI owner)**:

- Berjalan sekali setelah device activation
- Grant permission kamera → detect kamera → pilih kamera → print test → selesai
- Customer tidak pernah melihat wizard ini (hidden dari flow customer)
- Owner hanya melihat hasilnya di panel cermin

**Permission**: OWNER, MANAGER.

**File Locations**:

- Server: `src/server/photoboxes.ts`, `src/server/booth-actions.ts`, `src/lib/photobox-form-fields.ts`
- Components: `src/components/dashboard/PhotoboxForm.tsx`, `src/components/dashboard/DeviceDialog.tsx`

**Acceptance**: owner mengatur identitas dan kebijakan bisnis booth; setelan mesin datang dari
laporan booth; field mesin yang dikirim dari dashboard ditolak.

---

## 8. Packages Management

**Page**: `/dashboard/packages` → `src/app/(dashboard)/dashboard/packages/page.tsx`

**Server Actions**: `src/server/catalog-actions.ts`

- `createPackage`, `updatePackage`, `deletePackage`

**Fields**: name, price (int IDR), photo_count (int >= 1), print_count (int >= 0), digital_output (boolean), description (text), is_active (boolean), applicable outlets (m2m), applicable photoboxes (m2m), available templates (m2m — slot frame menentukan capture; template legacy memakai photo_count package).

**Data Flow (Create)**:

```
Owner tekan [ BUAT PACKAGE ]
   ↓ Dialog form: name, price, photo_count, print_count, digital_output, description
   ↓ submit → createPackage(businessId, data)
      ↓ validate: price > 0, photo_count >= 1, print_count >= 0, name not empty
      ↓ insert packages (business_id scoped)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Assign Templates)**:

```
Edit package → multi-select templates
   ↓ filter assignment template; semua slot valid, template legacy layout kosong memakai photo_count package
   ↓ submit → updatePackage with template_ids[]
      ↓ delete package_templates where package_id
      ↓ insert package_templates (package_id, template_id) bulk
      ↓ revalidate
```

**Data Flow (Assign Outlets/Photoboxes)**:

```
Edit package → multi-select outlets/photoboxes
   ↓ submit → updatePackage with outlet_ids[], photobox_ids[]
      ↓ delete package_outlets, package_photoboxes where package_id
      ↓ insert bulk m2m
      ↓ revalidate
```

**Components**: `DataTable`, `Dialog` form, multi-select (`Combobox`), `Switch` active, price input (integer IDR, Space Mono font).

**Validation**: price > 0; photo_count >= 1; print_count >= 0; name wajib; template assignment tidak dibatasi oleh slot_count.

**Backend Logic**: package adalah dasar perhitungan final amount di checkout (server-side); frame ber-slot menentukan jumlah capture kiosk, sedangkan `photo_count` hanya menjadi fallback untuk template legacy tanpa slot. `print_count` menentukan jumlah lembar cetak.

**Permission**: OWNER, MANAGER. STAFF read-only.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/packages/page.tsx`
- Server: `src/server/catalog-actions.ts`
- Components: `src/components/dashboard/PackagesTable.tsx`, `src/components/dashboard/PackageFields.tsx`, `src/components/dashboard/PackageEditForm.tsx`

**Acceptance**: (AC 7) owner membuat package; package muncul di customer app (filtered by outlet/photobox); template assign constraint di-enforce.

---

## 9. Template Management

**Page**: `/dashboard/templates` → `src/app/(dashboard)/dashboard/templates/page.tsx`

**Server Actions**: `src/server/templates.ts`

- `createTemplate`, `updateTemplate`, `deleteTemplate`, `uploadTemplate`

**Fields**: name, category_id (FK → template_categories), file_url (storage key PNG frame), thumbnail_url (auto-generate atau manual), layout (jsonb — slot builder contract, lihat `15-template-builder.md`), video_url (nullable), is_active (boolean).

**Default Categories** (tabel `template_categories`): Minimal, Cute, Retro, Y2K, Wedding, Birthday, Graduation, Event, Custom.

**Template Types**:

- **Template legacy** (layout kosong `{}`) — overlay full-canvas tanpa slot, backward compatible
- **Template slot** (layout dengan canvas + slots array) — owner definisikan slot foto via builder

**Data Flow (Upload)**:

```
Owner tekan [ UPLOAD TEMPLATE ]
   ↓ Dialog upload: PNG frame (transparan), name, category
   ↓ submit → uploadTemplate(businessId, file, { name, category_id })
      ↓ validate: file type PNG/JPG/WebP/SVG, max size (8MB), name not empty
      ↓ upload ke storage → file_url
      ↓ generate thumbnail (auto via canvas preview)
      ↓ insert templates (business_id scoped, layout='{}' default)
      ↓ revalidate
   ↓ redirect ke /dashboard/templates/builder/[id] (opsional, langsung edit slot)
```

**Data Flow (Builder — lihat §9.1)**:

```
Owner klik [ EDIT SLOT ] atau [ BUAT BARU ]
   ↓ redirect ke /dashboard/templates/builder/[id]
   ↓ Builder canvas: tambah slot (drag kotak), atur shape/pos/ukur/rotasi/fit
   ↓ Preview: semua slot diisi foto sample (persis hasil kiosk)
   ↓ Simpan → updateTemplate(businessId, templateId, { layout })
      ↓ validate layout schema (§15.2): max 8 slots, x/y/w/h dalam batas canvas, rotation −180..180
      ↓ update templates.layout
      ↓ revalidate
```

**Data Flow (Toggle Active)**:

```
Toggle is_active → updateTemplate(businessId, templateId, { is_active })
   ↓ update templates.is_active
   ↓ revalidate
```

**Data Flow (Delete)**:

```
Delete template → deleteTemplate(businessId, templateId)
   ↓ check dependencies (package_templates, sessions)
   ↓ if has → throw CANNOT_DELETE atau soft-delete (is_active=false)
   ↓ delete atau soft-delete
   ↓ revalidate
```

**Components**: grid preview, `Dialog` upload/create, `Select` kategori, `Switch` active, `Tabs` assign package.

**Validation**: file type valid; max size; nama wajib; layout valid (schema `15-template-builder.md` §15.2); assign template→package tidak dibatasi slot_count.

**Security**: upload divalidasi (type, size, malicious payload); preview pakai signed URL jika private; `layout` divalidasi server-side (trust boundary).

**Permission**: OWNER, MANAGER. STAFF read-only.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/templates/page.tsx`
- Builder: `src/app/(dashboard)/dashboard/templates/builder/[id]/page.tsx`
- Server: `src/server/templates.ts`
- Components: `src/components/dashboard/TemplatesGrid.tsx`, `src/components/dashboard/TemplateBuilderCanvas.tsx`

**Acceptance**: (AC 8) owner upload template; template bisa dipilih customer; builder slot berfungsi (§9.1).

---

## 9.1 Template Builder (Slot Editor)

**Page**: `/dashboard/templates/builder/[id]` → `src/app/(dashboard)/dashboard/templates/builder/[id]/page.tsx`

**Purpose**: Owner menambahkan **slot foto** (kotak/shape) di atas frame PNG via drag-and-drop → customer hasil foto otomatis ter-composite pas ke slot.

**Flow**:

```
[ BUAT BARU ] → pilih preset canvas (4x6-portrait/landscape/strip/square/custom)
   ↓ upload PNG frame (alpha = area transparan untuk foto)
   ↓ Builder canvas:
      [ + TAMBAH SLOT ] → drag gambar kotak di canvas
      pilih slot → panel properti: shape (rect/rounded/circle/ellipse), x/y/w/h, rotation, radius, fit (cover/contain)
      drag / resize handles / rotate handle langsung di canvas
      [ PREVIEW ] → semua slot diisi foto sample → persis hasil kiosk
   ↓ [ SIMPAN DRAFT ] (is_active=false) / [ PUBLISH ] (is_active=true)
```

**Layout Contract** (`templates.layout` jsonb):

```json
{
  "version": 1,
  "canvas": { "width": 1200, "height": 1800, "preset": "4x6-portrait" },
  "slots": [
    {
      "id": "slot_1",
      "shape": "rect",
      "x": 100,
      "y": 200,
      "width": 1000,
      "height": 700,
      "rotation": 0,
      "radius": 24,
      "fit": "cover",
      "z": 0
    }
  ]
}
```

**Canvas Presets**:

- `4x6-portrait`: 1200×1800
- `4x6-landscape`: 1800×1200
- `2x6-strip`: 600×1800
- `square`: 1500×1500
- `custom`: max 3000×3000

**Slot Properties**:

- `shape`: `rect` | `rounded` | `circle` | `ellipse`
- `x, y, width, height`: px design (absolut, bukan persen)
- `rotation`: derajat −180..180 (pivot center slot)
- `radius`: corner radius px (hanya `rounded`)
- `fit`: `cover` (default) | `contain`
- `z`: urutan render (kecil dulu); foto customer masuk slot urut `z` (`photos.order_index` → slot urut `z`)

**Validasi Server-Side** (trust boundary):

- Slot: `width > 0`, `height > 0`, `x >= 0`, `y >= 0`, `x+width <= canvas.width`, `y+height <= canvas.height`
- Rotation −180..180, radius >= 0
- Shape enum valid
- Max 8 slots per template
- Assign template→package tidak dibatasi slot_count; frame menentukan capture

**Aturan Builder**:

- Slot tidak bisa digeser/resize keluar batas canvas (clamp saat drag)
- Minimal 1 slot untuk publish (template tanpa slot = legacy overlay; konfirmasi eksplisit jika publish tanpa slot)
- Thumbnail WebP dibuat dari frame yang diunggah (fallback: frame)

**Render Engine**: builder preview dan editor kiosk sama-sama memakai `composeFrame`; JPEG final dirender di editor kiosk, lalu print dan result online memakai JPEG itu (tanpa render ulang di server).

**Urutan Render** (`composeFrame(ctx, layout, frameImg, photos, transforms)`):

1. Clear canvas ke resolusi `canvas.width × canvas.height`
2. Untuk setiap slot urut `z` naik:
   - Clip ke shape path (rect/roundRect/ellipse; rotation via `ctx.rotate` di center slot)
   - `drawImage` foto terkait dengan `fit` cover/contain + transform zoom/pan customer (clamp minimal cover-fit)
3. `drawImage` frame PNG di-rect penuh canvas (0,0,w,h)
4. Sticker & text digambar di atas

**Components**: `TemplateBuilder` (canvas), `SlotShape` (hitbox + handles), `SlotPropertiesPanel`, `TemplatePreview`.

**UI Wajib Neo-Brutalism** — load skill `industrial-brutalist-ui` sebelum implementasi (aturan `AGENTS.md`/`13-skill-anti-slop.md`).

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/templates/builder/[id]/page.tsx`
- Server: `src/server/templates.ts` (updateTemplate dengan layout validation)
- Components: `src/components/dashboard/TemplateBuilderCanvas.tsx`
- Engine: `src/lib/compose-frame.ts` (shared untuk builder/kiosk/print)

**Acceptance** (AC dari `15-template-builder.md`):

1. Owner upload PNG + tambah ≥1 slot + publish tanpa training (< 2 menit)
2. Customer memilih frame → foto hasil capture muncul pas di setiap slot (cover-fit, rasio tidak terdistorsi)
3. Template dengan slot berbeda dari package tetap dapat di-assign; slot frame menentukan capture dan template legacy memakai photo_count package
4. Hasil print & result online memakai JPEG final yang dirender di editor kiosk (bukan render ulang di server)
5. Template legacy (layout kosong) tetap berfungsi — backward compatible
6. Validasi layout di-enforce server-side (request dengan layout invalid ditolak 4xx)

---

## 10. Voucher Management

**Page**: `/dashboard/vouchers` (tidak ada dedicated page — backlog; CRUD ada via server actions)

**Server Actions**: `src/server/vouchers.ts`

- `createVoucher`, `updateVoucher`, `deleteVoucher`, `getVoucherAnalytics`

**Fields**: code (text unique per business, uppercase), type (`percentage`/`fixed`), amount (int — persen 1–100 atau nominal IDR), start_date, end_date, usage_limit (int nullable — null = unlimited), usage_per_customer (int default 1), min_transaction (int default 0), max_discount (int nullable), applicable packages (m2m), applicable outlets (m2m), is_active (boolean).

**Types**:

- `percentage`: discount = `amount`% dari gross (capped by `max_discount`)
- `fixed`: discount = `amount` IDR flat

**Data Flow (Create)**:

```
Owner tekan [ BUAT VOUCHER ]
   ↓ Dialog form: code, type, amount, dates, limits, min_transaction, max_discount
   ↓ submit → createVoucher(businessId, data)
      ↓ validate: code unique per business uppercase, type enum, amount > 0, dates valid, limits valid
      ↓ insert vouchers (business_id scoped)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Assign Packages/Outlets)**:

```
Edit voucher → multi-select packages/outlets
   ↓ submit → updateVoucher with package_ids[], outlet_ids[]
      ↓ delete voucher_packages, voucher_outlets where voucher_id
      ↓ insert bulk m2m
      ↓ revalidate
```

**Validation**:

- Code unique per business, uppercase, alphanumeric+dash
- Type enum (`percentage`/`fixed`)
- Amount: percentage 1–100, fixed > 0
- Dates: start <= end
- usage_limit >= 1 atau null
- usage_per_customer >= 1
- min_transaction >= 0
- max_discount >= 0 atau null

**Voucher Analytics** (per voucher):

- Total usage (count `voucher_usages`)
- Total discount (sum `voucher_usages.discount_amount`)
- Revenue generated (sum `transactions.final_amount` where voucher used)
- Active vouchers count
- Expired vouchers count

**Data Flow (Analytics)**:

```
Klik voucher row → getVoucherAnalytics(businessId, voucherId, from, to)
   ↓ aggregate voucher_usages join transactions
   ↓ render detail view dengan metrics
```

**Backend Logic (Apply Voucher — server-side)**:

```
Customer input voucher code → POST /api/v1/public/:businessSlug/checkout/apply-voucher
   ↓ validate server-side:
      - Voucher exists + business_id match
      - is_active = true
      - Date validity (start <= now <= end)
      - Usage limit (total)
      - Usage per customer (count by customer_id)
      - Min transaction (gross >= min_transaction)
      - Package eligibility (voucher_packages m2m)
      - Outlet eligibility (voucher_outlets m2m)
   ↓ compute discount:
      - percentage: (gross * amount / 100), capped by max_discount
      - fixed: amount, capped by gross
   ↓ return { discount_amount, final_amount }
   ↓ frontend display discount
```

**TOCTOU Re-check** (saat payment paid):

```
Webhook paid → runPaidSideEffects → voucher_usages insert
   ↓ re-check usage_limit (count voucher_usages where voucher_id)
   ↓ if over limit → log warning (payment already settled, tidak di-rollback)
   ↓ insert voucher_usages (voucher_id, customer_id, transaction_id, discount_amount, used_at)
```

**Components**: `DataTable`, `Dialog` form, `Select` tipe, `Switch` active, multi-select package/outlet.

**Permission**: OWNER, MANAGER. STAFF read-only.

**File Locations**:

- Server: `src/server/vouchers.ts`
- Components: `src/components/dashboard/VouchersTable.tsx`, `src/components/dashboard/VoucherFields.tsx`, `src/components/dashboard/VoucherEditForm.tsx`

**Acceptance**: (AC 9, 42) owner membuat voucher; voucher tervalidasi server-side saat dipakai; owner melihat voucher usage.

---

## 11. Staff Management (RBAC)

**Page**: `/dashboard/staff` → `src/app/(dashboard)/dashboard/staff/page.tsx`

**Server Actions**: `src/server/staff-actions.ts`

- `inviteStaff`, `updateStaffRole`, `revokeStaff`

**Roles** (`business_members.role`):

- `owner`: full access (`["*"]` permission)
- `manager`: hampir semua kecuali staff-write & billing
- `staff`: read-only (operations, sessions, basic transactions — tanpa financial detail)

**Data Flow (Invite)**:

```
Owner tekan [ UNDANG STAFF ]
   ↓ Dialog form: email, role (dropdown)
   ↓ submit → inviteStaff(businessId, { email, role })
      ↓ check plan limit: max_staff
         ↓ if reached → throw STAFF_LIMIT_REACHED
      ↓ validate: email format valid, role enum valid
      ↓ lookup user by email:
         ↓ if not exists → create user (status='active')
      ↓ insert business_members (business_id, user_id, role)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Update Role)**:

```
Change role → updateStaffRole(businessId, userId, newRole)
   ↓ composite .eq('business_id').eq('user_id')
   ↓ validate: new role enum valid, cannot change owner role (throw FORBIDDEN)
   ↓ update business_members.role
   ↓ revalidate
```

**Data Flow (Revoke)**:

```
Revoke staff → revokeStaff(businessId, userId)
   ↓ composite .eq('business_id').eq('user_id')
   ↓ validate: cannot revoke owner (throw FORBIDDEN)
   ↓ delete business_members row
   ↓ revalidate
```

**Permission Matrix** (`src/lib/rbac.ts`):

```typescript
const PERMISSIONS = {
  owner: ["*"],
  manager: [
    "business:read",
    "business:write",
    "outlet:*",
    "photobox:*",
    "package:*",
    "template:*",
    "voucher:*",
    "customer:*",
    "session:*",
    "transaction:read",
    "transaction:write",
    "finance:read",
    "analytics:read",
    "report:read",
    "staff:read", // NOT staff:write
    // NOT subscription:*, NOT payment_credential:*
  ],
  staff: [
    "business:read",
    "outlet:read",
    "photobox:read",
    "package:read",
    "template:read",
    "session:read",
    "transaction:read",
    "customer:read",
    // NOT *:write, NOT finance:*, NOT staff:*, NOT subscription:*
  ],
};
```

**Enforcement**:

- Server-side: `getMembership(userId, businessId)` → non-member = 404 (anti existence-leak)
- `can(role, permission)` — `src/lib/rbac.ts:36`
- Guard composite `.eq('business_id', businessId)` → cross-tenant = 0 rows = 404

**Components**: `DataTable`, `Dialog` invite/assign role, `Select` role, `Badge` role.

**Validation**: email valid; role enum valid; max_staff limit; tidak bisa ubah/revoke owner.

**Permission**: OWNER (full). MANAGER bisa invite staff (jika diizinkan). STAFF tidak punya akses staff management.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/staff/page.tsx`
- Server: `src/server/staff-actions.ts`
- RBAC: `src/lib/rbac.ts`
- Tenant: `src/lib/tenant.ts`

**Acceptance**: (AC 47) RBAC berjalan — staff tidak otomatis melihat seluruh financial info; invite staff berfungsi; limit plan di-enforce.

---

## 12. Subscription Management

**Page**: `/dashboard/subscription` → `src/app/(dashboard)/dashboard/subscription/page.tsx`

**Server Actions**: `src/server/subscription.ts`, `src/server/subscription-actions.ts`

- `getSubscription`, `createSubscriptionInvoice`, `cancelAddOn`

**Data Display**:

- Current plan (starter/growth/business)
- Status (`trial`/`active`/`past_due`/`cancelled`/`expired`)
- Trial ends at (jika trial)
- Current period start/end
- Billing cycle (30 hari, tanpa proration)
- Cancel at period end flag

**Add-ons** (katalog platform-global, harga admin-ubah):

- Quantity-based (`unit='session'`): `extra_session` — `effectiveSessions = plan.max_concurrent_sessions + sum(addon.quantity)`
- Feature-based (`unit='feature'`): `pos` — `hasPosEntitlement()` check `subscription_add_ons.status='active'`

**Data Flow (View Subscription)**:

```
SSR → getSubscription(businessId)
   ↓ query subscriptions join plans, subscription_add_ons join add_ons
   ↓ compute entitlement:
      - effectiveSessions = plan.max_concurrent_sessions + sum(extra_session quantity)
      - hasPosEntitlement = exists(add_ons code='pos', is_active, addon_status='active')
   ↓ render plan card + add-ons list + invoices list
```

**Data Flow (Add Add-on — via Invoice QRIS)**:

```
Owner klik [ TAMBAH ADD-ON ]
   ↓ Dialog pilih add-on + quantity (jika quantity-based)
   ↓ submit → createSubscriptionInvoice(businessId, { addOnCode, quantity })
      ↓ fetch add_on by code (harga dari DB, admin-configurable)
      ↓ compute amount = add_on.price_<siklus> * quantity (atau price flat per siklus jika feature)
      ↓ insert invoices (status='pending', intent={ type:'add_on', add_on_id, quantity })
      ↓ create invoice_payments QRIS (Pakasir aggregator platform)
      ↓ return { invoice_id, qr_string, total_amount, expires_at }
   ↓ redirect ke /dashboard/subscription/invoice/[id] (display QR)
   ↓ polling status atau webhook paid
   ↓ webhook paid → markInvoicePaid → applyInvoiceIntent:
      - upsert subscription_add_ons (quantity, status='active', cancel_at_period_end=false)
      - flag intent.applied = true (idempotent)
   ↓ entitlement aktif, owner redirect back to /dashboard/subscription
```

**Data Flow (Cancel Add-on)**:

```
Owner klik [ CANCEL ADD-ON ] di row add-on
   ↓ confirm dialog
   ↓ submit → cancelAddOn(businessId, addonId)
      ↓ composite .eq('subscription_add_ons.id').join('subscriptions').eq('business_id')
      ↓ update subscription_add_ons: cancel_at_period_end = true
      ↓ revalidate
   ↓ add-on tetap aktif sampai akhir periode (deferred cancel)
   ↓ cron `/api/cron/subscription-lifecycle` transisi ke status='cancelled' di akhir periode
```

**Intent Failures** (manual resolve admin):

- Conflict: add-on sudah aktif saat apply intent
- Limit: quantity exceed plan limit
- Review: `/admin/subscriptions/pending-review` — admin aktivasi manual atau refund

**Components**: plan `Card` (Neo-Brutalism), add-on list `DataTable`, invoice list, QRIS display (reuse pola kiosk checkout).

**Permission**: OWNER (full). MANAGER read-only subscription. STAFF tidak ada akses.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/subscription/page.tsx`
- Invoice: `src/app/(dashboard)/dashboard/subscription/invoice/[id]/page.tsx`
- Server: `src/server/subscription.ts`, `src/server/subscription-actions.ts`
- Components: `src/components/subscription/PlanCard.tsx`, `src/components/subscription/AddOnList.tsx`

**Acceptance**: owner melihat subscription status; add add-on via invoice QRIS; cancel add-on deferred; entitlement gate berfungsi.

---

## 13. Customers Management

**Page**: `/dashboard/customers` → `src/app/(dashboard)/dashboard/customers/page.tsx`

**Server Actions**: `src/server/customers.ts`

- `listCustomers`, `getCustomer`

**Fields**: name (nullable), phone (nullable), email (nullable), total_spending (computed), session_history, transaction_history, booking_history.

**Data Flow (List)**:

```
Page load → listCustomers(businessId, query, page, limit)
   ↓ query customers .eq('business_id')
   ↓ search: name/phone/email ILIKE
   ↓ compute total_spending per customer: sum(transactions.final_amount where customer_id)
   ↓ pagination
   ↓ return { data: Customer[], meta }
   ↓ render DataTable
```

**Data Flow (Detail)**:

```
Klik row → GET /api/v1/business/:businessId/customers/:id (fetch client-side)
   ↓ query customer + transactions + sessions + bookings
   ↓ aggregate: total_spending, session_count, transaction_count
   ↓ render Dialog detail (Tabs: transactions, sessions, bookings)
```

**Components**: `DataTable`, `Dialog` detail customer (Tabs: transaksi, sesi, booking), `Input` search.

**Security**: hanya data customer milik business; composite `.eq('id').eq('business_id')` → 404.

**Permission**: OWNER, MANAGER, STAFF (read-only).

**API Endpoint**:

- `GET /api/v1/business/:businessId/customers/:id` — detail customer

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/customers/page.tsx`
- Server: `src/server/customers.ts`
- API: `src/app/api/v1/business/[businessId]/customers/[id]/route.ts`
- Components: `src/components/customers/CustomersTable.tsx`, `src/components/customers/CustomerDetail.tsx`

**Acceptance**: owner melihat total spending & riwayat customer; search berfungsi.

---

## 14. Reports & Export

**Page**: `/dashboard/reports` → `src/app/(dashboard)/dashboard/reports/page.tsx`

**Server Actions**: (tidak ada — download via form action ke REST endpoint)

**API Endpoint**:

- `GET /api/v1/business/:businessId/reports?type=&from=&to=&format=csv|xlsx`

**Report Types**:

- Daily: transaksi per hari
- Weekly: agregasi per minggu
- Monthly: agregasi per bulan
- Revenue: breakdown revenue
- Transactions: export seluruh transaksi
- Outlet: revenue per outlet
- Photobox: revenue per photobox
- Expenses: export expenses
- Voucher: usage report

**Export Formats**:

- CSV (RFC4180, formula-injection guard)
- XLSX (ExcelJS)
- PDF (future — belum)

**Data Flow**:

```
Owner pilih report type + date range + format
   ↓ form action GET /reports → download trigger
   ↓ server generate report:
      - CSV: stream rows, escape formula injection (`=@+- prefix`)
      - XLSX: ExcelJS buffer
   ↓ response: Content-Disposition attachment, Content-Type
   ↓ browser download file
```

**Backend Logic**:

- Aggregate dari `transactions` (source of truth financial reporting)
- POS otomatis masuk report (karena insert ke `transactions`)
- CSV escape: `=@+-` prefix di-escape dengan `'` prefix

**Components**: `Card` pilihan tipe, `Select` format, `Button` export, `DateRangeFilter`.

**Permission**: OWNER, MANAGER. STAFF tidak ada akses.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/reports/page.tsx`
- API: `src/app/api/v1/business/[businessId]/reports/route.ts`
- Server: `src/server/reports.ts`

**Acceptance**: owner dapat export laporan CSV/XLSX; data konsisten dengan dashboard metrics.

---

## 15. Settings

**Page**: `/dashboard/settings` → `src/app/(dashboard)/dashboard/settings/page.tsx`

**Sub-sections**:

- Business Profile (name, logo, timezone, currency)
- Branding (lihat §15.1)
- Payment Settings (lihat §15.2)
- Retention (retensi hasil foto max 3 hari)
- Checkout (QRIS expiry, offline mode opt-in)

**Server Actions**: `src/server/business-actions.ts`, `src/server/branding-actions.ts`, `src/server/payment-credential-actions.ts`

**Data Flow (Business Profile)**:

```
Edit profile → updateBusiness(businessId, { name, timezone, currency })
   ↓ composite .eq('id', businessId).eq('owner_id', userId) (owner-only)
   ↓ validate: name not empty, timezone valid, currency valid
   ↓ update businesses
   ↓ revalidate
```

**Data Flow (Retention)**:

```
Edit retention_days → updateBusinessSettings(businessId, { retention_days })
   ↓ validate: 1 <= retention_days <= 3 (max 3 hari — migration 0034)
   ↓ update business_settings.retention_days
   ↓ revalidate
```

**Data Flow (Checkout)**:

```
Edit checkout settings → updateBusinessSettings(businessId, { checkout: { qris_expiry_minutes, offline_enabled } })
   ↓ validate: qris_expiry_minutes 1–60 default 3, offline_enabled boolean
   ↓ update business_settings.checkout
   ↓ revalidate
```

**Components**: `Tabs` (sub-sections), `Form` (shadcn), `Input`, `Select`, `Switch`.

**Permission**: OWNER (full). MANAGER read-only. STAFF tidak ada akses.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/settings/page.tsx`
- Server: `src/server/business-actions.ts`, `src/server/branding-actions.ts`

**Acceptance**: owner ubah settings; retention max 3 hari di-enforce; checkout settings tersimpan.

---

## 15.1 Branding Settings

**Page**: `/dashboard/branding` (atau `/dashboard/settings` tab Branding)

**Server Actions**: `src/server/design-builder-actions.ts`

- `saveBrandingAction` (global/booth), `uploadBrandAssetAction`, `resetBoothBrandingAction`
- Data layer: `src/server/branding.ts` (`updateBranding`, `uploadLogo`, `uploadPhotoboxLogo`, `uploadPhotoboxKioskVideo`) + `src/server/photoboxes.ts` (`updatePhotoboxBranding` mode `merge`/`replace`).

**Fields** (`business_settings.branding` jsonb):

```json
{
  "primary_color": "#FFD400",
  "secondary_color": "#FF5C8A",
  "background": "#FFFDF5",
  "typography": "Archivo Black",
  "welcome_title": "KLIK FOTO",
  "welcome_tagline": "Capture your moment.",
  "logo_url": "https://...",
  "kiosk": {
    "align": "center",
    "font_scale": 1.0,
    "button_radius": 0,
    "padding": 24,
    "pages": {
      "welcome": { "align": "center", "background": "#FFFDF5" },
      "payment": { "align": "left" }
    }
  }
}
```

**Konfigurasi**:

- Business name, logo
- Primary color, secondary color, background
- Typography (display font)
- Welcome screen: title, tagline, button start
- Kiosk (5 layar — welcome, payment, foto, edit, result):
  - Global: `align` (left/center/right), `font_scale`, `button_radius`, `padding`
  - Per-page override (`kiosk.pages`): timpa nilai global per layar (warna, perataan, font scale, radius, padding) — fallback ke nilai global bila kosong

**Data Flow (Update Branding)**:

```
Owner ubah branding → saveBrandingAction({ scope, photoboxId?, branding })
   ↓ scope=global: updateBranding → business_settings.branding
   ↓ scope=booth: updatePhotoboxBranding(mode replace) → photoboxes.branding
   ↓ validate: hex, range, kontras efektif (global + override) WCAG AA
   ↓ invalidatePublicConfig + revalidate /dashboard/branding
```

**Data Flow (Upload Logo)**:

```
Owner upload logo → uploadLogo(businessId, file)
   ↓ validate: file type PNG/JPG/WebP (SVG ditolak), max size (2MB)
   ↓ upload ke storage (business-assets, private) → logo_key
   ↓ update branding (global) atau override booth
   ↓ revalidate
```

**Components**: `Form` + `Tabs` (branding, welcome), color picker, logo upload, live `Preview` panel.

**Validation**: warna valid hex; logo ukuran & tipe (PNG/JPG/WebP); font_scale 0.8–1.4; button_radius 0–24; padding 0–96; kontras teks/latar ≥ 4.5:1 pada branding efektif.

**Security**: upload logo divalidasi (file type, size, malicious payload), disimpan di storage bucket private.

**Permission**: OWNER, MANAGER. STAFF tidak ada akses.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/branding/page.tsx`
- Server: `src/server/branding-actions.ts`, `src/server/branding.ts`
- Components: `/dashboard/branding` = Design Builder per booth (`DesignBuilder` + `DesignBuilderPreview`, aksi `design-builder-actions.ts`); `/dashboard/devices` = pairing/diagnostik perangkat.

**Acceptance**: (AC 6) branding muncul di customer-facing app; logo upload berfungsi; kiosk override per-page berfungsi.

---

## 15.2 Payment Settings (Direct Merchant)

**Page**: `/dashboard/settings/payment` → `src/app/(dashboard)/dashboard/settings/payment/page.tsx`

**Purpose**: Owner memasukkan credential payment gateway sendiri (Pakasir/Midtrans/Tripay) — direct merchant integration (dana masuk rekening owner, bukan platform). Tanpa credential aktif, kiosk hanya menawarkan voucher + tunai.

**Server Actions**: `src/server/payment-credential-actions.ts`

- `createPaymentCredential`, `updatePaymentCredential`, `deletePaymentCredential`, `testPaymentCredential`, `togglePaymentCredential`

**Providers**:

- Pakasir: `merchant_id`, `server_key` (encrypted), environment (sandbox/production)
- Midtrans: `merchant_id`, `server_key` (encrypted), `client_key`, environment
- Tripay: `merchant_code`, `api_key` (encrypted), `private_key` (encrypted), environment

**Data** (`payment_credentials` tabel):

```
id, business_id, provider, label, merchant_id, server_key_encrypted, client_key, environment, is_active, metadata, created_at, updated_at
```

**Encryption**: `server_key_encrypted` dienkripsi AES-256-GCM di app layer (key: `PAYMENT_ENCRYPTION_KEY` env).

**Data Flow (Create Credential)**:

```
Owner tekan [ TAMBAH PAYMENT GATEWAY ]
   ↓ Dialog form: provider (select), label, merchant_id, server_key, client_key (nullable), environment (sandbox/production)
   ↓ submit → createPaymentCredential(businessId, data)
      ↓ validate: provider enum, merchant_id not empty, server_key not empty
      ↓ encrypt server_key (AES-256-GCM, key from env)
      ↓ insert payment_credentials (business_id scoped)
      ↓ unique constraint: (business_id, provider, environment)
      ↓ revalidate
   ↓ Dialog close, list refresh
```

**Data Flow (Test Credential)**:

```
Owner klik [ TEST ] di row credential
   ↓ testPaymentCredential(businessId, credentialId)
      ↓ fetch credential + decrypt server_key
      ↓ call provider test endpoint (misal Midtrans `/status`, Tripay `/ping`)
      ↓ return { success: true/false, message }
   ↓ toast success/error
```

**Data Flow (Toggle Active)**:

```
Toggle is_active → togglePaymentCredential(businessId, credentialId, is_active)
   ↓ composite .eq('id').eq('business_id')
   ↓ update payment_credentials.is_active
   ↓ revalidate
```

**Data Flow (Delete)**:

```
Delete credential → deletePaymentCredential(businessId, credentialId)
   ↓ composite .eq('id').eq('business_id')
   ↓ delete payment_credentials
   ↓ revalidate
```

**Registry (Payment Provider Selection)**:

- Kiosk `POST /api/v1/public/:businessSlug/payments/create` → pilih provider dari credential aktif business
- Priority: credential aktif terbaru per provider + environment; fallback QRIS Pakasir aggregator platform (env `PAKASIR_*`)
- Tanpa credential direct aktif → kiosk hanya voucher + tunai

**Webhook** (direct merchant):

- `POST /api/webhooks/payment/midtrans` — validasi SHA512
- `POST /api/webhooks/payment/tripay` — validasi HMAC-SHA256
- `POST /api/webhooks/payment/pakasir` — aggregator + direct

**Components**: `DataTable` credential list, `Dialog` form, `Select` provider/environment, `Button` test, `Switch` active.

**Validation**: provider enum; merchant_id/server_key not empty; environment enum; unique constraint per provider per environment per business.

**Security**: server_key encrypted AES-256-GCM; webhook signature verification (SHA512/HMAC-SHA256); credential null/mismatch ditolak webhook; payload log redaksi secret; response aman tanpa credential detail.

**Permission**: OWNER (full). MANAGER read-only. STAFF tidak ada akses.

**File Locations**:

- Page: `src/app/(dashboard)/dashboard/settings/payment/page.tsx`
- Server: `src/server/payment-credential-actions.ts`, `src/server/payment-credentials.ts`
- Providers: `src/server/payment/providers/midtrans.ts`, `src/server/payment/providers/tripay.ts`, `src/server/payment/providers/pakasir.ts`

**Acceptance**: owner tambah/test/toggle/delete credential; kiosk pakai credential direct; webhook berfungsi; tanpa credential aktif = voucher+tunai only.

---

## 16. Workspace Switching & Topbar

**Purpose**: User dengan banyak business bisa switch workspace (active business).

**Components**: `Command`/`Dropdown` workspace switcher (topbar), `Breadcrumb`, `Notification` (list), `User menu`.

**Backend Logic**:

- Session menyimpan `businessIds` (array business yang user jadi member)
- Switching men-set `activeBusinessId` (cookie `snapyos_active_business`)
- Semua request memakai context business aktif (`getMembership()` validate)

**Security**: user hanya bisa switch ke business yang menjadi member (dicek server-side via `business_members`).

**File Locations**:

- Components: `src/components/layout/Topbar.tsx`, `src/components/layout/WorkspaceSwitcher.tsx`
- Tenant: `src/lib/tenant.ts`

**Acceptance**: user switch workspace; active business persist di cookie; guard tenant scoping berfungsi.

---

## 17. Sidebar Navigation

**Items** (20 item tetap, 5 grup — `src/components/dashboard/nav.ts`):

**Utama**: Dashboard (overview) · Analytics (revenue charts) · Metrics (business metrics)

**Keuangan**: Transactions · Finance (expenses, profit) · Payment Gateway · Reports (export)

**Pelanggan & Tim**: Customers · Staff

**Langganan & Akun**: Subscription (+ add-ons) · Settings (profile, branding, payment, retention, checkout) · Tiket Bantuan · Dokumentasi (keluar ke `/docs`)

**Conditional Items**:

- POS (hanya render jika `hasPosEntitlement()` — lihat `05-POS-TERMINAL-FLOW.md`)
- Unduh PWA (hanya render jika `hasFeature('pwa_kiosk')`)

**Active State**: `src/lib/nav-active.ts` shared helper.

**Components**: `Sidebar` (brutalist vertical nav), `SidebarItem`, `SidebarGroup`.

**File Locations**:

- Layout: `src/app/(dashboard)/layout.tsx`
- Components: `src/components/layout/Sidebar.tsx`

---

## 18. Design System & Components

**Wajib Neo-Brutalism** (lihat `11-design-system.md`):

- Font: Archivo Black (display uppercase), IBM Plex Sans (body), Space Mono (angka/harga/ID/label)
- Warna: bg `#FFFDF5`, ink `#111111`, accent `#FFD400` + pink/green/blue
- Border: 2–4px solid ink
- Shadow: hard offset `4px 4px 0 ink`
- Radius: 0 (atau 4px minimal)
- Grain overlay global
- Satu accent dominan per halaman

**Components Shared** (brutalist):

- `BrutalistSelect` (role/status/provider filter)
- `BrutalistCheckbox` (multi-day withdrawal)
- `StatusBadge` (status subscriptions/payments/withdrawals)
- `DataTable` hand-rolled (bukan shadcn default)
- `Card` brutalist (thick border 4px, hard shadow 4px)
- Form inputs brutalist (border 2px, radius 0, focus accent)

**Pola Halaman**:

```
/// EYEBROW (mono label uppercase)
H1 DISPLAY UPPERCASE
Filter row (select/input brutalist)
Metric grid (cards brutalist)
Bordered table (hand-rolled atau shadcn Table customized)
```

**Empty State**: dashed border `/// BELUM ADA X`.

**Loading State**: skeleton per route.

**File Locations**:

- Tokens: `src/styles/tokens.css`
- Global: `src/styles/globals.css` (§`@layer base`)
- Components: `src/components/ui/*` (shadcn customized), `src/components/dashboard/*`

---

## 19. Acceptance Criteria (Owner Dashboard)

**Dari `04-owner-dashboard.md` + PRD terkait:**

- (AC 5) Owner membuat outlet & photobox, melihat performa booth
- (AC 6) Branding owner muncul di customer-facing app (kiosk)
- (AC 7) Owner membuat package, muncul di customer app
- (AC 8) Owner upload template, customer bisa pilih; builder slot berfungsi
- (AC 9) Owner membuat voucher, tervalidasi server-side saat dipakai
- (AC 35–39) Revenue masuk dashboard, discount tidak dihitung sebagai revenue, gross/net benar
- (AC 40) Owner melihat expenses & estimated profit
- (AC 41) Owner melihat transaction history dengan filter & search
- (AC 42) Owner melihat voucher usage
- (AC 43) Owner melihat outlet performance
- (AC 44) Owner melihat photobox performance
- (AC 47) RBAC berjalan — staff tidak otomatis melihat seluruh financial info

**Status Implementasi**: SESUAI (inti) per audit 2026-09-15. BELUM (backlog): dialog detail transaksi, session settings owner-configurable UI, print test dari dashboard, booking, event mode, business profile edit + danger zone, topbar global search & notifications, preset filter dashboard.

---

## 20. Migration Impact

**Owner dashboard tidak memerlukan migration baru** (semua tabel sudah ada di baseline `db/schema.sql` + migrations `0002`–`0042`).

**Tabel dipakai**:

- `businesses`, `business_members`, `business_settings`, `outlets`, `photoboxes`, `devices`, `activation_codes`, `packages`, `package_templates`, `package_outlets`, `package_photoboxes`, `templates`, `template_categories`, `vouchers`, `voucher_usages`, `customers`, `transactions`, `expenses`, `subscriptions`, `subscription_add_ons`, `invoices`, `invoice_payments`, `payment_credentials`, `audit_logs`.

> Tabel `balances`/`balance_ledger`/`withdrawals` pernah ada di sini, tetapi dihapus migrasi `0044_drop_withdrawal_flow.sql`.

**Migration historis terkait owner**:

- `0002`: outlets province
- `0008`: per-business invoice numbering
- `0010`: template layout (slot builder)
- `0014`: subscription_promos
- `0016`: payment_method offline, balance kebijakan QRIS-only
- `0017`: registration profile (whatsapp, acquisition_source, planned_devices)
- `0018`: member_photoboxes (akses booth per staff)
- `0019`: POS add-on
- `0027`: direct merchant payment_credentials
- `0034`: retention_days max 3 hari
- `0035`: exit_pin_hash + throttle brute-force
- `0038`: drop tabel reports (0 query)
- `0039`: templates.category_id FK
- `0042`: drop kolom nol-konsumen

---

**Next**: `03-STAFF-FLOW.md` — alur staff read-only shell.
