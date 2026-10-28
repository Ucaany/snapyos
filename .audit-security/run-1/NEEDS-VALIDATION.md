# Needs validation

Three source-grounded leads. None has a severity: each is blocked on a fact that is outside repository source or could not be reproduced without a sandbox, a local database, or a deployment observation. Do not treat these as confirmed vulnerabilities.

---

## 1. `branding.foreign-storage-key` — tenant can make the platform sign another tenant's business-asset key

**Boundary:** tenant A → tenant B private object storage (`business-assets` bucket).
**Affected principal/resource:** any business's logo and kiosk videos.

**Source trace**

1. `src/server/branding-actions.ts:97` — `saveBrandingKioskAction` accepts a caller-supplied object. Its TypeScript type lists welcome/colour/kiosk fields, but server-action arguments are deserialised at runtime and TypeScript does not narrow them.
2. `src/server/branding-actions.ts:119` — `const { reset_pages: _ignored, ...payload } = input;` keeps every other property, including an injected `logo_key` or `kiosk.video_key`.
3. `src/server/branding.ts:116` — `brandingSchema.parse(input)`.
4. `src/lib/validators.ts:301` — `logo_key: z.string().trim().max(300).nullable().optional()`; `src/lib/validators.ts:286` — `kiosk.video_key` with the same shape. Neither validates a business prefix.
5. `src/server/branding.ts:179` — the merged branding, with the foreign key, is written to `business_settings.branding`.
6. `src/server/public-config.ts:158` — `getPublicConfig` (no authentication) batches `logo_key` and video keys into `signedUrlMap("business-assets", ...)` and returns signed URLs.

**Evidence**

- `src/server/branding.ts:68` — `logoSignedUrl` signs whatever key it receives.
- `src/server/public-config.ts:41` — the batch signer applies no prefix filter.
- `src/server/public-config.ts:227` — the signed logo URL is part of the public kiosk config, so any visitor to `/p/<businessSlug>/<photoboxSlug>` learns the victim's object key from the URL path.

**Why this matters:** the object key is not a secret — it is printed in a public signed URL. A member of any tenant can therefore persist a victim's key and obtain a fresh, working signed URL for that object. The bucket is private and the service role is what makes the URL, so this defeats the isolation the private bucket was meant to provide.

**Blockers**

- No local Supabase project or S3-compatible store is available here, so the signed fetch of a foreign key could not be executed and observed.
- Whether the deployed bucket (Supabase Storage or R2) restricts signed-URL issuance to a business prefix is a configuration fact that source cannot establish.

**Validation plan — local:** with a local Supabase stack, create dummy businesses A and B, upload a logo for B, read B's public config to extract the key, call `saveBrandingKioskAction` as a member of A with `logo_key` set to B's key, then fetch A's public config. A working signed URL for B's object confirms it.

**Validation plan — deployment:** ask the storage owner whether signed-URL issuance is restricted to a business prefix. If it is not, the smallest fix is to reject any `logo_key`/`video_key` that does not start with `${businessId}/` (or to stop accepting these keys from client input entirely and only set them from the upload path).

---

## 2. `payment.voucher-usage-limit-at-settlement` — voucher quota is checked before the redemptions it counts exist

**Boundary:** owner-configured voucher quota → money (discount granted beyond the limit).
**Affected principal/resource:** the business owner's campaign budget.

**Source trace**

1. `src/server/payment/checkout-create.ts:143` — the voucher is validated once, while the checkout is created and still unpaid.
2. `src/server/payment/checkout-shared.ts:177` — the limit is compared against `count(*) from voucher_usages`. That table is written only at settlement, so for an unpaid checkout the count is unchanged.
3. `src/server/payment/settlement.ts:71` — payment confirmation calls `settle_paid_payment_atomically`.
4. `db/schema.sql:1436` — that function inserts a `voucher_usages` row whenever the payment carries a `voucher_id`, with no read of `vouchers.usage_limit`.

**Evidence**

- `db/schema.sql:1477` — the *only* place `usage_limit` is enforced is `create_voucher_payment_atomically` (the Rp0 voucher path), which locks the voucher row and counts usages. The gateway and cash paths do not pass through it.
- `db/schema.sql:1016` — `vouchers.usage_limit` is a plain nullable integer; no constraint or trigger enforces it.
- `src/server/payment/checkout-create.ts:95` — `expireStaleCheckoutsForPhotobox` keeps one open checkout *per booth*, so a business with N booths can hold N open checkouts that all reference a limit-1 voucher. This needs no race: create all checkouts, then pay them one by one.

**Why this matters:** a `usage_limit = 1` voucher can be redeemed once per booth, silently overspending the campaign. The voucher payment path (Rp0) is protected; the paid path is not.

**Blockers**

- No local Postgres/Supabase instance, so the second settlement could not be executed and the second row observed.
- Whether the deployed database carries an out-of-repo trigger or policy is not visible in `db/schema.sql`.

**Validation plan — local:** seed one voucher with `usage_limit = 1` and two booths; create a checkout with the voucher on each booth; settle both through the cash path; `select count(*) from voucher_usages where voucher_id = '<id>'` returning 2 confirms it.

**Validation plan — deployment:** ask the database owner to count `voucher_usages` for any campaign voucher that was offered on more than one booth.

**Smallest fix:** move the `usage_limit` check into `settle_paid_payment_atomically`, taking `select ... for update` on the voucher row before the insert (mirroring the Rp0 path), so the check and the insert are one serialised decision.

---

## 3. `ratelimit.client-ip-header-trust` — per-IP limits trust a client-settable header

**Boundary:** internet → per-IP rate limits (login, activation codes, result tokens, session creation, webhooks).
**Affected principal/resource:** every IP-keyed control.

**Source trace**

1. `src/lib/request-ip.ts:20` — `cf-connecting-ip` is returned first, before `x-real-ip` and `x-forwarded-for`, and the later branches only run when it is absent.
2. `src/lib/auth.ts:175` — `rateLimit('login:ip:' + ip, 5, 60_000)`.
3. `src/app/api/v1/public/devices/activate/route.ts:13` — `rateLimit('activate:' + ip, 10, 60_000)`.
4. `src/lib/rate-limit.ts:142` — the derived value becomes the Redis/in-memory counter key, so a new value is a fresh bucket.

**Evidence**

- `deploy/nginx-snapyos.conf:35` — nginx sets `X-Real-IP` from `$remote_addr`.
- `deploy/nginx-snapyos.conf:36` — `X-Forwarded-For` is appended to; neither directive sets or clears `cf-connecting-ip`, so a client-supplied value reaches the app unchanged on that deployment.
- `src/lib/request-ip.ts:22` — the proxy-set headers are only consulted when the spoofable one is missing.

**Why this matters:** the login path keeps an independent per-email lockout, so password/PIN brute force stays bounded. The activation-code and result-token endpoints have no second gate: rotating the header turns a 10/min or 60/min limit into an unbounded loop. Activation codes are 6 characters over a 31-character alphabet with a 5-minute TTL, so the practical yield is small, but the control is defeated.

**Blockers**

- Whether a CDN in front of the origin overwrites `cf-connecting-ip` is a deployment fact.
- No HTTP edge runs in this environment, so the proxy chain could not be observed.

**Validation plan — local:** run the app behind the shipped nginx config on loopback and send 50 activation requests with a distinct `cf-connecting-ip` each; no 429 while the same requests with a fixed header are limited confirms the bypass.

**Validation plan — deployment:** ask the operator whether the origin is reachable only through Cloudflare. If it is reachable directly, either restrict the origin to Cloudflare ranges and strip `cf-connecting-ip` at the edge, or read the header only when a trusted proxy marker is present.
