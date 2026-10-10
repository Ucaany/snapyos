# 15. Template & Frame Builder (Owner-Designed Frames + Photo Slots)

> **UPDATE Fase 5 (2026-09-16):** REST owner untuk CRUD/upload template telah dihapus; dashboard builder memakai server actions (`src/server/templates.ts` + action wrappers). Endpoint public template kiosk tetap aktif. Tabel API owner di bawah dipertahankan sebagai kontrak historis.

> **Fitur:** Owner upload sendiri frame PNG (latar transparan) → menambahkan **slot foto** (kotak/shape) di atas frame via builder drag-and-drop → customer memilih frame → hasil foto **otomatis ter-composite pas ke slot** yang owner buat. Zoom/pan customer tetap bisa menyesuaikan foto di dalam slot (editor, §5.9 `05-customer-photobox.md`).
>
> Status: **revisi scope §4.10.1 `04-owner-dashboard.md`** — builder slot foto kini bagian **MVP pipeline** (bukan lagi hanya "upload frame jadi"), menggantikan batasan "drag-and-drop designer = Phase 2" khusus definisi slot. Template marketplace tetap non-goal.

Dokumen ini adalah **source of truth** untuk fitur template builder. Perubahan terkait di: `04-owner-dashboard.md` (§4.10), `05-customer-photobox.md` (§5.4/§5.6/§5.9), `07-database-schema.md` (`templates`), `08-api-spec.md` (§8.7), `12-roadmap-mvp.md` (Phase 12 + AC).

---

## 15.1 Konsep

```
OWNER                                          CUSTOMER (kiosk)
─────                                          ────────────────
Upload PNG frame (alpha)                       Pilih frame (thumbnail = preview slot terisi)
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
- **Satu engine composite** untuk semua tempat render: preview builder, editor kiosk, print renderer. Tidak ada logika render duplikat.

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

| Field                      | Ket                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | versi contract, mulai `1`                                                                                                           |
| `canvas.width/height`      | resolusi design dalam px (bukan persen — deterministik & mudah divalidasi)                                                          |
| `canvas.preset`            | `4x6-portrait` (1200×1800) · `4x6-landscape` (1800×1200) · `2x6-strip` (600×1800) · `square` (1500×1500) · `custom` (max 3000×3000) |
| `slots[].shape`            | `rect` \| `rounded` \| `circle` \| `ellipse`                                                                                        |
| `slots[].x/y/width/height` | px design, posisi kiri-atas sebelum rotasi                                                                                          |
| `slots[].rotation`         | derajat, pivot = center slot, rentang −180..180                                                                                     |
| `slots[].radius`           | corner radius px, hanya untuk `rounded`                                                                                             |
| `slots[].fit`              | `cover` (default) \| `contain`                                                                                                      |
| `slots[].z`                | urutan render antar slot (kecil dulu); `photos.order_index` → slot urut `z`                                                         |

### Validasi server-side (trust boundary — wajib)

- Layout schema validation di setiap `POST/PATCH` template.
- Slot: `width > 0`, `height > 0`, `x ≥ 0`, `y ≥ 0`, `x + width ≤ canvas.width`, `y + height ≤ canvas.height`, `rotation` −180..180, `shape` enum valid, `radius ≥ 0`.
- Max slot per template: **8**.
- `slot_count = layout.slots.length` (layout kosong = 0).
- **Assign template → package DITOLAK kecuali `slot_count == packages.photo_count`.** Constraint dicek di endpoint assign maupun saat `PATCH packages` mengubah `photo_count`.
- Upload PNG: validasi tipe & max size mengikuti §4.10 `04-owner-dashboard.md`; PNG **tanpa alpha channel** → warning (bukan error): "Frame ini tidak punya area transparan — foto tidak akan terlihat."

### Deliberate simplifications (ponytail)

- Frame selalu di atas foto. Layer frame di bawah / z-configurable → tambah `frame_z` saat dibutuhkan.
- Shape custom/path mask (SVG path) → `shape: "path"` saat dibutuhkan.
- Tidak ada `template_versions` / undo history — draft vs publish cukup (`is_active`).

## 15.3 Owner — Template Builder

**Route:** `/dashboard/templates` (list, §4.10) → buat/edit → `/dashboard/templates/builder/[id]`.

**Flow:**

```
[ BUAT BARU ] → pilih preset canvas (atau custom) → upload PNG frame
   ↓
Builder canvas:
   [ + TAMBAH SLOT ] → drag gambar kotak di canvas
   pilih slot → panel properti: shape, x/y/w/h, rotation, radius, fit
   drag / resize handles / rotate handle langsung di canvas
   [ PREVIEW ] → semua slot diisi foto sample → persis hasil kiosk
   ↓
[ SIMPAN DRAFT ] (is_active=false) / [ PUBLISH ] (is_active=true)
```

**Komponen:** `TemplateBuilder` (canvas), `SlotShape` (hitbox + handles), `SlotPropertiesPanel`, `TemplatePreview`.

**Aturan builder:**

- Slot tidak bisa digeser/di-resize keluar batas canvas (clamp saat drag).
- Minimal 1 slot untuk publish (template tanpa slot = legacy overlay; kalau owner publish tanpa slot → konfirmasi eksplisit "tanpa slot, foto full-canvas").
- Thumbnail template digenerate otomatis dari `TemplatePreview` (canvas → image), menggantikan thumbnail manual.

**UI wajib Neo-Brutalism** — load skill `industrial-brutalist-ui` sebelum implementasi (aturan AGENTS.md / `13-skill-anti-slop.md`).

## 15.4 Render — Composite Engine

**Modul tunggal:** `composeFrame(ctx, layout, frameImg, photos, transforms)` — dipakai builder-preview, editor kiosk, dan `PrintLayoutRenderer`.

Urutan render (satu frame/output):

1. Clear canvas ke resolusi `canvas.width × canvas.height`.
2. Untuk setiap slot urut `z` naik: clip ke shape path (rect / `roundRect` / ellipse; rotation via `ctx.rotate` di center slot) → `drawImage` foto terkait dengan `fit` cover/contain + transform zoom/pan customer (clamp minimal cover-fit).
3. `drawImage` frame PNG di-rect penuh canvas (0,0,canvas.w,canvas.h).
4. Sticker & text (sistem eksisting §5.10–5.11) digambar di atas.

Output = full resolusi design canvas (PNG/JPEG sesuai pipeline finalize eksisting). GIF & result online tidak berubah (tetap dari foto final hasil composite).

**Mapping slot:** `photos.order_index` i → slot ke-i berdasar urutan `z` naik. Jumlah capture = jumlah slot.

## 15.5 Customer — Perubahan Flow (patch `05-customer-photobox.md`)

| Tahap                | Perubahan                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.4 Choose Template | Thumbnail = preview frame dengan slot terisi foto sample; daftar difilter `slot_count == photo_count` package                                  |
| §5.6 Capture         | Jumlah foto = jumlah slot template terpilih                                                                                                    |
| §5.9 Editor          | Zoom/pan menyesuaikan foto **di dalam slot** (bukan full canvas); zoom minimal = cover-fit; filter/adjust/sticker/text tetap di atas composite |
| §5.15 Print          | `PrintLayoutRenderer` memakai `composeFrame` — hasil cetak identik dengan preview builder                                                      |

## 15.6 API (patch `08-api-spec.md` §8.7)

| Endpoint                                              | Perubahan                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET/POST /api/v1/business/:businessId/templates`     | terima/kembalikan `layout` (server validation §15.2)                                |
| `POST /api/v1/business/:businessId/templates/upload`  | multipart PNG; response berisi `layout` kosong siap dibuilder                       |
| `PATCH /api/v1/business/:businessId/templates/:id`    | update `layout` (draft/publish via `is_active`)                                     |
| `GET /api/v1/public/:businessSlug/templates?package=` | include `layout` + frame signed URL; **filter `slot_count == package.photo_count`** |
| `POST /sessions`                                      | memastikan `template_id` pilihan tersimpan (behavior eksisting)                     |

Tidak ada endpoint baru — CRUD lama cukup.

## 15.7 Security & Storage

- Tenant scoping: `templates.business_id` (sudah ada); builder hanya untuk member dengan role `owner`/`manager` (RBAC matrix `09-security-storage.md` — sama seperti Template Management).
- Upload divalidasi (tipe/size); preview pakai signed URL jika private (§4.10).
- `layout` divalidasi server-side — frontend builder tidak dipercaya (prinsip backend = source of truth).

## 15.8 Phasing

- **Tahap A (inti, wajib):** migration `layout` + builder (rect/rounded/circle/ellipse, drag/resize/rotate) + `composeFrame` + kiosk slot-fit + preview sample + filter assign `slot_count`. Test unit: validasi layout, matematika cover-fit, composite deterministik.
- **Tahap B (skip dulu, tambah saat diminta):** shape path/custom mask, `frame_z` layer configurable, duplicate template.

## 15.9 Acceptance Criteria

1. Owner upload PNG + tambah ≥1 slot + publish tanpa training (< 2 menit).
2. Customer memilih frame → foto hasil capture muncul pas di setiap slot (cover-fit, rasio tidak terdistorsi).
3. Template dengan `slot_count ≠ package.photo_count` tidak bisa di-assign dan tidak muncul di pilihan customer.
4. Hasil print & result online identik dengan preview builder (satu engine composite).
5. Template legacy (layout kosong) tetap berfungsi — backward compatible.
6. Validasi layout di-enforce server-side (request dengan layout invalid ditolak 4xx).
