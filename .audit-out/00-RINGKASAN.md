# AUDIT SNAPY OS — Kesesuaian Flow Cloud vs Aplikasi Booth

| | |
|---|---|
| Tanggal | 2026-10-27 |
| Lingkup | `src/` (cloud Next.js), `runtime/` (sidecar Node), `src-tauri/` (EXE Tauri v2), `scripts/` (build & installer) |
| Dasar | Dua syarat flow dari pemilik produk (lihat §2) |
| Metode | Baca kode → jalankan verifikasi otomatis → probe runtime sungguhan → perbaiki gap → audit ulang |
| **Hasil akhir** | **PASS** (dengan 3 catatan lingkungan, bukan cacat kode — §7) |

---

## 1. Ringkasan satu paragraf

Aplikasi booth sekarang **memegang sendiri kustomisasi dan setelan teknisnya** (kamera,
printer, sesi, tampilan) di penyimpanan lokal mesin, dan **cloud hanya memegang uang serta
informasi bisnis** (harga, paket, payment gateway, logo, warna brand, video). Sebelum audit
ini, kontrak kepemilikannya sudah benar di backend tetapi **tidak ada satu pun UI yang bisa
menulis setelan mesin** — dashboard menolaknya, panel booth belum ada. Dua gap itu sudah
ditutup, dan kustomisasi tampilan dipastikan **tidak pernah naik ke cloud** agar satu booth
tidak menimpa booth lain.

---

## 2. Syarat flow yang diuji

1. **Aplikasi booth berisi kustomisasi per booth**, sehingga setelan kustomisasi dari
   cloud/web tidak lagi dipakai untuk booth itu.
2. **Setelan payment gateway dan informasi lainnya dilakukan di cloud (website)**, sementara
   setelan teknis berlaku untuk **satu booth**.

---

## 3. Matriks kepatuhan

| # | Butir | Bukti | Status |
|---|---|---|---|
| 1a | Setelan teknis tersimpan di mesin booth | `runtime/settings/index.ts` → `PUT /v1/settings`, SQLite `device_settings` | PASS |
| 1b | Booth bisa mengubah setelan teknisnya sendiri (ada UI) | `src/components/kiosk/BoothSettingsPanel.tsx` + `saveDeviceSettings()` | PASS (sebelumnya GAGAL) |
| 1c | Dashboard menolak setelan mesin | `src/lib/photobox-form-fields.ts` (`DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS`) | PASS |
| 1d | Kustomisasi tampilan milik booth | grup `appearance_settings`, `src/lib/appearance-merge.ts` | PASS (sebelumnya GAGAL) |
| 1e | Kustomisasi booth menang atas cloud | `mergeAppearance(cloud, device)` — booth per-field | PASS |
| 1f | Kustomisasi booth tidak bocor antar-booth | `LOCAL_ONLY_DEVICE_GROUPS`, `403 LOCAL_ONLY_SETTING`, worker filter | PASS |
| 2a | Payment gateway di cloud | `payment_credentials` (terenkripsi), `/dashboard/payment` | PASS |
| 2b | Harga, paket, voucher di cloud | `packages`, `vouchers`, `getPublicConfig` | PASS |
| 2c | Informasi bisnis & brand di cloud | `businesses`, `business_settings.branding`, logo/video | PASS |
| 2d | Booth tidak bisa menulis field uang | `403 FIELD_NOT_DEVICE_OWNED` (copies, layout, payment_mode) | PASS |
| 2e | Setelan teknis berlaku untuk 1 booth | device token → 1 `photobooth`; store lokal per mesin | PASS |

---

## 4. Skema singkat

```
CLOUD (website)                          APLIKASI BOOTH (EXE + runtime lokal)
─────────────────────────────            ──────────────────────────────────
harga · paket · voucher                  kamera · printer · sesi · tampilan
payment gateway (terenkripsi)            disimpan di SQLite lokal
logo · warna brand · video               menang atas cloud untuk booth itu
nama bisnis · laporan · transaksi        tidak pernah naik ke cloud
                    │                                    │
                    └──────── kiosk me-merge ────────────┘
                       branding: cloud → booth (booth menang per-field)
                       mesin   : cloud → booth (copies/layout tetap cloud)
```

Detail lengkap: `01-SKEMA.md`.

---

## 5. Temuan audit

### 5.1 Temuan yang diperbaiki dalam audit ini

| ID | Tingkat | Temuan | Perbaikan | Bukti |
|---|---|---|---|---|
| **F1** | Kritis | Runtime punya `PUT /v1/settings`, tetapi **tidak ada satu pun pemanggil** di `src/`. Dashboard sudah menolak field mesin. Akibatnya setelan kamera/printer/sesi **tidak bisa diubah siapa pun** setelah booth terpasang (hanya lewat `curl`). Syarat 1 gagal di tingkat UX. | Panel **Setelan Booth** (`BoothSettingsPanel.tsx`) + `saveDeviceSettings()` di `local-runtime.ts`; dibuka lewat PIN petugas. | `tests/settings-ownership.test.ts` (7 tes payload) |
| **F2** | Tinggi | Kustomisasi tampilan 100% milik cloud: `runtime/` dan `src-tauri/` **nol** referensi branding. Aplikasi booth tidak bisa menyimpan kustomisasi per booth → syarat 1 gagal. | Grup `appearance_settings` (device-owned) + `mergeAppearance()`; kiosk memakai branding efektif. | `tests/settings-ownership.test.ts` (merge, identitas cloud utuh) |
| **F3** | Tinggi | Tanpa penjagaan, `appearance_settings` akan ikut `PATCH /devices/settings` dan menulis baris `photoboxes` yang dibaca **semua** booth → satu booth mengubah tampilan semua booth. | `LOCAL_ONLY_DEVICE_GROUPS`; cloud menjawab `403 LOCAL_ONLY_SETTING`; sync worker menyaring lewat `cloudSyncedSettings()`. | `tests/runtime-sync.test.ts` — "appearance_settings tidak pernah ikut PATCH ke cloud" |
| **F4** | Sedang | Aturan kepemilikan setelan tersebar (validators, settings-merge, runtime schema) dan bisa menyimpang. | Semua membaca `DEVICE_SETTING_GROUPS` dari `src/lib/validators.ts`; `settings-merge.ts` diselaraskan. | `tests/settings-ownership.test.ts` — "tiga grup mesin tetap disinkronkan" |
| **F5** | Rendah | Dokumentasi menyatakan "setelan mesin milik aplikasi booth" padahal belum ada jalurnya. | `docs/04` §4.6.1, `docs/05` §5.2, `docs/status.md`, `docs/21` diperbarui + tes penjaga docs. | `tests/settings-ownership.test.ts` — 3 tes dokumentasi |

### 5.2 Temuan yang dibiarkan (bukan cacat kode)

| ID | Tingkat | Temuan | Alasan |
|---|---|---|---|
| **F6** | Lingkungan | `.exe`/`.msi` belum pernah dibangun. Tidak ada artefak, tidak ada mesin Windows yang menjalankan build. | Build **hanya** bisa di Windows x64: sidecar `node.exe`, `@node-rs/argon2-win32-x64-msvc`, WiX/NSIS. Bukan bisa diperbaiki dari macOS. |
| **F7** | Lingkungan | Runtime belum pernah jalan di hardware booth (DSLR, spooler, thermal). | Butuh perangkat fisik. Tes yang ada memverifikasi logika, bukan kertas keluar. |
| **F8** | Desain | Tidak ada kanal perintah cloud → booth. | Disengaja: perubahan dari dashboard terlihat lewat poll 3 detik; setelan mesin hanya dari panel booth. |
| **F9** | Desain | Updater belum aktif (`SNAPYOS_UPDATE_ENDPOINT` kosong). | Disengaja: manifest rilis belum punya rumah; pubkey sudah terpasang. |

---

## 6. Hasil verifikasi

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Unit/integration test | `npm test` | **1153 lulus, 0 gagal** |
| TypeScript | `npx tsc --noEmit` | **0 error** |
| ESLint | `npm run lint` | **0 error**, 18 warning (`@next/next/no-img-element`, sudah ada sebelumnya) |
| Build produksi | `npm run build` | **sukses** (97 halaman) |
| Rust lint | `cargo clippy` | **0 warning** |
| Probe runtime nyata | `curl` ke `runtime-dist/main.mjs` | `PUT/GET appearance_settings` OK · `copies` → **403** · `font_scale:3` → **400** · tanpa token → **401** · export tanpa PIN |

Bukti mentah ada di `evidence/`.

---

## 7. Verdict

> ### PASS
>
> **Syarat 1 — kustomisasi & setelan teknis per booth di aplikasi: PASS.**
> Booth menyimpan kamera, printer, sesi, dan tampilan di SQLite lokal; panel setelan di dalam
> aplikasi booth (PIN-gated) adalah satu-satunya jalur tulis; dashboard menolak field mesin;
> kustomisasi tampilan menang atas cloud dan tidak pernah naik ke cloud.
>
> **Syarat 2 — payment gateway & informasi di cloud: PASS.**
> Kredensial gateway (terenkripsi), harga, paket, voucher, nama bisnis, logo, warna brand, dan
> video semuanya di cloud. Booth yang mencoba menulisnya dijawab `403`, bukan dibuang
> diam-diam.

**Yang tidak dicakup PASS ini** (dan tidak bisa dicakup dari mesin ini):

- Membangun dan memasang `.exe`/`.msi` — wajib di Windows x64 (`scripts/build-booth.ps1`).
- Uji hardware booth: kamera DSLR, printer spooler, thermal Bluetooth.
- Uji lapangan sesi offline berhari-hari.

Artinya: **kode dan kontraknya PASS; artefak instalasinya belum ada.** Langkah berikutnya
murni operasional (build di Windows → unggah → daftarkan di `/admin/apps` → pasang → uji).

---

## 8. Isi paket ini

```
SNAPYOS-AUDIT-2026-10-27.zip
├─ 00-RINGKASAN.md            ← dokumen ini
├─ 01-SKEMA.md                ← skema lengkap cloud vs booth
├─ 02-MATRIX-KEPEMILIKAN.md   ← tabel siapa memiliki field apa
├─ 03-TEMUAN-AUDIT.md         ← detail F1–F9 + jejak perbaikan
├─ 04-CHECKLIST-FLOW.md       ← checklist verifikasi manual
├─ audit.json                 ← hasil terstruktur (machine-readable)
├─ evidence/
│  ├─ npm-test.txt
│  ├─ typecheck.txt
│  ├─ lint.txt
│  ├─ build.txt
│  ├─ cargo-clippy.txt
│  └─ runtime-probe.txt
└─ patch/
   └─ audit-changes.patch     ← diff lengkap perubahan audit
```
