# Matriks Kepemilikan Setelan — SNAPY OS

Status: active · Last verified: 2026-10-27
Source of truth: `src/lib/validators.ts`

Prinsip: **uang & brand milik cloud; mesin di lokasi milik booth.**

---

## 1. Per grup

| Grup | Pemilik | Disimpan di | Naik ke cloud? | Bisa diubah dari |
|---|---|---|---|---|
| `camera_settings` | Booth | SQLite lokal `device_settings` | Ya (`PATCH .../devices/settings`) | Panel Setelan Booth |
| `print_settings` | Booth | SQLite lokal | Ya | Panel Setelan Booth |
| `session_settings` | Booth | SQLite lokal | Ya | Panel Setelan Booth |
| `appearance_settings` | **Booth (lokal saja)** | SQLite lokal | **Tidak** — `403 LOCAL_ONLY_SETTING` | Panel Setelan Booth |

---

## 2. Per field

### 2.1 `camera_settings` — milik booth

| Field | Tipe | Catatan |
|---|---|---|
| `provider` | `browser` \| `gphoto2` | Siapa yang memegang shutter |
| `bridge_url` | url ≤300 | Alamat runtime lokal |
| `countdown_seconds` | 1–10 | Hitung mundur sebelum foto |
| `mirror_preview` | bool | Pratinjau cermin |
| `chroma_key_enabled` | bool | Green screen |
| `fullscreen` | bool | Kunci fullscreen |
| `facingMode` | `user` \| `environment` \| null | Kamera depan/belakang |
| `preferred_device_id` | string ≤200 \| null | DeviceId perangkat kamera |
| `capture_width` / `capture_height` | 640–7680 / 480–4320 | Resolusi tangkap |
| `jpeg_quality` | 0.5–1 | Kualitas JPEG |
| `rotation_degrees` | 0/90/180/270 | Rotasi gambar |
| `zoom` | 1–5 | Zoom optik/digital |
| `screen_orientation` | `landscape` \| `portrait` | Orientasi layar booth |

### 2.2 `print_settings` — campuran

| Field | Pemilik | Catatan |
|---|---|---|
| `enabled` | Booth | Cetak aktif/tidak |
| `paper_size` | Booth | `4x6` \| `A6` |
| `orientation` | Booth | Kertas portrait/landscape |
| `auto_print` | Booth | Cetak otomatis setelah finalize |
| `margins_mm` | Booth | 0–20 |
| `mode` | Booth | `browser` \| `bluetooth` \| `cups` |
| `bluetooth_paper_width_mm` | Booth | 58 \| 80 |
| `bluetooth_device_name` | Booth | Informasi petugas, bukan kredensial |
| `bridge_url` | Booth | Alamat runtime |
| `printer_name` | Booth | Nama printer di OS |
| **`copies`** | **Cloud** | 1–20 — biaya bahan |
| **`layout`** | **Cloud** | `single` \| `strip` — bentuk produk |

### 2.3 `session_settings` — milik booth

| Field | Tipe | Catatan |
|---|---|---|
| `timer_seconds` | 60–3600 | Durasi sesi |
| `warning_seconds` | 10–600 | Harus < `timer_seconds` |
| `max_retakes` | 0–50 \| null | `null` = tanpa batas |

### 2.4 `appearance_settings` — milik booth, **tidak naik ke cloud**

| Field | Tipe | Catatan |
|---|---|---|
| `bg_color` / `text_color` | `#RRGGBB` | Warna layar booth |
| `font_family` | `display` \| `sans` \| `mono` | Tipografi |
| `font_scale` | 0.8–1.4 | Skala teks |
| `button_radius` | 0–24 | Radius tombol |
| `padding` | 0–96 | Padding layar |
| `align` | `left` \| `center` \| `right` | Perataan konten |
| `welcome_layout` | `split-left` \| `split-right` \| `center` | Tata letak sambutan |
| `result_layout` | `qr-right` \| `qr-left` \| `qr-below` | Tata letak hasil |
| `welcome_title` / `welcome_tagline` / `welcome_button` | teks | Mengalahkan teks cloud |
| `payment_title` / `payment_hint` | teks | Layar pembayaran |
| `capture_title` / `capture_hint` | teks | Layar kamera |
| `editor_title` / `editor_hint` | teks | Layar editor |
| `result_title` / `result_hint` | teks | Layar hasil |
| `guide_title` / `guide_button` | teks | Layar panduan |
| `package_title` / `template_title` | teks | Judul layar |
| `show_logo` / `show_tagline` | bool | Tampilkan elemen brand |
| `show_mirror_toggle` / `allow_zoom_pan` | bool | Kontrol interaksi |
| `guide_steps` | string[] ≤8 | Panduan cara foto |
| `pages` | per-layar | `welcome` `guide` `package` `payment` `template` `capture` `edit` `result` |

### 2.5 Milik cloud — tidak punya representasi di booth

| Field / entitas | Tabel / modul | Kenapa cloud |
|---|---|---|
| Harga & paket | `packages` | Sumber pendapatan |
| Voucher | `vouchers` | Kebijakan diskon |
| `payment_mode` | `photoboxes.payment_mode` | Kanal bayar per booth = kebijakan bisnis |
| Payment gateway (kredensial) | `payment_credentials` (terenkripsi) | Rahasia merchant |
| Nama bisnis, kontak, alamat | `businesses` | Identitas tenant |
| Logo | `business_settings.branding.logo_key` | Aset storage |
| `primary_color` / `secondary_color` | `business_settings.branding` | Identitas brand |
| Video promosi | `branding.kiosk.video_key`, `pages.*.video_key` | Aset storage |
| `exit_pin_hash` | `photoboxes` | Kredensial petugas |
| Status booth | `photoboxes.status` | Kontrol operasional |

---

## 3. Penolakan yang disengaja

| Payload berisi | Endpoint | Dijawab |
|---|---|---|
| `print_settings.copies` | runtime `PUT /v1/settings` | `403 FIELD_NOT_DEVICE_OWNED` |
| `print_settings.layout` | runtime `PUT /v1/settings` | `403 FIELD_NOT_DEVICE_OWNED` |
| `payment_mode` | runtime `PUT /v1/settings` | `403 FIELD_NOT_DEVICE_OWNED` |
| `appearance_settings` | cloud `PATCH .../devices/settings` | `403 LOCAL_ONLY_SETTING` |
| `copies` / `layout` / `payment_mode` | cloud `PATCH .../devices/settings` | `403 FIELD_NOT_DEVICE_OWNED` |
| Field mesin lewat form dashboard | server action photobox | ditolak `forbiddenPhotoboxFields()` |
| `font_scale: 3`, `bg_color: "biru"` | runtime `PUT /v1/settings` | `400 INVALID_SETTINGS` |
| Tanpa `X-Bridge-Token` | runtime (selain `/health`) | `401` |

Tidak ada nilai yang dibuang diam-diam: setiap penolakan menyebut nama field-nya.

---

## 4. Urutan merge (yang menang)

```
appearance_settings  >  branding.kiosk (cloud)        ← per-field, booth menang
appearance_settings  >  branding.welcome_* (cloud)    ← booth menang
branding.logo_url / primary_color / secondary_color   ← SELALU cloud
branding.kiosk.pages.*.video_url                      ← SELALU cloud

camera_settings / print_settings / session_settings (booth)  >  photoboxes.* (cloud)
photoboxes.print_settings.copies / .layout                   ← SELALU cloud
```

Runtime mati → `GET /v1/settings` gagal → semua nilai cloud dipakai apa adanya.
