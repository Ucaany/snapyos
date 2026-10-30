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

**Status: belum dijalankan.** Butuh Windows x64 + .NET 8 SDK + WebView2 Runtime.

Yang sudah disiapkan (belum terbukti jalan):

| Item                                | Berkas                                | Status                                               |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Build + tes + artefak di CI Windows | `.github/workflows/booth-windows.yml` | ditulis, **belum pernah jalan** (belum di-push)      |
| Jalankan dari clone                 | `booth/scripts/run-local.ps1`         | ditulis, **belum pernah dijalankan**                 |
| Build lokal                         | `booth/scripts/build-booth.ps1`       | sudah ada sejak fase 1 awal, belum pernah dieksekusi |

Cara mendapatkan bukti pertama: push branch → buka tab Actions → workflow "Booth Windows"
→ kalau gagal, salin log langkah yang merah ke sini. Itu menggantikan `dotnet build` lokal
dan tidak butuh mesin Windows pribadi.

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
