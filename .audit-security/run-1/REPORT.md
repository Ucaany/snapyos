# Security audit — SnapyOS

| | |
|---|---|
| Run | `snapyos/run-1` |
| Source ref | `1f337a03c46cafa77307512f2dbbc9f4c4f4627c` (worktree clean) |
| Profile | `quick` (partial pass) |
| Scope | `src/app/api`, `src/lib`, `src/server`, `db/schema.sql`, `deploy/nginx-snapyos.conf`, `next.config.ts` |
| Budget | none set |
| Execution | source-and-local only; **no target code executed** (no OS-enforced sandbox available) |
| Run status | **incomplete** — `independent_verification_unavailable_and_no_sandbox` |

**This is a partial pass.** It is a `quick` profile run with one review wave, no coverage critic, and no independent verifier: delegated sub-agents were unavailable (provider quota exhausted), so reconnaissance, hunting and record review were done by a single agent. No `confirmed` finding is claimed. Every retained lead is `needs_validation` and carries no severity. The coverage ledger, not this prose, is the coverage claim.

Prior runs: none from this skill. The repository's own `.audit-out/` package is a feature-compliance audit and was used only for orientation.

## 1. Posture summary

The codebase is unusually disciplined for its size. Tenant scoping is centralised (`getMembership` before every tenant resource, cross-tenant answers 404), money is computed server-side and re-validated against the provider before settlement, device credentials are hashed and strictly schema-bound, webhook handlers verify a secret or signature *and* re-query the provider, and idempotency is enforced by database claims rather than application flags. The three retained leads are all in the seam between "validated once" and "trusted later": a storage key accepted from a client, a voucher quota checked before the thing it counts exists, and a rate-limit key taken from a header the client can choose.

## 2. Confirmed findings

None. Zero records reached `confirmed`, because no sandbox or local database was available to reproduce a decisive result and no independent verifier was available to sign off a record. This is a coverage limitation, not a statement that the system is free of vulnerabilities.

## 3. Needs validation (no severity assigned)

| Fingerprint | Lead | Boundary | Exact blocker |
|---|---|---|---|
| `branding.foreign-storage-key` | A tenant can make the platform sign another tenant's `business-assets` key | tenant A → tenant B object storage | signed fetch of a foreign key not executable locally; bucket prefix policy unknown |
| `payment.voucher-usage-limit-at-settlement` | `usage_limit` counted at checkout creation, not at settlement | owner voucher quota → money | no local Postgres; no two concurrent settlements observed |
| `ratelimit.client-ip-header-trust` | `cf-connecting-ip` trusted before any proxy-verified header | internet → per-IP rate limits | whether the edge overwrites the header is a deployment fact |

Details, source traces and validation plans: `NEEDS-VALIDATION.md`.

## 4. Rejected candidates

| Fingerprint | Claim | Why refuted |
|---|---|---|
| `device.device-status-stored-xss` | device diagnostics stored as arbitrary JSON then rendered in the owner dashboard | report schema is a fixed, length-bounded shape and React escapes text nodes; no script context |
| `payment.checkout-booth-binding` | a device can pay/apply a voucher on a sibling booth's checkout | same business, same principal, money still settles to that business's own credential; intra-tenant, not a boundary crossing |

## 5. Hardening notes (not findings)

- `createPayment`, `applyVoucherToCheckout` and `abortSession` load the checkout by `business_id` only; `finalizeSession` and `abortSession` do compare `photobox_id`. Adding the same comparison to the checkout paths would remove a class of intra-tenant state confusion.
- `camera_settings.bridge_url` and `print_settings.bridge_url` are device-writable and are used by the kiosk to send captures and print jobs. A device token holder can point its own booth at a third-party endpoint. This is the booth's own data, so it is not a boundary crossing, but pinning the bridge URL to loopback in production would remove the option.
- `listKioskPaymentMethods` offers the voucher channel for a Rp0 checkout even in `payment_mode='gateway'`; a Rp0 package with no voucher produces a dead end at `create_voucher_payment_atomically` (functional, not security).
- `staff` has `payment:confirm` while the cash-confirm API route requires `transaction:write`, so staff cannot use the route they are nominally permitted for. Functional inconsistency.
- CSP allows `'unsafe-inline'` for scripts and has no `base-uri`/`object-src` restriction. No HTML injection sink was found, so this is defence-in-depth only.
- `getClientIp` prefers `cf-connecting-ip`; the nginx sample does not strip it. Even where Cloudflare is in front, restricting origin access to Cloudflare ranges (or stripping the header at the origin) would make the trust explicit.

## 6. Positive patterns worth keeping

- Money: `final_amount` is always recomputed server-side; gateway responses are rejected when `orderId` or `amount` differ; Pakasir invoice settlement is *always* re-verified server-to-server even when a stored signature matches.
- Idempotency: `claimWebhookEvent` → `promoteWebhookEvent`, plus a CAS claim (`active` → `completed`) in `finalizeSession` that makes exactly one caller the writer of `photos`.
- Tenant scoping: `businessId` never comes from a form or body; `parseUuidParam` turns bad ids into 404 rather than 400.
- Device surface: hashed tokens, strict `deviceSettingsSchema`, nested cloud-owned field rejection (`print_settings.copies`, `print_settings.layout`), argon2id exit PIN with an atomic 5-failure lock.
- Uploads: magic-byte sniffing, JPEG structure and pixel-count checks, 50 MB aggregate cap enforced before parse where possible, SVG excluded from logo uploads, R2 key traversal guard.

## 7. Coverage

| Status | Units |
|---|---|
| covered | 13 |
| candidate | 3 |
| out_of_scope | 1 (booth-local runtime: Windows-only sidecar, physical hardware) |
| deferred | 0 |

Out of scope for this run: `runtime/**` execution and `src-tauri/**` packaging, `scripts/build-booth.ps1`, and every runtime behaviour that needs a live database, object store or Windows host. A `quick` pass over a 632-file application is not an exhaustion claim; a `standard` or `deep` run with working sub-agents and a sandbox should re-walk the payment, branding and ingress units first.
