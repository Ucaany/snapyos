# Build EXE Aplikasi Booth (Windows)

Status: active
Audience: developer, operator
Last updated: 2026-10-26
Last verified: 2026-10-26
Source of truth: `scripts/build-booth.ps1`, `src-tauri/`, `runtime/`

## Kenapa hanya Windows

Tiga hal di build booth tidak bisa disiapkan dari macOS atau Linux:

| Hal                              | Kenapa                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidecar `node.exe`               | Tauri menyalin berkas di `src-tauri/binaries/` menjadi `node-<triple>.exe` di sebelah EXE. Nama untuk x64 wajib `node-x86_64-pc-windows-msvc.exe`.                                              |
| `@node-rs/argon2-win32-x64-msvc` | Modul native untuk hash PIN darurat. `scripts/build-kiosk-runtime.mjs` menyalin paket sesuai **platform mesin build**, jadi di Mac hasilnya `darwin-arm64` dan runtime Windows gagal saat boot. |
| Bundler MSI/NSIS                 | WiX (`candle.exe`) dan NSIS (`makensis.exe`) hanya tersedia di Windows.                                                                                                                         |

Runtime butuh Node ≥ 22 karena memakai `node:sqlite`. Disarankan 24 LTS: versi 22 awal masih memerlukan `--experimental-sqlite`, dan installer menolaknya.

## Prasyarat mesin build

| Perangkat        | Versi               | Cara pasang                                                  |
| ---------------- | ------------------- | ------------------------------------------------------------ |
| Node.js          | 22 atau 24 LTS, x64 | <https://nodejs.org>                                         |
| Rust (MSVC)      | stable              | `rustup default stable-x86_64-pc-windows-msvc`               |
| WiX Toolset      | v3 atau v4          | <https://wixtoolset.org> (untuk target `msi`)                |
| NSIS             | 3.x                 | <https://nsis.sourceforge.io/Download> (untuk target `nsis`) |
| WebView2 Runtime | evergreen           | Sudah ada di Windows 10/11; installer memeriksanya           |

Setelah memasang WiX atau NSIS, buka terminal baru supaya PATH ter-refresh.

## Menjalankan build

Buka **PowerShell as Administrator** di root repo:

```powershell
.\scripts\build-booth.ps1
```

Skrip menjalankan tujuh langkah berurutan dan berhenti di kegagalan pertama:

1. **Cek mesin** — Windows x64, repo punya `package.json`.
2. **Cek toolchain** — Node ≥ 22, `cargo` ada, toolchain aktif MSVC, WiX/NSIS sesuai target.
3. **Unduh sidecar** — `node.exe` dari `nodejs.org/dist`, SHA-256 dicocokkan dengan `SHASUMS256.txt` resmi, lalu disalin ke `src-tauri/binaries/node-x86_64-pc-windows-msvc.exe`. Lewati dengan `-SkipNodeDownload` bila berkasnya sudah ada.
4. **Cek npm** — `npm ci` bila `node_modules` belum ada, `npm install` bila `@tauri-apps/cli-win32-x64-msvc` belum terunduh (optionalDependency, sering absen di mesin yang sebelumnya install dari Mac).
5. **Bundel runtime** — `node scripts/build-kiosk-runtime.mjs`, lalu verifikasi `main.mjs`, `argon2-win32-x64-msvc`, dan `standard-fonts` benar-benar ada di `runtime-dist/`. `beforeBuildCommand` Tauri menjalankan bundel yang sama; di sini dijalankan lebih dulu supaya kegagalan terlihat sebelum build Rust yang lama.
6. **Tulis versi** — `runtime-dist/package.json` diberi `version` dari `package.json` root, dan nilainya dicocokkan dengan `src-tauri/tauri.conf.json`. Tanpa langkah ini runtime melaporkan `0.0.0` dan `/dashboard/apps` tidak pernah menandai booth ketinggalan.
7. **`tauri build`** — lalu mencetak path dan SHA-256 setiap artefak.

Parameter:

| Parameter           | Default    | Keterangan                                                |
| ------------------- | ---------- | --------------------------------------------------------- |
| `-NodeVersion`      | `24.22.1`  | Versi Node yang diunduh sebagai sidecar.                  |
| `-SkipNodeDownload` | mati       | Pakai sidecar yang sudah ada di `src-tauri/binaries/`.    |
| `-Targets`          | `msi nsis` | Target bundel, dipisahkan spasi. Contoh: `-Targets nsis`. |

## Hasil

Selesai menjalankan `.\scripts\build-booth.ps1`, semua artefak dikemas dalam:
**`snapyos-booth-build.zip`** (di root repo)

Isi ZIP:

- Folder target Tauri (`msi/`, `nsis/`) berisi installer `.exe`/`.msi`.

Setiap artefak dicetak detailnya (nama, path, SHA-256) di terminal.

```
snapyos-booth-build.zip
├── msi\SNAPY OS Kiosk_0.1.0_x64_en-US.msi
└── nsis\SNAPY OS Kiosk_0.1.0_x64-setup.exe
```

Nama berkas mengikuti `productName` dan `version` di `src-tauri/tauri.conf.json`.
Isi bundel: EXE kiosk, sidecar `node.exe`, folder `runtime/` (hasil bundel),
dan WebView2 bootstrapper (`embedBootstrapper`).

## Setelah build

Installer tidak disimpan di storage SNAPY OS. Yang dicatat hanya tautan dan
metadata di tabel `app_releases`. Prosedur lengkap ada di
[`19-desktop-app-release.md`](./19-desktop-app-release.md):

1. Unggah `.msi`/`.exe` ke Google Drive, akses **"Siapa saja yang punya link"**.
2. Isi versi, URL, ukuran byte, dan SHA-256 di `/admin/apps`.
3. Pastikan baris berstatus **Aktif**.
4. Pasang di booth: `.\scripts\install-snapyos.ps1 -AppDir "<folder hasil pasang>" -CloudUrl https://test.snapyos.biz.id -KioskUrl https://test.snapyos.biz.id/p/<business>/<booth>`.

## Yang belum diverifikasi

Status ini jujur, bukan target:

- **EXE/MSI belum pernah dibangun.** Tidak ada artefak di repo dan tidak ada
  mesin Windows yang pernah menjalankan build ini.
- **Runtime belum pernah jalan di Windows.** Tes otomatis hanya memverifikasi
  teks skrip PowerShell dan logika TypeScript. Kamera DSLR (digiCamControl),
  printer spooler (SumatraPDF), dan sesi offline SQLite belum diuji pada
  perangkat keras sungguhan.
- **Updater belum aktif.** `SNAPYOS_UPDATE_ENDPOINT` sengaja tidak diisi di
  `bridge.env`; begitu diisi, tanda tangan sudah terverifikasi karena pubkey
  sudah terpasang di config.

## Kalau build gagal

| Gejala                                  | Sebab                                     | Perbaikan                                      |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `WiX Toolset tidak ditemukan`           | `candle.exe` tidak di PATH                | Pasang WiX, buka terminal baru                 |
| `NSIS tidak ditemukan`                  | `makensis.exe` tidak di PATH              | Pasang NSIS, buka terminal baru                |
| `Toolchain Rust aktif bukan MSVC`       | Toolchain GNU yang aktif                  | `rustup default stable-x86_64-pc-windows-msvc` |
| `argon2-win32-x64-msvc tidak ada`       | `node_modules` ter-install dari Mac       | Jalankan `npm install` di Windows              |
| `Versi tidak sinkron`                   | `package.json` dan `tauri.conf.json` beda | Samakan keduanya, lalu ulangi                  |
| `SHA-256 node.exe tidak cocok`          | Unduhan rusak atau versi tidak ada        | Ulangi; cek `-NodeVersion` benar               |
| `runtime-dist/standard-fonts tidak ada` | Bundel gagal di tengah                    | Ulangi `node scripts/build-kiosk-runtime.mjs`  |
