# REMEDIATION PROGRESS

Diperbarui: 2026-11-13 (blocker closure sprint). Sumber status: `AUDIT_FINDINGS_MASTER.md`.

## Ringkasan

| Area | Total ID | FIXED | PARTIALLY | BLOCKED | NOT VERIFIED | N/A |
|---|---:|---:|---:|---:|---:|---:|
| Kiosk | 26 | 10 | 4 | 1 | 4 | 1 |
| Auth | 25 | 10 | 1 | 1 | 7 | 0 |
| Owner | 18 | 7 | 0 | 1 | 5 | 1 |
| Admin | 34 | 11 | 2 | 0 | 15 | 0 |
| Staff | 13 | 3 | 0 | 0 | 9 | 0 |

> Angka Owner/Admin/Staff memakai ID eksplisit di brief; rentang tanpa detail
> dihitung `NOT VERIFIED`.

## Blocker sprint ini

| ID | Status | Bukti |
|---|---|---|
| AUTH-03 | FIXED (email delivery NOT VERIFIED) | token 7 hari, hash, consent, accept page |
| AUTH-01 | FIXED (email delivery NOT VERIFIED) | token 1 jam, sekali pakai, cabut sesi |
| S-001 | FIXED (runtime role E2E NOT VERIFIED) | JWT `scope=staff`, filter tenant, admin guard |
| AUTH-07 | FIXED (multi-instance runtime NOT VERIFIED) | fail-closed produksi, health check |
| O-012 | FIXED | trigger + advisory lock, uji konkurensi |
| AUTH-17 | FIXED | layout 404 + manifest validation, E2E |
| DB baseline | FIXED | `schema.sql` dari nol PASS |
| `npm audit` | FIXED | 0 critical/high |

## Verifikasi gate

| Gate | Hasil |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 error, 10 warning lama) |
| `npm test` | PASS 58/58 |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS 12/12 |
| `npm audit` | 0 critical, 0 high |
| Migrasi DB (ephemeral) | PASS + rollback PASS |

## Pekerjaan yang belum bisa diverifikasi di environment ini

- E2E alur ber-login Owner/Admin/Staff/Kiosk.
- Pengiriman email undangan/reset ke inbox nyata.
- Redis multi-instance.
- Kamera/printer fisik.
- Migrasi staging/production.
