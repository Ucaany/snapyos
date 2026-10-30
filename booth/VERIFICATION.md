# booth/VERIFICATION.md — Catatan Verifikasi per Fase

Status: active
Aturan: catat hasil **apa adanya**. "Belum diuji" adalah hasil sah; "lulus" tanpa
bukti adalah klaim palsu. Satu bagian per fase, tambahkan baris baru setiap kali
gate dijalankan ulang (jangan hapus riwayat).

Referensi gate: `booth/plan.md` §3.

---

## Fase 0 — Kontrak tunggal + CI

**Tanggal:** 2026-10-30
**Mesin:** macOS (darwin), Node v24.19.0, npm (repo `snapyos@0.1.0`)
**Catatan:** fase 0 tidak butuh Windows. `.NET` tidak terpasang di mesin ini.

| Gate               | Perintah                                                                                                                                                                   | Hasil                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Regenerasi kontrak | `npm run booth:contracts`                                                                                                                                                  | **PASS** — menulis `src/lib/generated/device-settings.gen.ts` + `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs`         |
| Determinisme       | tes `generator deterministik (dua jalankan byte-identik)`                                                                                                                  | **PASS** — dua direktori temp, keluaran TS & C# identik                                                                         |
| Anti-basi          | tes `berkas ter-generate di repo ≡ keluaran generator (anti-basi)`                                                                                                         | **PASS** — dan dibuktikan gagal saat berkas sengaja dirusak (`fail 1`), lalu pulih                                              |
| Paritas TS↔C#      | tes `grup C# ≡ grup schema`, `versi schema C# ≡ schema JSON`, `field C# ≡ field schema (dua arah)`, `field cloud-owned C# ≡ schema`, `record C# memuat seluruh field grup` | **PASS**                                                                                                                        |
| Tes kontrak penuh  | `node --experimental-strip-types --test tests/device-settings-contract.test.ts`                                                                                            | **PASS** — 16/16                                                                                                                |
| Lint               | `npm run lint`                                                                                                                                                             | **PASS** — 0 error, 11 warning `@next/next/no-img-element` (sudah ada sebelumnya, bukan dari perubahan ini)                     |
| Typecheck          | `npm run typecheck`                                                                                                                                                        | **PASS** — tanpa keluaran galat                                                                                                 |
| Tes cloud          | `npm test`                                                                                                                                                                 | **PASS** — 1205/1205                                                                                                            |
| Build              | `npm run build`                                                                                                                                                            | **PASS** — setelah `rm -rf .next` (kegagalan pertama `ENOTEMPTY .next/node_modules`, artefak build lama)                        |
| UI booth build     | `cd booth/ui && npm run build`                                                                                                                                             | **PASS** — 33 modul, keluar ke `booth/src/SnapyOS.Booth.Shell/Assets/ui/` (gitignored)                                          |
| UI booth typecheck | `cd booth/ui && npm run typecheck`                                                                                                                                         | **PASS** — tanpa keluaran galat                                                                                                 |
| CI                 | `.github/workflows/ci.yml`                                                                                                                                                 | **ditambahkan** — langkah `booth:contracts` + `git diff --exit-code` + `npm test`; belum pernah jalan di GitHub (belum di-push) |

**Berkas kunci:** `booth/contracts/*.json`, `booth/contracts/generate.mjs` (kini menerima
`--out-dir` untuk tes), `tests/device-settings-contract.test.ts`, `.gitattributes`.

**Commit:** `0d291e6 feat(booth): kerangka aplikasi booth .NET + kontrak setelan`

**Kesimpulan:** gate fase 0 **hijau** untuk semua lapisan yang bisa diuji tanpa Windows.
Fase 1 boleh dimulai, tetapi seluruh gate fase 1 (build, test, runtime) wajib di Windows x64.

---

## Fase 1 — Shell kiosk + bridge

### Percobaan 1 — 2026-10-30, macOS + Windows tanpa .NET SDK

**Mesin A (macOS, darwin):** `dotnet` **tidak terpasang** (`command -v dotnet` kosong).
Node v24.19.0, npm 12.0.2. Tidak ada Windows App SDK/WebView2. Semua gate .NET tidak
bisa dijalankan di sini.

**Mesin B (Windows, milik operator):** `dotnet` **tidak terpasang** —
`The term 'dotnet' is not recognized`. Itu penyebab tunggal "curl gagal connect":

| Perintah                                                                     | Hasil                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Get-Process SnapyOS.Booth.Shell`                                            | kosong — aplikasi tidak pernah berjalan                  |
| `Get-NetTCPConnection -LocalPort 17777` / `netstat -ano \| findstr :17777`   | kosong — tidak ada yang listen                           |
| `Test-Path "$env:ProgramData\SNAPYOS\data\snapyos.db"`                       | `False` — `Store.Open` tidak pernah tercapai             |
| `dotnet run --project booth\src\SnapyOS.Booth.Bridge`                        | **gagal**: `dotnet` tidak dikenal                        |

Kesimpulan: **bukan bug kode**. Belum ada satu pun baris aplikasi yang dieksekusi.

### Yang dikerjakan sebagai akibatnya (1.1)

| Perubahan                                                                                     | Alasan                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/booth-windows.yml` — job `build` + job rilis pada tag `v*`                 | Build & rilis terjadi di runner Windows, jadi mesin operator tidak perlu .NET SDK                             |
| Workflow mencetak versi `dotnet`, `node`, `npm`, dan **WebView2 Runtime** (registry EdgeUpdate) | 1.1 mewajibkan versi toolchain dicatat; sekarang tercatat di log setiap run                                   |
| `SnapyOS.Booth.sln` — tambah konfigurasi solusi `Debug\|Any CPU` dan `Release\|Any CPU`        | `dotnet build ... -c Debug` (perintah verifikasi & CI) gagal `MSB4126` karena solusi hanya punya `x64`        |
| `SnapyOS.Booth.Shell.csproj` — target `GenerateAssets`                                        | `Assets/app.ico` gitignored & tidak pernah di-commit → `CS7064` di clone bersih. Ikon sekarang di-generate saat build |
| `Jalankan-Booth.cmd` dipublikasikan bersama EXE                                               | Rilis satu klik untuk operator: tanpa PowerShell manual, token dibuat sekali lalu disimpan                    |
| `.gitattributes` — `*.sln`, `booth/scripts/*.{ps1,cmd}` = CRLF                                | MSBuild & cmd.exe mengharapkan CRLF                                                                           |

### Percobaan 2 — 2026-10-30, GitHub Actions `windows-latest` — **HIJAU**

Run: `41035205471` · commit `62a089c` · branch `feat/landing-operational-value`

**Toolchain (dari log langkah "Versi toolchain"):**

| Komponen          | Versi            |
| ----------------- | ---------------- |
| .NET SDK          | `8.0.427`        |
| Node.js           | `v24.22.1`       |
| npm               | `11.19.1`        |
| WebView2 Runtime  | `155.0.4283.62`  |

**Semua langkah `success`:**

| Langkah                        | Hasil                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| Regenerasi kontrak setelan      | success                                                            |
| Kontrak tidak basi              | success (`git diff --exit-code` bersih)                            |
| Build UI React                  | success                                                            |
| Build solusi (`-c Debug`)       | success — XAML compiler + `SnapyOS.Booth.Shell.dll` terbentuk      |
| Tes xUnit                       | success — 43/43                                                    |
| Publish self-contained win-x64  | success → `dist/booth`                                             |
| Verifikasi keluaran             | EXE ada, `Assets/ui/index.html` ada, **599 berkas**                |
| Unggah artefak                  | `snapyos-booth-win-x64-62a089c` — 78 949 364 byte (~75,3 MB)       |

**SHA-256 EXE:** `ed6a84d5ea230d550655840b3162dd94925fb4be6741e5181cecabebbd30859f`

**Tiga kegagalan CI sebelum hijau (riwayat apa adanya):**

| # | Langkah merah      | Pesan galat                                                                                                   | Sebab                                                                                                                     | Perbaikan                                                                        |
| - | ------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1 | Build UI React     | `[vite:css] Failed to load PostCSS config … Cannot find module '@tailwindcss/postcss'`                        | Vite mencari `postcss.config` ke atas dan menemukan milik root repo; plugin itu hanya ada di `node_modules` root (mesin lokal) | `booth/ui/postcss.config.mjs` dengan `plugins: {}`                                |
| 2 | Build solusi       | `MSB4062: task "Microsoft.Build.Packaging.Pri.Tasks.ExpandPriContent" could not be loaded … Microsoft.Build.Packaging.Pri.Tasks.dll` | `dotnet build` memakai `MSBuildExtensionsPath` folder SDK .NET; task MSIX hanya dikirim bersama Visual Studio                 | Percobaan `AppxMSBuildToolsPath` → tetap gagal (runner tanpa workload UWP)        |
| 3 | Build solusi       | sama (MSB4062) setelah perbaikan #2                                                                            | Assembly task memang tidak ada di runner                                                                                    | `EnableCoreMrtTooling=false` (aman: tanpa `.resw`/`ms-appx`; PRI framework tetap tersalin) |

### Gate yang **belum** dijalankan (bukan lulus)

| Gate                                                                   | Status                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `curl /health` 200 · `/v1/status` 401 · dengan token 200                | **belum diuji** — butuh sesi Windows interaktif                 |
| Fullscreen, Alt+F4 tertahan, instance kedua, UI memanggil `/v1/status`  | **belum diuji**                                                 |
| `.\booth\scripts\run-local.ps1 -Token … -Mock`                          | **belum diuji**                                                 |
| Unlock PIN darurat 200 → jendela tertutup                               | **belum diuji** — butuh `exit_pin_emergency_hash` ter-seed      |
| Rilis tag `v*` → ZIP di GitHub Release                                  | **belum diuji** — langkah rilis `skipped` pada run ini          |

### Gate yang **sudah** dijalankan (macOS, .NET 8.0.427 di `~/.dotnet`)

SDK ternyata terpasang tapi tidak ada di `PATH`. Hasil nyata:

| Gate                                                                 | Hasil                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `node booth/contracts/generate.mjs` + `git diff --exit-code`          | **PASS** — dua berkas ter-generate tidak berubah                                          |
| `cd booth/ui && npm run typecheck`                                    | **PASS** — keluar 0                                                                        |
| `cd booth/ui && npm run build`                                        | **PASS** — 34 modul, `Assets/ui/index.html` + `assets/*.{js,css}`                          |
| `dotnet build src/SnapyOS.Booth.Core -c Debug`                        | **PASS** — 0 warning, 0 error                                                              |
| `dotnet build src/SnapyOS.Booth.Bridge -c Debug`                      | **PASS** — 0 warning, 0 error                                                              |
| `dotnet test tests/SnapyOS.Booth.Tests -c Debug`                      | **PASS** — 43/43 lulus setelah 2 tes diperbaiki (lihat di bawah)                           |
| Kompilasi C# Shell (harness `net8.0-windows` + stub XAML)             | **PASS** — `ShellCheck.dll` terbentuk, 0 warning, 0 error (`TreatWarningsAsErrors=true`)   |
| `MainWindow.xaml` / `App.xaml` / manifest — XML well-formed           | **PASS** — diparse `xml.etree`                                                             |
| `dotnet build SnapyOS.Booth.sln -c Debug` (macOS)                     | **GAGAL, diharapkan** — `NETSDK1100` / `XamlCompiler.exe` adalah binary Windows            |

**Dua tes yang gagal lalu diperbaiki (bukan bug produk, ekspektasi tes basi):**

| Tes                                                                  | Gejala                                              | Sebab                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `successful_sync_creates_cloud_session_finalizes_and_marks_synced`    | `Expected: 2, Actual: 3`                            | `RunOnceAsync` juga melakukan `PATCH /devices/settings` sebelum create+finalize; tes menghitung semua request. Diperbaiki: total 3, dan 2 di antaranya rute `/sessions`. |
| `server_error_schedules_retry_without_losing_session`                 | `NullReferenceException`                            | `session["cloud_id"]!.GetValue<string?>()` — indexer mengembalikan `null` untuk properti yang tidak ada, `!` tidak menolong. Diperbaiki jadi `?.`. |

**Belum tervalidasi di macOS:** XAML compiler (WinUI) dan `MrtCore` PRI — keduanya
binary Windows. Artinya kesalahan di `MainWindow.xaml` (nama properti, `x:Name`,
`Padding` pada `Grid`) baru akan terlihat di runner Windows.

### Status 1.2–1.9

| # | Isi                                            | Kode | Terbukti jalan |
| - | ---------------------------------------------- | ---- | -------------- |
| 1.2 | Single-instance (`Local\` mutex + event)      | ada  | belum          |
| 1.3 | Kiosk fullscreen, border/judul mati           | ada  | belum          |
| 1.4 | `AppWindow.Closing` + event `ExitGranted`     | ada  | belum          |
| 1.5 | Guard navigasi/jendela/DevTools WebView2      | ada  | belum          |
| 1.6 | Guard mock hanya bila `SNAPYOS_ALLOW_MOCK≠1`  | ada  | belum          |
| 1.7 | Permukaan kiosk pelanggan terpisah dari shell | ada  | belum          |
| 1.8 | Token sekali baca + peringatan token lemah    | ada  | belum          |
| 1.9 | `-SkipContracts`, cek `Assets/ui`, SHA-256    | ada  | belum          |

### Perbaikan diagnosa yang ikut masuk (fase 1)

| Gejala lama                                                          | Perbaikan                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| EXE hidup, port 17777 kosong, tanpa pesan apa pun                    | `StartBridgeAsync` menangkap kegagalan bind dan menampilkan penyebabnya                                        |
| `_ = _bridge.StartAsync()` fire-and-forget                           | diganti `await` di dalam `Task` yang galatnya dicatat                                                          |
| Galat start disuntik ke `document.body` lalu dihapus React           | overlay XAML `ErrorOverlay` di atas WebView2                                                                   |
| Tidak ada log sama sekali                                            | `BoothLog` → `%LOCALAPPDATA%\SNAPYOS\booth.log` (rotasi 2 MB, kegagalan tulis diabaikan)                       |
| UI dimuat dari `https://snapyos.app` tapi CORS hanya izinkan `:3000` | Shell menambahkan `https://snapyos.app` ke `AllowedOrigins` sebelum bridge dibuat                              |

### Debt yang diketahui (tidak dikerjakan di fase 1)

- `BoothSettingsPanel.tsx` masih menyalin daftar grup/field secara manual. Invarian
  "satu sumber aturan setelan" (`booth/contracts/*.json`) belum terpenuhi untuk UI.
  Perbaikan butuh metadata tambahan dari `generate.mjs` (label, tipe input, opsi) —
  di luar lingkup 1.7 dan berisiko regresi bila dipaksa sekarang.


---

## Fase 2 — Port runtime

Belum dijalankan. 43 tes xUnit sudah ada di `booth/tests/SnapyOS.Booth.Tests/`,
tetapi `dotnet test` belum pernah dieksekusi di mesin mana pun.

---

## Fase 3 — Kamera & printer native

Belum dijalankan. Hanya `MockCamera`/`MockPrinter` yang ada.

---

## Fase 4 — Lisensi + fingerprint

Belum dijalankan. Nol kode.

---

## Fase 5 — MSIX + auto-update + signing

Belum dijalankan. `WindowsPackageType=None`, tanpa sertifikat.

---

## Fase 6 — Hapus Tauri/Node

Belum dijalankan. `src-tauri/` dan `runtime/` masih ada.
