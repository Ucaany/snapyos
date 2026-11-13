# DEPENDENCY MAP

Urutan dependensi yang menentukan boleh-tidaknya perubahan paralel.

```text
db/schema.sql
  └─ src/lib/supabase/server.ts
      ├─ src/lib/tenant.ts ──► src/lib/rbac.ts ──► src/lib/destination.ts
      │     └─ semua page/action (owner, staff, admin)
      ├─ src/lib/auth.ts ──► src/server/auth-actions.ts ──► /login, /welcome
      │     └─ src/server/staff-pin.ts
      ├─ src/server/feature-gate.ts ──► src/server/plan-limits.ts
      │     └─ src/server/require-subscription.ts
      ├─ src/server/devices.ts ──► src/server/kiosk-sessions.ts
      │     ├─ src/server/payment/checkout-create.ts
      │     ├─ src/server/payment/payment-create.ts
      │     └─ src/server/public-config.ts
      ├─ src/server/admin/** ──► src/app/(admin)/**
      └─ src/server/staff*.ts ──► src/app/(staff)/**
```

## Titik integrasi lintas role

| Modul | Dipakai oleh | Risiko perubahan |
|---|---|---|
| `tenant.ts` | Owner, Staff, Admin guard | Context salah → data tenant lain |
| `feature-gate.ts` | Owner UI, server action, kiosk payment | Gate UI-only → bypass API |
| `subscription-math.ts` | Plan limit, POS, storage, admin MRR | Status tanpa periode → fitur bocor |
| `devices.ts` | Kiosk verify, session, payment, hardware | Status booth tidak ditegakkan |
| `kiosk-sessions.ts` | Kiosk finalize, offline sync, retention | Sesi paid hilang / double finalize |
| `rate-limit.ts` | Semua route publik + login | NAT block / limit berlipat |
| `payment-credentials.ts` | Owner payment, kiosk checkout | Credential bocor saat fitur mati |

## Gate fase

- Phase 1 boleh paralel setelah `AUDIT_FINDINGS_MASTER.md` + ownership ada.
- Phase 2 (integrasi) menunggu perubahan `tenant.ts`, `feature-gate.ts`,
  `devices.ts`, `kiosk-sessions.ts` selesai.
- Phase 3 (E2E) menunggu build hijau.
- Phase 5 (production readiness) menunggu security review + regression.
