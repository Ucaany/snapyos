# 15. Template & Frame Builder (Owner-Designed Frames + Photo Slots)

> **UPDATE Fase 5 (2026-09-16):** REST owner untuk CRUD/upload template telah dihapus; dashboard builder memakai server actions (`src/server/templates.ts` + action wrappers). Endpoint public template kiosk tetap aktif. Tabel API owner di bawah dipertahankan sebagai kontrak historis.

> **Fitur:** Owner upload sendiri frame PNG (latar transparan) → menambahkan **slot foto** (kotak/shape) di atas frame via builder drag-and-drop → customer memilih frame → hasil foto **otomatis ter-composite pas ke slot** yang owner buat. Zoom/pan customer tetap bisa menyesuaikan foto di dalam slot (editor, §5.9 `05-customer-photobox.md`).
>
> Status: **revisi scope §4.10.1 `04-owner-dashboard.md`** — builder slot foto kini bagian **MVP pipeline** (bukan lagi hanya "upload frame jadi"), menggantikan batasan "drag-and-drop designer = Phase 2" khusus definisi slot. Template marketplace tetap non-goal.

Dokumen ini adalah **source of truth** untuk fitur template builder. Perubahan terkait di: `04-owner-dashboard.md` (§4.10), `05-customer-photobox.md` (§5.4/§5.6/§5.9), `07-database-schema.md` (`templates`), `08-api-spec.md` (§8.7), `12-roadmap-mvp.md` (Phase 12 + AC).

---

## 15.0 Invalidasi Cache Kiosk (2026-11-08)

`PublicTemplate.version` = `Date.parse(templates.updated_at)` (0 bila tidak bisa diparse). Kiosk memakai `version` sebagai bagian key cache aset (`templateId:version@480` / `@full`), jadi:

- Ganti file frame / simpan builder → `updated_at` berubah → thumbnail + frame baru diunduh saat warm berikutnya; key versi lama dipangkas.
- Ubah layout tanpa ganti file tetap memicu unduhan ulang (over-invalidation kecil, diterima).
- Template dinonaktifkan → hilang dari snapshot baru → key-nya dipangkas.

## 15.1 Konsep

```
OWNER                                          CUSTOMER (kiosk)
─────                                          ────────────────
Upload PNG frame (alpha)                       Pilih frame (thumbnail = frame WebP, bukan slot terisi)
   ↓                                              ↓
Set canvas (preset/custom)                     Capture N foto (N = jumlah slot)
   ↓                                              ↓
Tambah slot: drag kotak/shape                  Foto auto masuk slot (cover-fit, urut z)
   ↓                                              ↓
Atur shape/pos/ukur/rotasi/fit                 Editor: zoom/pan per slot + filter/sticker/text
   ↓                                              ↓
Preview (foto sample) → Publish                Finalize → print + GIF + result online
```

- **Slot** = area penempatan foto pada frame, didefinisikan owner.
- **Frame PNG** digambar **di atas** foto — lubang tempat foto muncul = area transparan (alpha) PNG.
- **Satu engine composite client-side** (`composeFrame`): preview builder dan editor kiosk memakai modul yang sama. Tidak ada logika render duplikat di klien. **Tidak ada engine composite server-side** — render final dilakukan di editor kiosk (browser), lalu diunggah sebagai JPEG.

## 15.2 Data Model — `templates.layout`

Tidak ada tabel baru. `templates` ditambah kolom:

```sql
ALTER TABLE templates ADD COLUMN layout jsonb NOT NULL DEFAULT '{}';
```

`layout` kosong/null = **template legacy** (overlay full-canvas tanpa slot, perilaku lama tetap berfungsi — backward compatible).

### Contract `layout` jsonb (dipakai builder, kiosk, dan server validation)

```json
{
  "version": 1,
  "canvas": {
    "width": 1200,
    "height": 1800,
    "preset": "4x6-portrait",
    "background": "#ffffff"
  },
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
    },
    {
      "id": "mask-1",
      "shape": "mask",
      "x": 680,
      "y": 200,
      "width": 420,
      "height": 700,
      "rotation": 0,
      "fit": "cover",
      "points": [
        { "x": 0, "y": 0 },
        { "x": 420, "y": 60 },
        { "x": 380, "y": 700 },
        { "x": 30, "y": 650 }
      ],
      "z": 1
    }
  ],
  "chroma": {
    "source_key": "biz-1/templates/1791-frame.png",
    "source_url": null,
    "detected_at": "2026-11-09T00:00:00.000Z",
    "skipped": 0
  }
}
```

| Field                      | Ket                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | versi contract, mulai `1`                                                                                                                                                                                                       |
| `canvas.width/height`      | resolusi design dalam px (bukan persen — deterministik & mudah divalidasi)                                                                                                                                                      |
| `canvas.preset`            | `4x6-portrait` (1200×1800) · `4x6-landscape` (1800×1200) · `2x6-strip` (600×1800) · `square` (1500×1500) · `custom` (max 3000×3000)                                                                                             |
| `canvas.background`        | hex `#rrggbb`, default `#ffffff`. Warna dasar di bawah foto — satu-satunya latar yang terlihat lewat lubang alpha frame (termasuk area hijau yang dihapus deteksi). Tanpa ini area tersebut tercetak hitam (output final JPEG). |
| `slots[].shape`            | `rect` \| `rounded` \| `circle` \| `ellipse` \| `mask`                                                                                                                                                                          |
| `slots[].points`           | wajib untuk `mask`: 3..512 titik `{x,y}` lokal slot (`0..width` × `0..height`), ring tertutup implisit. Bentuk lain menolak `points`.                                                                                           |
| `layout.chroma`            | opsional. Metadata deteksi area hijau: `source_key`/`source_url` (frame ASLI, dipakai agar deteksi ulang idempoten), `detected_at`, `skipped` (komponen hijau dibuang).                                                         |
| `slots[].x/y/width/height` | px design, posisi kiri-atas sebelum rotasi                                                                                                                                                                                      |
| `slots[].rotation`         | derajat, pivot = center slot, rentang −180..180                                                                                                                                                                                 |
| `slots[].radius`           | corner radius px, hanya untuk `rounded`                                                                                                                                                                                         |
| `slots[].fit`              | `cover` (default) \| `contain` \| `fill`                                                                                                                                                                                        |
| `slots[].z`                | urutan render antar slot (kecil dulu); `photos.order_index` → slot urut `z`                                                                                                                                                     |

### Validasi server-side (trust boundary — wajib)

`layoutSchema` (`src/lib/template-layout.ts`) dipakai oleh `saveTemplateLayout` (owner) dan `updateGlobalTemplateLayout` (admin). Layout invalid ditolak 4xx (`VALIDATION_ERROR` + field errors). Yang diperiksa:

- `id` slot unik; `z` unik dan kontigu `0..n-1` (tanpa lubang).
- `shape` enum valid; `circle` wajib bujur sangkar (selisih `width`/`height` ≤ 0.01), `ellipse` rasio bebas.
- `mask` wajib `points` 3..512, semua titik di dalam `[0,width]×[0,height]` (EPS 0.01), minimal satu titik berbeda; bentuk non-mask menolak `points`.
- `layout.chroma` opsional dan divalidasi ringan (string/timestamp) — layout lama tanpa field ini tetap lolos.
- Preset kanvas cocok dengan dimensi (`4x6-portrait` 1200×1800, `4x6-landscape` 1800×1200, `2x6-strip` 600×1800, `square` 1500×1500); `custom` maks 3000×3000.
- Bounds memperhitungkan rotasi (AABB hasil rotasi di sekitar center tetap di dalam kanvas).
- `radius ≤ min(width, height) / 2`; crop bounds foto valid.
- Max slot per template: **8**.
- `slot_count = layout.slots.length` (layout kosong = 0).
- `layout.slots[].properties` dipertahankan di schema untuk kompatibilitas mundur, tetapi **tidak** dirender `composeFrame` dan tidak diekspos builder.
- **Assign template → package tidak dibatasi jumlah slot (2026-10-19).** Paket 3 foto boleh memakai frame 6 slot; runtime mengambil 6 foto untuk mengisi frame 6 slot. `packages.photo_count` menjadi fallback untuk template legacy tanpa slot, sedangkan `print_count` menentukan jumlah lembar.
- Upload PNG: validasi tipe & max size mengikuti §4.10 `04-owner-dashboard.md`. Warning "PNG tanpa alpha channel" **belum diimplementasikan**; kandidat, bukan perilaku saat ini.

### Deliberate simplifications (ponytail)

- Frame selalu di atas foto. Layer frame di bawah / z-configurable → tambah `frame_z` saat dibutuhkan.
- `shape: "mask"` adalah poligon hasil deteksi hijau, bukan SVG path bebas; path kurva presisi → tambah `shape: "path"` saat dibutuhkan.
- Tidak ada `template_versions` / undo history — draft vs publish cukup (`is_active`).
- Chroma key memakai **warna dasar kanvas**, bukan aset latar terpisah. Latar bergambar di balik customer → tambah `canvas.background_image` saat dibutuhkan.
- `sessions` belum menyimpan `template_id`; lihat risiko residual §15.10.

## 15.3 Owner — Template Builder

**Route:** `/dashboard/templates` (list, §4.10) → buat/edit → `/dashboard/templates/builder/[id]`. Admin memakai route `/admin/templates/builder/[id]` dengan komponen yang sama (`saveGlobalTemplateLayoutAction`). Tidak ada redirect stub: kedua route merender canvas builder langsung.

**Komponen:** `TemplateBuilderCanvas` (`src/components/dashboard/TemplateBuilderCanvas.tsx`) dipakai owner dan admin. Preview memakai `composeFrame` — engine yang sama dengan editor kiosk.

**Flow:**

```
[ BUAT BARU ] → pilih preset canvas (atau custom) → upload PNG frame (area hijau = slot)
   ↓
Builder canvas:
   [ DETEKSI AREA HIJAU ] → server hapus hijau, tulis PNG baru, tambah slot mask
   [ + TAMBAH SLOT ] (maks 8) → tambah slot di canvas
   pilih slot → panel properti: shape, x/y/w/h, rotation, radius, fit, z
   drag untuk pindah · resize handle · input numerik x/y/w/h/rotation
   [ PREVIEW ] → slot diisi foto contoh lewat composeFrame (hasil = kiosk)
   ↓
[ SIMPAN DRAFT ] (is_active=false) / [ PUBLISH ] (is_active=true)
```

**Kontrol builder (semua tersedia sebagai tombol/input, bukan hanya gesture):**

- Tambah slot (maks 8), hapus slot.
- Drag pindah, resize handle, input numerik `x/y/width/height`, `rotation`.
- `shape`: `rect` | `rounded` | `circle` | `ellipse`; `fit`: `cover` | `contain` | `fill`; `radius` (rounded); z naik/turun (di-renumber kontigu `0..n-1`). `mask` **tidak** bisa dipilih manual — hanya lahir dari deteksi; mengubah slot mask ke bentuk lain menghapus `points`-nya.
- Deteksi area hijau: tombol "Deteksi area hijau". Server mendeteksi komponen hijau, menulis PNG baru (hijau → alpha 0, file asli disimpan sebagai `layout.chroma.source_key`), dan **menambahkan** slot mask dengan z lanjut. Slot manual dipertahankan; slot `mask` hasil deteksi sebelumnya diganti (deteksi ulang idempoten). Total dibatasi 8 dan sisanya dilaporkan sebagai `skipped`. Deteksi tidak mengubah `is_active` — publish tetap aksi terpisah. Untuk mask: width/height/radius dikunci baca-saja, x/y/rotation/fit tetap bisa diubah.
- Preset kanvas: `4x6-portrait` | `4x6-landscape` | `2x6-strip` | `square` | `custom` (maks 3000).
- Background kanvas: input hex.
- Keyboard: arrow nudge 1px, Shift+arrow 10px. Setiap mutasi juga bisa dilakukan lewat kontrol UI.
- Validasi live di klien mencerminkan aturan server (§15.2); simpan tetap divalidasi ulang server-side.

**Draft vs publish:**

- Simpan eksplisit: "Simpan draft" (`is_active=false`) atau "Publish" (`is_active=true`). Tidak pernah auto-publish.
- Form upload punya pilihan eksplisit Draft (default) / Publish dan setelah sukses redirect ke builder.
- **Thumbnail tidak digenerate dari preview builder.** Thumbnail berasal dari frame WebP yang diunggah; deteksi area hijau membuat thumbnail baru dari PNG bersih. Tidak ada thumbnail otomatis dari canvas.

**Batasan builder:**

- Slot tidak bisa digeser/di-resize keluar batas kanvas (clamp).
- Minimal 1 slot untuk publish; publish tanpa slot = frame penuh legacy dan memerlukan konfirmasi eksplisit.
- Builder owner tidak menulis template global: baris global read-only dari sisi owner.

**UI wajib Neo-Brutalism** — load skill `industrial-brutalist-ui` sebelum implementasi (aturan AGENTS.md / `13-skill-anti-slop.md`).

## 15.4 Render — Composite Engine (client-side)

**Modul tunggal (klien):** `composeFrame(ctx, layout, frameImg, photos, transforms)` — dipakai preview builder dan editor kiosk di browser. Render final terjadi di editor kiosk, bukan di server: hasil composite diunggah sebagai JPEG, dan print/result online memakai JPEG final itu (tanpa render ulang di server).

Urutan render (satu frame/output):

1. Set resolusi `canvas.width × canvas.height`, clear, lalu isi `canvas.background` (default putih).
2. Untuk setiap slot urut `z` naik: clip ke shape path (rect / `roundRect` / ellipse / poligon `mask`; rotation via `ctx.rotate` di center slot) → `drawImage` foto terkait dengan `fit` cover/contain + transform zoom/pan customer (clamp minimal cover-fit).
3. `drawImage` frame PNG di-rect penuh canvas (0,0,canvas.w,canvas.h).
4. Sticker & text (sistem eksisting §5.10–5.11) digambar **setelah** frame — bukan di dalam foto yang ter-clip slot, supaya tidak terpotong clip/tertutup frame.

**Chroma = slot dari frame, bukan keying foto.** Editor kiosk **tidak** punya kontrol chroma. Area hijau pada PNG frame diubah owner menjadi slot mask lewat tombol deteksi di builder: server memakai predikat `isGreenBackground` yang sama untuk (a) menghitung poligon slot dan (b) membuat alpha 0 pada piksel hijau di file frame baru, sehingga lubang file selalu identik dengan bentuk slot. Piksel transparan menampilkan `canvas.background` (output final JPEG, jadi latar wajib berwarna). Frame JPG/WebP tanpa alpha tetap diterima; hasil deteksi selalu ditulis PNG. Deteksi ulang selalu memakai file asli (`layout.chroma.source_key`), jadi idempoten.

**GIF slideshow:** template ber-slot memakai **satu JPEG berframe per foto capture** — klien merender tiap foto lewat `composeFrame` dengan hanya slot foto itu terisi (`framePerPhoto`), kanvas = canvas template, frame PNG template di atasnya (`renderFramePerPhotoBlobs`, satu kanvas dipakai ulang → memori O(satu frame)). Template legacy memakai foto final berframe. Server menerima `gif_photos` opsional; tanpa field itu GIF jatuh ke foto final. GIF gagal dirender di klien → kirim capture mentah (GIF tetap ada). Delay/lebar dari `business_settings.output.gif`.

Output = full resolusi design canvas. Render final dijalankan di browser (editor kiosk) dan diunggah sebagai JPEG; server tidak mengomposit ulang. GIF & result online tidak berubah (tetap dari foto final hasil composite klien).

**Mapping slot:** `photos.order_index` i → slot ke-i berdasar urutan `z` naik. Jumlah capture = jumlah slot.

## 15.5 Customer — Perubahan Flow (patch `05-customer-photobox.md`)

| Tahap                | Perubahan                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.4 Choose Template | Thumbnail = frame WebP 480px (bukan composite slot); semua template aktif yang assignable tampil; tanpa assignment = semua template aktif            |
| §5.6 Capture         | Frame ber-slot: jumlah capture = `template.slot_count`; legacy: `package.photo_count`; slot yang perlu mengulang foto diisi bergiliran (`fillSlots`) |
| §5.9 Editor          | Zoom/pan menyesuaikan foto **di dalam slot** (bukan full canvas); zoom minimal = cover-fit; filter/adjust/sticker/text tetap di atas composite       |
| §5.15 Print          | `PrintLayoutRenderer` mencetak JPEG final hasil render klien (yang diunggah) — tidak ada render ulang di server                                      |

## 15.6 API (patch `08-api-spec.md` §8.7)

**Owner CRUD/upload/builder via server actions**, bukan REST (REST owner dihapus Fase 5):

- `src/server/templates.ts` — `saveTemplateLayout` (validasi `layoutSchema`, scope `business_id`, audit, revalidate `/dashboard/templates` + `/dashboard/packages`, invalidasi public config).
- `src/server/catalog-actions.ts` — wrapper action builder owner.
- `src/server/template-purchase.ts` + `template-purchase-actions.ts` — marketplace (§15.9b).

Endpoint publik (tetap aktif):

| Endpoint                                              | Perilaku                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/public/:businessSlug/templates?package=` | payload berisi `layout`, `slot_count`, `version`, `thumbnail_url`; `?package` opsional; tanpa filter slot |
| `GET /api/v1/public/frame?url=&cache=&w=`             | proxy biner frame/thumbnail (resize 480px)                                                                |

- Public template payload: `id, name, category, file_url, thumbnail_url, layout, slot_count, version, package_ids`.
- `POST /sessions` **tidak** menyimpan `template_id` (kolom belum ada); finalize menerima `template_id` dari kiosk — lihat §15.10.
- Tidak ada endpoint server-side compose: render final dilakukan klien dan diunggah sebagai JPEG.

## 15.7 Security & Storage

- Tenant scoping: `templates.business_id`; `saveTemplateLayout` hanya meng-update baris dengan `business_id` yang cocok. Template global (`business_id NULL`) **tidak bisa** ditulis dari sisi owner.
- Builder hanya untuk member dengan permission `template:write` (RBAC matrix `09-security-storage.md`).
- Upload divalidasi (tipe/size); preview pakai signed URL jika private (§4.10).
- `layout` divalidasi server-side — frontend builder tidak dipercaya (prinsip backend = source of truth).
- Mutasi template memanggil `invalidatePublicConfig(businessId)` / `invalidateAllPublicConfig()`; tag `public-config` per business + `public-config:global`, TTL 30 detik.

## 15.8 Phasing

- **Tahap A (inti, wajib):** migration `layout` + builder (rect/rounded/circle/ellipse, drag/resize/rotate) + `composeFrame` + kiosk slot-fit + preview sample. Test unit: validasi layout, matematika cover-fit, composite deterministik, `fillSlots`.
- **Tahap B (skip dulu, tambah saat diminta):** shape path/custom mask, `frame_z` layer configurable, duplicate template.

## 15.9 Acceptance Criteria

1. Owner upload PNG + tambah ≥1 slot + simpan draft/publish tanpa training (< 2 menit).
2. Customer memilih frame → foto hasil capture muncul pas di setiap slot (cover-fit, rasio tidak terdistorsi).
3. Assignment: template milik sendiri ATAU global yang `is_active` dan (gratis ATAU sudah dibeli) dapat di-assign ke package; global nonaktif/belum dibeli ditolak saat create **dan** update package.
4. Package tanpa assignment menampilkan semua template aktif (`selectVisibleTemplates` fallback) — bukan kosong.
5. Hasil print & result online identik dengan preview builder (JPEG final dari `composeFrame` klien; tanpa render ulang server).
6. Template legacy (layout kosong) tetap berfungsi — backward compatible.
7. Layout invalid (id ganda, z tidak kontigu, preset tidak cocok, keluar bounds rotation-aware, radius terlalu besar, circle tidak persegi) ditolak server-side 4xx.
8. Template global tampil read-only di list owner (label `TEMPLATE PLATFORM`); global gratis aktif dan yang sudah dibeli bisa di-assign; global yang dibeli membuka builder read-only ("Template platform — read-only").
9. Perubahan template terlihat di kiosk ≤30 detik tanpa reload manual (invalidasi `public-config` + TTL 30s).
10. Marketplace: harga integer IDR, pembelian membuat invoice pending (`template_purchase`), kepemilikan tertulis idempoten saat paid; template nonaktif tidak bisa dibeli.

## 15.9b Marketplace Template Premium

Template **global** platform dapat dijual sebagai template premium per business.

**Aturan data & harga:**

- Sumber: `templates` dengan `business_id NULL`, `is_premium=true`, `price > 0`.
- Harga = `templates.price` dalam **integer IDR** (tanpa floating-point).
- `listPremiumTemplates` mengembalikan semua premium global **termasuk yang nonaktif**; UI men-disable tombol Beli untuk baris nonaktif dan menonaktifkan semua tombol selama transaksi pembelian berjalan di halaman itu; server tetap menolak template nonaktif.

**Alur beli → milik:**

1. `purchaseTemplate` membuat invoice **pending** dengan intent `{ type: "template_purchase", items: [{ type, template_id, name, amount, qty }] }`; `amount` = `templates.price`.
2. Setelah invoice dibayar, `applyInvoiceIntent` menulis kepemilikan ke `business_template_purchases` (`business_id`, `template_id`) secara idempoten.
3. Assign ke package baru boleh setelah baris kepemilikan ada. Pembelian sendiri tidak mengubah assignment.

**Assignability (`assertTemplatesAssignable`):**

- Template milik business sendiri, ATAU
- global dengan `is_active=true` DAN (gratis ATAU sudah dibeli).
- Global nonaktif / belum dibeli → ditolak pada create dan update package.

**Builder & list owner:**

- Baris milik business: `is_global=false`, dapat diedit/dihapus/dibuka builder dan disimpan.
- Global platform tampil read-only (`TEMPLATE PLATFORM`) — tidak ada edit/delete/simpan builder dari sisi owner.
- Global yang sudah dibeli membuka builder **read-only** berlabel "Template platform — read-only".

## 15.10 Risiko residual (jujur)

- **`template_id` tidak dipersist di `sessions`.** Kiosk mengirimnya saat finalize, jadi server memakai nilai dari client untuk menentukan ekspektasi jumlah capture. Composite dirender di client dan hanya diunggah sebagai JPEG, sehingga server memang tidak bisa memverifikasi isi visual — `template_id` hanya memengaruhi pemeriksaan jumlah, bukan harga atau settlement. Memperbaikinya butuh migrasi kolom `sessions.template_id`; belum dilakukan.
- **`gif_photos` opsional.** Tanpa field itu, jumlah capture untuk frame ber-slot tidak bisa diperiksa (composite tunggal sah). Klien lama tetap bisa finalize.
- **PNG tanpa alpha channel** belum dideteksi saat upload frame; template tanpa lubang alpha akan menutupi seluruh foto.
- **Deteksi hijau bergantung kualitas desain.** Gradien, bayangan, atau hijau pudar di bawah ambang predikat tidak terdeteksi; noise dibuang oleh filter luas minimum (0.1% kanvas, sisi ≥ 8 px). Frame dengan hijau menyatu ke tepi kanvas ditutup di tepi dan titik di-clamp.
- **Fringe di tepi slot.** Alpha frame dibuat biner (piksel hijau → alpha 0) agar lubang identik dengan poligon slot; piksel anti-alias di tepi hijau yang tidak lolos predikat bisa tersisa sebagai garis tipis. Kandidat: erode poligon atau band alpha lembut saat terlihat pada cetak.

## 15.11 Undo/Redo, Duplicate, Snap, Layer Teks (implementasi 2026-11-09)

**Undo/redo — `useTemplateHistory`** (`src/components/dashboard/template-builder/useTemplateHistory.ts`):

- Batas riwayat `HISTORY_LIMIT = 100` langkah; state `{ past, present, future }`.
- Tiga operasi berbeda perannya: `commit(next)` = catat langkah undo + ganti present (aksi diskret: tambah/hapus/duplikat slot, ubah shape, ubah preset), `checkpoint()` + `replace(next)` = satu langkah undo untuk satu drag (drag memanggil `checkpoint()` sekali saat mulai, lalu `replace()` per `pointermove` — satu drag = satu undo, bukan 60), `reset(next)` = buang riwayat (mis. layout baru dari server).
- Shortcut global: `Cmd/Ctrl+Z` undo, `Shift+Cmd/Ctrl+Z` redo. Shortcut **tidak** dibajak saat fokus di `input`/`textarea` (undo teks asli browser tetap jalan).
- Tombol UI undo/redo disabled mengikuti `canUndo`/`canRedo`. Tidak ada persistensi riwayat — reload = riwayat kosong.

**Duplicate** — dua tingkat, keduanya membuat baris baru:

| Aksi                  | Fungsi                                                                                                       | Perilaku                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplikat **slot**     | `duplicateSlot()` di canvas                                                                                  | Menyalin slot terpilih (geometri + `properties`), z di-renumber kontigu; satu langkah undo                                                                                                                                                                                                                                                           |
| Duplikat **template** | `duplicateTemplate()` → `duplicateTemplateAction` → `duplicateTemplate()` server (`src/server/templates.ts`) | Menyalin baris template + layout/draft + key storage (URL disimpan apa adanya, key storage diduplikasi) menjadi template baru milik owner; audit `template.duplicate`; setelah sukses router membuka `/dashboard/templates/builder/<id baru>`. Tombol hanya muncul bila prop `onDuplicateTemplate` diberikan (template global read-only tidak punya) |

**Snap** — `src/lib/template-snap.ts` (`snapRect`, `SnapGuide`), murni tanpa DOM:

- Target snap: tepi + tengah **kanvas**, serta tepi + tengah **slot lain**.
- Hanya berlaku saat **satu** slot digeser (`drag.ids.length === 1`); snapping grup ke tepi slot lain sengaja tidak dilakukan karena membuat seluruh grup "melompat" tanpa alasan yang terlihat.
- Guide yang dihasilkan (`SnapGuide[]`, axis `x`/`y` + posisi) dirender sebagai garis bantu dan dikosongkan saat drag selesai.
- Resize **tidak** memakai snap: delta diputar ke ruang lokal slot (`-rotation`) supaya handle benar untuk slot berotasi.

**Layer teks** — `slot.properties.text` (`editorPropertySchema` di `src/lib/template-layout.ts`, panel `TemplateTextPanel`):

- Teks maksimal 2000 karakter; `composeFrame` menggambarnya **di atas frame** (bukan di dalam foto yang ter-clip slot), jadi tidak terpotong clip dan tidak tertutup PNG frame.
- Properti pendukung: `fontFamily` (`display`/`sans`/`mono`), `fontSize` 8–240, `fontWeight` 400–900, `lineHeight` 0.8–3, `letterSpacing` -0.2–2, `color`, `background`, `opacity`, alignment.
- Field yang kosong **tidak ditulis** (bukan `undefined`-key) sehingga layout tanpa teks tetap identik byte dengan layout lama.
- Slot tanpa `properties` merender persis seperti layout pra-fitur.

**Template default + auto-assign:**

| Fitur                  | Implementasi                                                                                                                                                                                                                            | Perilaku                                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template default booth | `photoboxes.default_template_id` (FK `on delete set null`, migrasi `0075`); disimpan lewat `savePhotoboxHardwareAction`, divalidasi `assertTemplateAssignable` (nonaktif/belum dibeli → `VALIDATION_ERROR` field `default_template_id`) | Kiosk memakai `selectAutoTemplate(templates, defaultTemplateId)`: default booth menang **bila masih eligible** untuk paket itu; kalau tidak, hanya satu template eligible → auto-pilih; lebih dari satu → customer memilih                                                                                  |
| Assign otomatis paket  | Tombol "Assign otomatis" di `PackageFields` → `autoAssignTemplateIds` (`src/lib/template-select.ts`)                                                                                                                                    | Urutan: (1) semua template dengan `slot_count == photo_count`, (2) cocok `capture_mode` (`photostrip` → slot ≥ max(2, photoCount), `burst` → slot ≥ 2, `single` → slot 1), (3) slot terdekat supaya tombol tidak pernah no-op. Hasilnya hanya mengisi pilihan di form; simpan paket tetap lewat aksi normal |

Catatan batas: template default **tidak** memaksa customer memakai template itu — ia hanya menang saat eligible, jadi menghapus assignment paket tidak membuat booth menunjuk template yang tidak ditawarkan.

**Tes:** `useTemplateHistory` belum punya tes unit sendiri (riwayat diverifikasi manual di builder). Yang tertutup tes: `tests/template-text-render.test.ts` (teks di atas frame), `tests/template-auto-pick.test.ts` (`selectAutoTemplate`), `tests/template-assignment.test.ts` (assignability), `tests/template-layout.test.ts` (validasi `layoutSchema`). Klaim di atas berasal dari kode, bukan asumsi.
