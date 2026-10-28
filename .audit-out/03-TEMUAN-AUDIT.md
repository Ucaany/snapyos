# Temuan Audit — Detail & Jejak Perbaikan

Audit: 2026-10-27 · Lingkup: `src/`, `runtime/`, `src-tauri/`, `scripts/`
Metode: baca kode → verifikasi otomatis → probe runtime nyata → perbaiki → audit ulang

---

## F1 — Kritis — Setelan mesin tidak bisa diubah siapa pun

**Kondisi awal.**

| Fakta | Bukti |
|---|---|
| Runtime punya endpoint tulis setelan | `runtime/settings/index.ts:274` → `if (method === "PUT")` |
| Tidak ada pemanggil di aplikasi | `grep 'method: "PUT"' src/` → **kosong** |
| Fungsi tulis di klien kiosk tidak ada | `grep -c PUT src/components/kiosk/local-runtime.ts` → **0** |
| Dashboard menolak field mesin | `src/lib/photobox-form-fields.ts` → `DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS` |
| Installer tidak menulis setelan | `scripts/install-snapyos.ps1` → hanya `photobox_slug` ke meta |

**Akibat.** Kamera, printer, dan durasi sesi hanya bisa diubah lewat `curl` ke
`127.0.0.1:17777` atau impor berkas JSON manual. Tidak ada jalur sah untuk operator.
Syarat flow #1 ("aplikasi berisi kustomisasi per booth") gagal di tingkat UX meskipun
kontrak backend-nya benar.

**Perbaikan.**

| Berkas | Perubahan |
|---|---|
| `src/components/kiosk/BoothSettingsPanel.tsx` | Panel penuh: seksi Kamera, Printer, Sesi, Tampilan |
| `src/components/kiosk/local-runtime.ts` | `saveDeviceSettings()` → `PUT /v1/settings` dengan `X-Bridge-Token` |
| `src/lib/booth-settings-payload.ts` | Fungsi murni draft → payload (bisa diuji tanpa React) |
| `src/components/kiosk/ExitPinDialog.tsx` | Properti `purpose: "exit" \| "settings"` — PIN sama, akibat berbeda |
| `src/components/kiosk/KioskApp.tsx` | Tombol ⚙ diskret, panel di atas kiosk (tidak melepas fullscreen) |

**Bukti lulus.** `tests/settings-ownership.test.ts` — 7 tes payload:
`copies`/`layout` tidak pernah terkirim, harga/paket/gateway tidak pernah terkirim,
teks dirapikan, panduan dibatasi 8, `printer_name` kosong tidak dikirim, `max_retakes: null`
dipertahankan, payload lolos `deviceSettingsSchema`.

**Kenapa PIN.** Panel mengubah kamera, printer, dan tampilan yang dilihat pelanggan. Tanpa
gerbang, siapa pun yang menyentuh layar bisa mengacaknya. PIN yang dipakai sama dengan PIN
keluar kiosk (cloud dulu; PIN darurat lokal hanya saat jaringan mati).

**Kenapa `purpose` dipisah.** Membuka setelan tidak boleh melepas fullscreen. Kalau memakai
jalur `exit`, booth akan tertinggal dalam keadaan tidak terkunci setelah operator menutup panel.

---

## F2 — Tinggi — Kustomisasi tampilan tidak ada di aplikasi booth

**Kondisi awal.**

```
grep -rn "branding" runtime/ src-tauri/src/   →  0 hit
DEVICE_SETTING_GROUPS                          →  camera, print, session  (tanpa tampilan)
```

Seluruh kustomisasi (warna, tipografi, teks tiap layar, video, panduan) hanya ada di
`business_settings.branding` + `photoboxes.branding`, dibaca `getPublicConfig()`. Aplikasi
booth tidak punya kemampuan menyimpan kustomisasi sendiri → syarat #1 gagal.

**Perbaikan.**

| Berkas | Perubahan |
|---|---|
| `src/lib/validators.ts` | `appearanceSettingsSchema` + grup `appearance_settings` di `DEVICE_SETTING_GROUPS` |
| `src/lib/appearance-merge.ts` | `mergeAppearance(cloud, booth)` — booth menang per-field |
| `runtime/settings/index.ts` | `present()` menyertakan `appearance_settings` |
| `src/components/kiosk/KioskApp.tsx` | `effectiveBranding` dipakai seluruh layar |

**Batas yang dijaga.** Identitas brand **tetap** milik cloud:

| Tetap cloud | Alasan |
|---|---|
| `logo_url` | Aset storage, harus sama di semua booth |
| `primary_color` / `secondary_color` | Identitas brand |
| `kiosk.video_url` dan `pages.*.video_url` | Objek storage — mesin tidak boleh mengarang |
| Nama bisnis | Milik tenant |

`video_key` sengaja **tidak** ada di schema `appearance_settings`, dan `pickAppearance()`
membuangnya kalau tetap dikirim.

**Bukti lulus.** `tests/settings-ownership.test.ts`:
- "kustomisasi booth menang atas branding cloud"
- "identitas cloud tidak hilang saat booth hanya mengubah satu field"
- "override per-layar digabung, video cloud dipertahankan"
- "pickAppearance membuang video_key (objek storage milik cloud)"
- "mergeAppearance tidak memutasi masukan"

---

## F3 — Tinggi — Kustomisasi booth berpotensi menimpa semua booth

**Kondisi awal.** Setelah `appearance_settings` ditambahkan ke `DEVICE_SETTING_GROUPS`,
`deviceSettingsSchema` otomatis menerimanya — termasuk di `PATCH /api/v1/public/devices/settings`.
`pushSettings()` mengirim `activeSettings()` utuh. Baris `photoboxes` dibaca **semua** booth
di business yang sama → mengganti warna latar di booth A akan mengubah booth B.

**Perbaikan.**

| Berkas | Perubahan |
|---|---|
| `src/lib/validators.ts` | `LOCAL_ONLY_DEVICE_GROUPS`, `isLocalOnlySettingGroup()`, `localOnlySettingKeys()` |
| `src/lib/api-errors.ts` | `LOCAL_ONLY_SETTING: 403` |
| `src/app/api/v1/public/devices/settings/route.ts` | Tolak sebelum zod, pesan menyebut field |
| `src/server/devices.ts` | `updateDeviceSettings()` menolak juga (pertahanan berlapis) |
| `runtime/settings/index.ts` | `cloudSyncedSettings()` — saring grup lokal |
| `runtime/sync/worker.ts` | `pushSettings()` memakai `cloudSyncedSettings()` |

**Bukti lulus.**
- `tests/runtime-sync.test.ts` — "appearance_settings tidak pernah ikut PATCH ke cloud"
  (memeriksa isi body request yang benar-benar dikirim worker).
- `tests/settings-ownership.test.ts` — "appearance_settings TIDAK ikut disinkronkan ke cloud",
  "tiga grup mesin tetap disinkronkan ke cloud" (regresi: kalau grup mesin hilang, dashboard
  menampilkan nilai basi).

---

## F4 — Sedang — Aturan kepemilikan tersebar di tiga tempat

**Kondisi awal.** `DEVICE_SETTING_GROUPS` didefinisikan di `src/lib/validators.ts`, lalu
disalin manual di `src/lib/settings-merge.ts` (`DEVICE_GROUPS` + `CLOUD_OWNED`), dan dipetakan
lagi di `runtime/settings/schema.ts`. Tiga salinan = tiga peluang menyimpang.

**Perbaikan.** `settings-merge.ts` diselaraskan (grup + `CLOUD_OWNED` termasuk
`appearance_settings`), dan `runtime/settings/schema.ts` tetap re-export dari validators
(bukan salinan). Tes regresi memastikan ketiganya sepakat.

**Sisa risiko (diterima).** `settings-merge.ts` masih menduplikasi daftar karena ia dipakai
di klien dan sengaja tidak menarik zod. Duplikasi dijaga tes, bukan oleh tipe. Kalau daftar
grup berubah lagi, tes "tiga grup mesin tetap disinkronkan ke cloud" akan gagal lebih dulu.

---

## F5 — Rendah — Dokumentasi menjanjikan hal yang belum ada

**Kondisi awal.** `docs/04-owner-dashboard.md` §4.6.1 menyatakan "setelan mesin milik
aplikasi booth" dan "jalur sah satu-satunya adalah device token", padahal tidak ada UI yang
menulis. `docs/05` hanya menyebut override lewat dashboard.

**Perbaikan.**

| Berkas | Perubahan |
|---|---|
| `docs/04-owner-dashboard.md` | Tabel 4 grup, dua jalur tulis, penolakan `LOCAL_ONLY_SETTING` |
| `docs/05-customer-photobox.md` | Dua lapis override + urutan merge |
| `docs/status.md` | Baris "Setelan booth di aplikasi booth" + "Kustomisasi tampilan per booth" |
| `docs/21-skema-cloud-vs-booth.md` | **Baru** — skema lengkap |

**Bukti lulus.** `tests/settings-ownership.test.ts` — 3 tes dokumentasi yang membaca berkas
nyata dan memastikan modul yang dirujuk benar-benar ada. Dokumentasi tidak bisa lagi
menyimpang tanpa membuat tes gagal.

---

## F6 — Lingkungan — EXE/MSI belum pernah dibangun

**Fakta.**

```
src-tauri/target/release/     → tidak ada
*.msi / *-setup.exe           → tidak ada
src-tauri/binaries/           → hanya README (node.exe belum ada)
src-tauri/runtime-dist/       → berisi @node-rs/argon2-darwin-arm64 (build macOS)
```

**Kenapa tidak bisa dari mesin ini.** Tiga hal mutlak Windows:

1. Sidecar `node-x86_64-pc-windows-msvc.exe` — harus `node.exe` resmi dari nodejs.org.
2. `@node-rs/argon2-win32-x64-msvc` — `build-kiosk-runtime.mjs` menyalin paket sesuai
   platform mesin build; di macOS hasilnya `darwin-arm64` dan runtime Windows gagal saat boot.
3. Bundler `msi`/`nsis` — WiX (`candle.exe`) dan NSIS (`makensis.exe`) hanya ada di Windows.

**Sudah dijaga kode.** `scripts/build-booth.ps1` langkah 4 langsung `Fail` kalau
`runtime-dist/node_modules/@node-rs/argon2-win32-x64-msvc` tidak ada — jadi build tidak bisa
menghasilkan installer yang rusak diam-diam. Ada 9 tes statis untuk skrip ini.

**Tindakan.** Jalankan `.\scripts\build-booth.ps1` di Windows x64 (Administrator).

---

## F7 — Lingkungan — Runtime belum diuji di hardware booth

Belum diuji di perangkat nyata: kamera DSLR (digiCamControl / gphoto2), printer spooler
(SumatraPDF / CUPS), thermal Bluetooth (ESC/POS), dan sesi offline berhari-hari.

Tes yang ada memverifikasi **logika**: geometri cetak, ESC/POS, mode cetak, payload setelan,
antrean offline, backoff sync. Yang belum: kertas benar-benar keluar.

**Tindakan.** Uji di satu booth setelah installer terpasang.

---

## F8 — Desain — Tidak ada kanal perintah cloud → booth

Perubahan dari dashboard terlihat lewat poll 3 detik (ETag/304). Setelan mesin hanya berubah
dari panel booth. Tidak ada tombol "kirim setelan ke booth" dan tidak ada push.

**Konsekuensi yang harus dipahami operator:** mengganti `copies` di dashboard berlaku segera
(milik cloud); mengganti `paper_size` harus dari panel booth.

---

## F9 — Desain — Updater belum aktif

`SNAPYOS_UPDATE_ENDPOINT` sengaja tidak diisi di `bridge.env`. Kode updater ada dan pubkey
sudah terpasang di `tauri.conf.json`, jadi begitu endpoint diisi tanda tangannya sudah
terverifikasi. Pemasangan tetap menunggu petugas (restart booth di tengah sesi pelanggan
tidak boleh terjadi otomatis).

---

## Ringkasan perubahan berkas

| Berkas | Jenis | Untuk |
|---|---|---|
| `src/lib/validators.ts` | ubah | schema + grup `appearance_settings` + penjaga grup lokal |
| `src/lib/appearance-merge.ts` | **baru** | merge branding cloud + tampilan booth |
| `src/lib/booth-settings-payload.ts` | **baru** | draft → payload (murni, teruji) |
| `src/lib/settings-merge.ts` | ubah | selaraskan daftar grup |
| `src/lib/api-errors.ts` | ubah | `LOCAL_ONLY_SETTING` |
| `src/components/kiosk/BoothSettingsPanel.tsx` | **baru** | panel setelan booth |
| `src/components/kiosk/local-runtime.ts` | ubah | `saveDeviceSettings()` |
| `src/components/kiosk/ExitPinDialog.tsx` | ubah | `purpose: exit \| settings` |
| `src/components/kiosk/KioskApp.tsx` | ubah | branding efektif + tombol & panel |
| `src/app/api/v1/public/devices/settings/route.ts` | ubah | tolak grup lokal |
| `src/server/devices.ts` | ubah | tolak grup lokal (lapis kedua) |
| `runtime/settings/index.ts` | ubah | sajikan appearance, `cloudSyncedSettings()` |
| `runtime/sync/worker.ts` | ubah | jangan kirim appearance ke cloud |
| `tests/settings-ownership.test.ts` | **baru** | 33 tes kontrak & merge |
| `tests/runtime-settings.test.ts` | ubah | +5 tes appearance di runtime |
| `tests/runtime-sync.test.ts` | ubah | +1 tes worker tidak kirim appearance |
| `docs/04`, `docs/05`, `docs/status.md` | ubah | sesuaikan dengan kenyataan |
| `docs/21-skema-cloud-vs-booth.md` | **baru** | skema lengkap |
