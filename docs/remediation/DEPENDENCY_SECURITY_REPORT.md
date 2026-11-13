# DEPENDENCY SECURITY REPORT

Tanggal: 2026-11-13. Perintah: `npm audit --json`.

## Ringkasan

| Severity | Jumlah |
|---|---:|
| Critical | **0** |
| High | **0** |
| Moderate | 12 |
| Low | 2 |
| Total | 14 |

Tidak ada advisory critical/high. Tidak ada upgrade major buta.

## Moderate / low dan keputusan

| Paket | Severity | Jalur | Dampak nyata | Keputusan |
|---|---|---|---|---|
| `exceljs` → `uuid <11.1.1` | Moderate | Runtime (export laporan) | `uuid` v3/v5/v6 hanya bermasalah bila caller memberi `buf`; exceljs tidak memakai pola itu | **Diterima + mitigasi tertulis**. Upgrade `uuid` menunggu rilis exceljs yang kompatibel; tidak ada input pengguna ke `buf`. |
| `minimatch 7–11` | Moderate | Dev (typescript-eslint, ts-morph) | ReDoS saat pattern glob besar; hanya tooling build/lint | Diterima; tidak masuk bundle runtime. |
| `@typescript-eslint/*`, `typescript-eslint` | Moderate | Dev | Transitive dari minimatch | Diterima; dev-only. |
| `@ts-morph/common`, `ts-morph` | Moderate | Dev (shadcn CLI) | Tooling generator, tidak dipakai runtime | Diterima; dev-only. |
| `shadcn` → `deepmerge`, `@shadcn/registry` | Moderate/Low | Dev | Prototype poisoning pada merge objek; hanya CLI lokal | Diterima; dev-only. |
| `deepmerge` | Low | Dev (shadcn) | Sama di atas | Diterima; dev-only. |

## Tindakan yang TIDAK dilakukan

- Tidak ada `npm audit fix --force`.
- Tidak ada upgrade major Next/React/Auth.js.
- Tidak ada perubahan lockfile di luar checkpoint sesi.

## Kesimpulan

Gate dependency: **PASS untuk critical/high**. Residual moderate/low terdokumentasi
dengan mitigasi. Jalankan ulang `npm audit` di CI setiap rilis.
