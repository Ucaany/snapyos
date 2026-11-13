# REMEDIATION PROGRESS

Diperbarui selama sesi remediasi. Sumber status: `AUDIT_FINDINGS_MASTER.md`.

## Ringkasan

| Area | Total ID | FIXED | PARTIALLY | BLOCKED | NOT VERIFIED | N/A |
|---|---:|---:|---:|---:|---:|---:|
| Kiosk | 26 | 9 | 4 | 1 | 5 | 1 |
| Auth | 25 | 6 | 3 | 1 | 10 | 0 |
| Owner | 18 | 6 | 0 | 1 | 6 | 1 |
| Admin | 34 | 11 | 2 | 0 | 15 | 0 |
| Staff | 13 | 2 | 1 | 0 | 10 | 0 |

> Angka Owner/Admin/Staff memakai ID yang eksplisit di brief; rentang ID tanpa
> detail dihitung `NOT VERIFIED`.

## P0 / P1

| ID | Status | Bukti |
|---|---|---|
| K-001 | FIXED | `next.config.ts` `media-src` |
| K-002 | FIXED | `kiosk-sessions.ts` + `kiosk-capture.ts` + test |
| K-003 | FIXED | `devices.ts`, `checkout-shared.ts`, `kiosk-sessions.ts`, `KioskApp.tsx` |
| K-026 | FIXED | `devices.ts` `print_count` + `KioskApp.tsx` |
| O-001 | FIXED | 25 page dashboard memakai `getActiveBusinessForRoles` |
| O-010/O-011/O-013/O-015 | FIXED | inline `hasFeature` |
| O-018 | FIXED | `requirePlanLimits` di `updateBusiness`/`updateSettings` |
| A-001/A-014/A-015/A-017/A-024/A-032 | FIXED | `admin/*` |
| S-002/S-008 | FIXED | `StaffTopbar`, `business-actions.ts`, `staff.ts` |
| AUTH-02/AUTH-05/AUTH-06 | FIXED | `auth.ts`, `business.ts`, `staff.ts` |
| AUTH-01 | PARTIALLY FIXED | change-password; reset email belum |

## Verifikasi gate

| Gate | Hasil |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 error, 10 warning lama) |
| `npm test` | PASS 52/52 |
| `npm run build` | PASS |

## Pekerjaan yang belum bisa diverifikasi di environment ini

- E2E browser (tidak ada Playwright MCP).
- Kamera/printer fisik.
- Redis multi-instance.
- Email reset password (butuh token + infra email).
- Migrasi DB dan `npm audit`.
