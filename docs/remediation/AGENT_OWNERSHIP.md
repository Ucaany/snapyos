# AGENT OWNERSHIP

Aturan: satu file satu primary owner. Agent lain mengajukan kebutuhan perubahan;
primary owner mengintegrasikan. Tidak ada edit simultan.

| File/Area | Primary Owner | Catatan |
|---|---|---|
| `src/lib/auth.ts` | B | Idle timeout, session lifecycle |
| `src/lib/rate-limit.ts` | B | Redis + fallback |
| `src/lib/tenant.ts` | B | Resolver business context |
| `src/lib/destination.ts` | B | Redirect per role |
| `src/lib/rbac.ts` | B | Permission matrix |
| `src/server/auth-actions.ts` | B | Login/logout/change password |
| `src/server/staff-pin.ts` | B | PIN staff |
| `src/server/business.ts` | B/C | B: idempotency; C: profil/subscription |
| `db/schema.sql` | B (koordinator) | Perubahan harus disepakati |
| `next.config.ts` | A | CSP |
| `src/components/kiosk/**` | A | Kecuali `CameraCapture`/`CupsPrintScreen` (H) |
| `src/server/kiosk-sessions.ts` | A | Session lifecycle |
| `src/server/devices.ts` | A/H | Status booth + device |
| `runtime/print/**`, `runtime/camera/**` | H | Hardware |
| `src/server/admin/**` | D | Admin platform |
| `src/app/(admin)/**`, `src/app/api/v1/admin/**` | D | Admin UI/API |
| `src/server/staff.ts` | B (permission) / E (behavior) | Koordinasi |
| `src/server/templates.ts`, `photoboxes.ts`, `packages.ts`, `staff-overview.ts` | E | Staff behavior |
| `src/components/staff/**` | E | Staff UI |
| `src/components/ui/card.tsx` | E | F mengajukan perubahan |
| `src/app/(dashboard)/**` | C | Owner UI |
| `src/server/payment-credentials.ts`, `reports.ts`, `branding.ts` | C | Owner |
| Global shared UI | F | Di luar milik A–E |
| Test files | G | Tidak mengubah implementasi |

## Konflik yang diselesaikan sesi ini

- `src/server/business.ts` disentuh B (idempotency) dan C (context). Perubahan
  idempotency dilakukan oleh B; C tidak mengubah file yang sama.
- `src/server/devices.ts` disentuh A (status booth, print_count) dan H (runtime
  bridge). Perubahan status/print_count dilakukan A; H hanya membaca kontrak.
- `src/components/kiosk/Editor.tsx` dan `ResultScreen.tsx` milik A; F tidak
  mengedit.
