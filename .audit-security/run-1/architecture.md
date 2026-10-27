# Architecture summary — SnapyOS (source ref 1f337a0)

## 1. Product, principals, protected resources

SnapyOS is a multi-tenant SaaS for photobooth operators. A business (tenant) owns outlets, photoboxes ("booths"), packages, templates, vouchers and staff. A booth is a Windows kiosk (Tauri shell + local Node runtime) plus a browser UI served from the same Next.js app at `/p/[businessSlug]/[photoboxSlug]`. Customers pay first (QRIS through the owner's own gateway merchant, cash at the counter, or a voucher), take photos, and receive a result link at `/r/[token]`.

Principals, from lowest to highest trust:

| Principal | Credential | By-design authority |
|---|---|---|
| Anonymous customer | none | read public kiosk config, create a checkout, poll a payment, open a result link |
| Booth / device | `device_token` (32 random bytes, stored as SHA-256) | create/finalize/abort sessions for its own photobox, read and write device-owned settings, confirm cash at its own booth, report diagnostics |
| Staff member | Auth.js session (password or 4–8 digit booth PIN) | `business:read`, booth-scoped reads, POS sell, `payment:confirm` |
| Manager | Auth.js session | most tenant writes except money-manual and subscription |
| Owner | Auth.js session | everything in the tenant, including payment credentials and subscription |
| Platform admin | Auth.js session with `role=admin` or `ADMIN_EMAILS` | all tenants, plans, promos, credential rotation |
| Payment gateway | webhook secret / provider signature | settlement events |
| Cron | `CRON_SECRET` bearer | retention, lifecycle, recovery jobs |
| Local bridge | `PHOTOBOOTH_BRIDGE_TOKEN` | camera, printer, local SQLite on the booth machine |

Protected resources: customer photos and GIFs (private buckets, signed URLs only), payment credentials (AES-256-GCM at rest), tenant financial records (`transactions`), voucher quotas, tenant branding assets, and the session/identity boundary itself.

## 2. Comparable baseline

The stack is ordinary: Auth.js credentials sessions, Supabase PostgREST with service-role access, provider webhooks (Pakasir, Midtrans, Tripay), ESC/POS and CUPS/spooler printing, and a Next.js App Router frontend. The security trade-offs accepted by comparable products (server-side pricing, provider-confirmed settlement, signed object URLs, DB-backed session revocation) are the same ones this repository attempts, so the audit calibrated against those expectations rather than against a stricter custom model.

## 3. Stack, deployment, offline limits

TypeScript/React 19, Next.js 16 App Router with `src/proxy.ts` (maintenance mode), Supabase Postgres + Storage, Cloudflare R2 for new objects, zod validation, argon2id for passwords and PINs, in-process or Upstash-backed rate limiting. Deployments visible in source: Vercel with crons (`vercel.json`), a self-hosted Ubuntu VPS with nginx + systemd (`deploy/`), and Windows booth packaging (not buildable on this host). `next.config.ts` sets a CSP without nonces, `X-Frame-Options: DENY`, and disables the Next image optimizer.

Offline limits encountered: no local Postgres/Supabase, no object store, no Docker/network, no Windows toolchain. `npm test` / `npm run build` were therefore not executed, and no target code was run at all.

## 4. Entry surfaces and important paths

- **Public kiosk API** (`src/app/api/v1/public/**`): config by slug, packages, templates, checkout, voucher, payment create/status, session create/finalize/abort, device activate/verify/exit/report/settings, result by token, frame proxy.
- **Payment webhooks** (`src/app/api/webhooks/payment/{pakasir,midtrans,tripay}`): signature/secret verification → claim → provider re-query → settlement RPC.
- **Tenant API** (`src/app/api/v1/business/[businessId]/**`) and **admin API** (`src/app/api/v1/admin/**`).
- **Server actions** (`src/server/*-actions.ts`): every mutation from the dashboard/staff/POS UI. Business id always comes from the active-business cookie, never from the client.
- **Cron** (`src/app/api/cron/**`) and **NextAuth** (`src/app/api/auth/**`).
- **Local runtime** (`runtime/**`): loopback HTTP on `127.0.0.1:17777`, bridge token, spawn-with-argv command execution.

Important flows: device token → session → finalize → storage → result token; checkout → payment → webhook → `settle_paid_payment_atomically` → transaction + result token; owner branding → `business_settings.branding` → public config → signed asset URLs.

## 5. Trust boundaries and the strongest source-visible control

| Boundary | Strongest control |
|---|---|
| anonymous → tenant data | membership lookup before every tenant read; cross-tenant returns 404 |
| customer → payment | server-side amount and credential selection; provider re-query before settlement |
| device → tenant write | hashed device token, strict settings schema, cloud-owned field rejection |
| gateway → settlement | per-credential secret or provider signature, exact amount match, idempotent claim |
| tenant A → tenant B storage | *no prefix check on client-supplied branding keys* (see NEEDS-VALIDATION) |
| internet → rate limits | IP derived from `cf-connecting-ip` first (see NEEDS-VALIDATION) |
| admin → platform | `requireAdmin` in every admin route wrapper |

## 6. Starting paths

`src/lib/auth.ts`, `src/lib/tenant.ts`, `src/lib/rbac.ts`, `src/lib/api-route.ts`, `src/lib/request-ip.ts`, `src/lib/rate-limit.ts`, `src/server/devices.ts`, `src/server/kiosk-sessions.ts`, `src/server/payment/*`, `src/server/branding.ts`, `src/server/public-config.ts`, `db/schema.sql`, `deploy/nginx-snapyos.conf`.

## 7. Prior coverage

No prior run from this skill. The in-repo `.audit-out/` package is a product-compliance audit (cloud vs booth ownership of settings) and was used only to orient, not as coverage or as a suppression list.

## 8. Companion selection

- `WEB-PROTOCOL-AND-AUTH.md` — sessions, API-key/device tokens, forwarded-header trust, webhook framing.
- `DATA-ISOLATION-AND-LIFECYCLE.md` — multi-tenant queries, signed object references, retention.
- `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` — rate limits, upload caps, export caps.
- `PROTOCOLS-RPC-AND-MESSAGING.md` — provider webhooks and idempotency.
- `CLOUD-AND-DEPLOYMENT.md` — proxy/ingress configuration.
- `DESKTOP-MOBILE-AND-LOCAL-IPC.md` — booth-local runtime (read-only review; execution out of scope).
- `MEMORY-SAFETY-AND-BINARY.md` and `AI-AND-LLM.md` excluded: no native memory-unsafe surface is executed from this repo's source path, and there is no LLM context or tool-calling surface.
