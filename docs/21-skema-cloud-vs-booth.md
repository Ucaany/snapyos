# Skema Aplikasi SNAPY OS — Cloud vs Aplikasi Booth

Status: active
Audience: developer, operator, owner
Last updated: 2026-10-27
Last verified: 2026-10-27
Source of truth: `src/`, `runtime/`, `src-tauri/`, `src/lib/validators.ts`

Dokumen ini menjelaskan pembagian tugas antara **cloud (website)** dan **aplikasi booth
(EXE Tauri + runtime lokal)**, khususnya siapa yang berhak menulis setelan apa.

---

## 1. Dua program, satu kontrak

```
┌─────────────────────────────────────────────────────────────┐
│  CLOUD — Next.js di test.snapyos.biz.id                     │
│                                                             │
│  • Dashboard owner/admin/staff                              │
│  • Harga, paket, voucher                                    │
│  • Payment gateway (kredensial per business)                │
│  • Logo, warna brand, video promosi                         │
│  • Halaman kiosk yang dirender ke WebView                   │
│  • Sesi cloud, transaksi, laporan                           │
└───────────────▲──────────────────────────┬──────────────────┘
                │                          │
   HTTPS        │  POST sesi/finalize      │  GET halaman kiosk
   (device      │  PATCH setelan mesin     │  (HTML + config publik)
    token)      │  POST laporan/report     │
                │                          ▼
┌───────────────┴─────────────────────────────────────────────┐
│  APLIKASI BOOTH — EXE Tauri v2 (Windows)                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Jendela WebView2 (kiosk fullscreen, tanpa dekorasi)   │  │
│  │  memuat halaman kiosk cloud                           │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ HTTP loopback 127.0.0.1:17777    │
│                          │ header X-Bridge-Token            │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │  SIDECAR Node (runtime lokal) — dijalankan Rust       │  │
│  │  • SQLite lokal (sesi, capture, antrean sync)         │  │
│  │  • Kamera (browser / gphoto2 / digiCamControl)        │  │
│  │  • Printer (dialog OS / CUPS / thermal Bluetooth)     │  │
│  │  • PIN darurat offline                                │  │
│  │  • SETELAN BOOTH (4 grup)                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Yang membuat booth bisa jalan saat internet mati: halaman kiosk di-cache service worker,
sesi ditutup lokal lebih dulu, lalu dikirim ke cloud oleh sync worker saat jaringan pulih.

---

## 2. Aturan kepemilikan setelan

Prinsipnya satu kalimat: **yang berhubungan dengan uang dan brand milik cloud; yang
berhubungan dengan mesin di lokasi milik booth.**

| Grup setelan           | Pemilik | Kenapa                                                              |
| ---------------------- | ------- | ------------------------------------------------------------------- |
| `camera_settings`      | Booth   | Hanya mesin itu yang tahu kamera mana yang terpasang                |
| `print_settings`       | Booth   | Mode cetak, kertas, margin, nama printer = kondisi perangkat        |
| `session_settings`     | Booth   | Durasi & retake mengikuti antrean dan kenyamanan lokasi             |
| `appearance_settings`  | Booth   | Ukuran/rasio layar tiap booth berbeda; teks bisa muat di A, tidak di B |
| `print_settings.copies`| **Cloud** | Biaya bahan — satu booth tidak boleh menurunkan/menaikkan sendiri  |
| `print_settings.layout`| **Cloud** | Bentuk produk yang dijual ke pelanggan                             |
| `payment_mode`         | **Cloud** | Kanal bayar = kebijakan bisnis                                    |
| Harga, paket, voucher  | **Cloud** | Sumber pendapatan                                                  |
| Payment gateway        | **Cloud** | Kredensial merchant, terenkripsi di server                         |
| Logo, `primary_color`, `secondary_color`, video | **Cloud** | Identitas brand harus sama di semua booth        |

Tabel ini hidup di **satu tempat**: `src/lib/validators.ts`
(`DEVICE_SETTING_GROUPS`, `CLOUD_OWNED_SETTING_FIELDS`, `CLOUD_SYNCED_DEVICE_GROUPS`,
`LOCAL_ONLY_DEVICE_GROUPS`). Runtime, route cloud, kiosk, dan panel setelan semuanya membaca
dari sana — tidak ada salinan aturan yang bisa berbeda pendapat.

### 2.1 Dua jalur tulis, dua penolakan

```
Panel Setelan Booth (di aplikasi booth)
        │  PUT /v1/settings        (loopback + X-Bridge-Token)
        ▼
   runtime lokal ──► SQLite lokal (device_settings)
        │                    ├─ camera_settings
        │                    ├─ print_settings
        │                    ├─ session_settings
        │                    └─ appearance_settings   ← TIDAK PERNAH naik ke cloud
        │
        │  PATCH /api/v1/public/devices/settings   (sync worker, tiap 15 dtk)
        ▼
      cloud ──► photoboxes.camera_settings / print_settings / session_settings
```

Penolakan yang disengaja (bukan dibuang diam-diam):

| Payload berisi                          | Dijawab                          |
| --------------------------------------- | -------------------------------- |
| `print_settings.copies`                 | `403 FIELD_NOT_DEVICE_OWNED`     |
| `print_settings.layout`                 | `403 FIELD_NOT_DEVICE_OWNED`     |
| `payment_mode`, `status`, `price`       | `403 FIELD_NOT_DEVICE_OWNED`     |
| `appearance_settings` (ke cloud)        | `403 LOCAL_ONLY_SETTING`         |
| Nilai di luar kontrak (mis. `font_scale: 3`) | `400 INVALID_SETTINGS`      |

`appearance_settings` sengaja ditolak di cloud karena baris `photoboxes` dibaca **semua**
booth di business yang sama. Kalau satu booth boleh menulisnya lewat cloud, mengganti warna
latar di booth A akan mengubah tampilan booth B.

---

## 3. Alur setelan: cloud → booth → cloud

### 3.1 Yang dibaca booth dari cloud

`GET /api/v1/public/:businessSlug?photobox=:slug` mengembalikan `PublicConfig`:

```
PublicConfig
├─ business      { name, slug, logo_url }
├─ branding      ← identitas & tampilan DASAR dari website
│   ├─ welcome_title / tagline / button
│   ├─ primary_color / secondary_color
│   ├─ logo_url
│   └─ kiosk { bg_color, text_color, font_scale, padding, align,
│              judul+hint tiap layar, guide_steps,
│              pages { welcome…result: { bg_color, video_url, … } } }
├─ photobox      { id, slug, name, status,
│                  camera_settings, print_settings, session_settings,
│                  device_status }
├─ packages      [ { id, name, price, photo_count, print_count, … } ]
└─ checkout      { offline_enabled }
```

Kiosk mem-poll ini tiap 3 detik dengan `If-None-Match`; server menjawab `304` bila tidak
berubah (tanpa presign R2, tanpa render ulang).

### 3.2 Yang dibaca booth dari mesinnya sendiri

`GET /v1/settings` (loopback, wajib token):

```json
{
  "ok": true,
  "photobox_slug": "booth-01",
  "business_slug": "snapy-demo",
  "settings": {
    "camera_settings":     { "provider": "gphoto2", "countdown_seconds": 4 },
    "print_settings":      { "paper_size": "A6", "printer_name": "DNP QW410" },
    "session_settings":    { "timer_seconds": 300, "warning_seconds": 60 },
    "appearance_settings": { "bg_color": "#101820", "padding": 40 }
  }
}
```

### 3.3 Cara keduanya digabung di kiosk

```
branding cloud  ──┐
                  ├─► mergeAppearance() ─► branding efektif ─► semua layar kiosk
appearance booth ─┘    (booth menang per-field;
                        logo/warna brand/video tetap cloud)
```

```
photobox cloud  ──┐
                  ├─► mergeSettings() ─► setelan efektif ─► kamera, printer, timer
setelan booth   ──┘    (copies & layout tetap cloud)
```

Runtime mati (`GET /v1/settings` gagal/timeout 1,5 dtk) → `null` → cloud dipakai apa adanya.
Booth tetap bisa menjual; itu keadaan normal untuk kiosk browser tanpa runtime.

---

## 4. Panel Setelan Booth (di dalam aplikasi booth)

**Lokasi:** ikon ⚙ kecil di kiri-bawah layar kiosk → dialog PIN petugas → panel penuh.

**Kenapa PIN:** panel ini mengubah kamera, printer, dan tampilan yang dilihat pelanggan.
Tanpa gerbang, siapa pun yang menyentuh layar bisa mengacaknya. PIN yang dipakai sama dengan
PIN keluar kiosk (diverifikasi cloud; PIN darurat lokal saat internet mati).

**Bedanya dengan keluar kiosk:** PIN untuk setelan **tidak** melepas fullscreen dan **tidak**
menghentikan sesi pelanggan — hanya membuka panel di atas kiosk.

| Seksi     | Field yang bisa diubah                                                                 |
| --------- | -------------------------------------------------------------------------------------- |
| Kamera    | `provider`, `countdown_seconds`, `capture_width/height`, `mirror_preview`, `screen_orientation` |
| Printer   | `enabled`, `mode`, `paper_size`, `orientation`, `auto_print`, `margins_mm`, `printer_name`      |
| Sesi      | `timer_seconds`, `warning_seconds`, `max_retakes`                                       |
| Tampilan  | `bg_color`, `text_color`, `font_scale`, `button_radius`, `padding`, judul & tagline sambutan, `guide_steps` |

**Yang TIDAK ada di panel (dan kenapa):**

| Tidak ada                   | Alasan                                              |
| --------------------------- | --------------------------------------------------- |
| `copies`, `layout`          | Biaya bahan & bentuk produk = kebijakan bisnis      |
| Harga, paket, voucher       | Sumber pendapatan, harus terpusat                   |
| Payment gateway             | Kredensial merchant, terenkripsi di server          |
| Logo, warna brand, video    | Identitas brand harus konsisten di semua booth      |
| Nama bisnis                 | Milik tenant                                        |

**Kalau panel tetap mengirim field terlarang:** runtime menjawab `403` dengan pesan yang
menyebut nama field-nya, dan panel menampilkannya apa adanya. Tidak ada nilai yang dibuang
diam-diam — operator harus tahu setelannya tidak berlaku.

**Kenapa panel tidak punya input `copies`/`layout` sama sekali:** tipenya
(`src/lib/booth-settings-payload.ts`) tidak punya field itu, jadi mustahil ikut terkirim.
Ada tes yang gagal kalau seseorang menambahkannya.

---

## 5. Alur data booth (offline-first)

```
Pelanggan bayar
      │
      ▼
Sesi dibuka ──► online?  ── ya ──► POST /sessions (cloud) ──► sesi cloud
      │                │
      │                └─ tidak ─► POST /v1/sessions (runtime) ─► SQLite lokal
      ▼                                                              │
Capture foto ──► disk lokal (media/)                                 │
      ▼                                                              │
Finalize ──► online? ── ya ──► POST /sessions/:id/finalize           │
      │          │                                                 │
      │          └─ tidak ─► POST /v1/sessions/:id/finalize ────────┘
      ▼
Sync worker (tiap 15 dtk, backoff min(2^n × 1 dtk, 5 mnt) ± 20%)
  1. POST /sessions            → simpan cloud_id SEGERA (anti sesi ganda)
  2. POST /sessions/:id/finalize (foto dari disk; idempoten)
  3. tandai synced_at
  4. PATCH /devices/settings   → setelan mesin (TANPA appearance_settings)

Cloud menolak 410 / SESSION_EXPIRED
  → media disalin ke data/quarantine/<session_id>/ LEBIH DULU
  → baru baris lokal dihapus. Foto yang sudah dibayar tidak boleh hilang.
```

---

## 6. Keamanan & isolasi

| Permukaan                  | Kontrol                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Runtime lokal (17777)      | Hanya `127.0.0.1`, wajib `X-Bridge-Token` (sha256 + constant-time); `/health` satu-satunya rute terbuka |
| Origin kiosk               | Allowlist `PHOTOBOOTH_BRIDGE_ORIGINS`; origin asing → `403` sebelum routing |
| Endpoint device cloud      | Bearer `device_token` di-hash; device/business non-`active` → `403`     |
| Rate limit                 | Per IP + per device token pada tiap endpoint device                     |
| Tenant                     | Semua query cloud di-scope `business_id`; RLS `svc_all` untuk service_role |
| PIN petugas                | Cloud dulu; PIN darurat lokal hanya saat jaringan mati (agar `PIN_LOCKED` tidak bisa diakali dengan mencabut kabel) |
| Kunci PIN                  | 5 gagal → kunci 5 menit, disimpan di `meta` (bertahan setelah restart)  |
| Setelan tampilan di cloud  | Ditolak `LOCAL_ONLY_SETTING` agar tidak bocor antar-booth               |

---

## 7. Peta berkas

| Berkas                                        | Peran                                                      |
| --------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/validators.ts`                       | **Satu-satunya** tabel kepemilikan setelan + schema zod    |
| `src/lib/appearance-merge.ts`                 | Merge branding cloud + tampilan booth (murni, bisa diuji)  |
| `src/lib/booth-settings-payload.ts`           | Bentuk payload panel → `PUT /v1/settings` (murni)          |
| `src/lib/settings-merge.ts`                   | Merge setelan mesin di atas `photobox` cloud               |
| `src/lib/photobox-form-fields.ts`             | Field yang ditolak form dashboard                          |
| `src/components/kiosk/BoothSettingsPanel.tsx` | Panel setelan booth (PIN-gated)                            |
| `src/components/kiosk/local-runtime.ts`       | Klien runtime lokal (GET/PUT settings, sesi, PIN)          |
| `runtime/settings/index.ts`                   | `GET/PUT /v1/settings`, export/import, `cloudSyncedSettings` |
| `runtime/sync/worker.ts`                      | Kirim sesi + setelan mesin ke cloud                        |
| `runtime/db/schema.ts`                        | Skema SQLite lokal (migrasi `PRAGMA user_version`)         |
| `src-tauri/src/main.rs`                       | Jendela kiosk, izin kamera, siklus hidup sidecar           |
| `scripts/build-kiosk-runtime.mjs`             | Bundel runtime → `src-tauri/runtime-dist/`                 |
| `scripts/build-booth.ps1`                     | Build EXE/MSI di Windows (7 langkah)                       |

---

## 8. Batas yang jujur

Hal-hal berikut **belum** bisa dijanjikan kode ini:

- **EXE/MSI belum pernah dibangun di mesin Windows.** Build hanya bisa dilakukan di Windows
  x64 (sidecar `node.exe`, `@node-rs/argon2-win32-x64-msvc`, WiX/NSIS).
- **Runtime belum diuji di hardware booth sungguhan.** Kamera DSLR (digiCamControl/gphoto2),
  printer spooler (SumatraPDF/CUPS), dan thermal Bluetooth belum diuji di perangkat nyata.
- **Tidak ada kanal perintah cloud → booth.** Perubahan dari dashboard terlihat lewat poll
  3 detik; setelan mesin hanya berubah dari panel booth.
- **`sha256` dan ukuran installer tidak diverifikasi sistem.** Owner memeriksa manual.
- **Updater belum aktif.** `SNAPYOS_UPDATE_ENDPOINT` sengaja kosong di `bridge.env`.
