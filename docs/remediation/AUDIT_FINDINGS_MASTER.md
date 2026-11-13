# AUDIT FINDINGS MASTER — SNAPY OS

Sumber: Owner Audit, Admin Audit, Staff Audit, Kiosk Audit, Authentication &
Routing Audit. Angka mentah 140 temuan (Owner 34, Admin 31, Staff 26, Kiosk 24,
Auth 25) **bukan** 140 bug unik. Tabel di bawah dideduplikasi per akar masalah;
semua source ID asli tetap dicantumkan.

Status yang dipakai: `FIXED`, `PARTIALLY FIXED`, `BLOCKED`, `NOT VERIFIED`,
`NOT APPLICABLE`.

> Catatan verifikasi: beberapa temuan audit sudah tertutup oleh kode yang lebih
> baru (mis. `isSubscriptionEffective`, `addOnQuantityAllowed`, rate limit per
> device, CUPS job polling, frame-origin allowlist). Temuan seperti itu ditandai
> `FIXED (already in code)` dengan bukti file.

---

## 1. KIOSK (Agent A / H)

| Finding ID | Severity | Root Cause | Affected Files | Fix Strategy | Acceptance | Status |
|---|---|---|---|---|---|---|
| K-001 | Critical | CSP tidak punya `media-src`; `default-src 'self'` memblokir video eksternal Supabase/R2 | `next.config.ts` | Tambah `media-src 'self' https: blob: data:` | Video background eksternal dapat diputar | FIXED |
| K-002 | Critical | Timer habis sebelum capture lengkap → finalize menolak jumlah capture kurang → sesi paid stuck | `src/server/kiosk-sessions.ts`, `src/components/kiosk/KioskApp.tsx` | Saat sesi sudah expired, izinkan finalize dengan capture parsial (tidak melebihi kuota); klien tetap ke editor | Sesi paid tetap menghasilkan result walau timer habis | FIXED |
| K-003 | High | Status booth `maintenance` tidak ditegakkan backend; kiosk tidak merender state maintenance | `src/server/devices.ts`, `src/server/kiosk-sessions.ts`, `src/server/payment/*`, `src/components/kiosk/KioskApp.tsx` | Expose `photoboxes.status`; tolak sesi/checkout/payment saat maintenance; render layar maintenance | Booth maintenance tidak menerima transaksi baru | FIXED |
| K-004 | High | State offline/maintenance/empty/error belum terhubung ke alur kiosk | `KioskApp.tsx`, `KioskScreenRenderer.tsx` | Hubungkan state maintenance + offline banner; error boundary existing dipertahankan | State jelas dan tidak blank | PARTIALLY FIXED |
| K-005 | High | Rate limit IP bisa memblokir banyak booth di balik NAT | `src/lib/rate-limit.ts`, route publik | `rateLimitByDevice()` sudah dipakai di route kiosk; IP limit tetap sebagai lapis kedua | Limit per booth tersedia | FIXED (already in code) |
| K-006 | High | Status print dianggap gagal setelah job diterima CUPS → retry double print | `runtime/print/index.ts`, `CupsPrintScreen.tsx` | Submit mengembalikan `job_id`; retry lewat endpoint antrean; polling status; konfirmasi operator | Retry tidak menggandakan cetak | FIXED (already in code) |
| K-007 | High | `color-mix()` tanpa fallback untuk Chromium lama | `src/components/kiosk/Editor.tsx` | Ganti dengan `mixHex()` (sRGB) yang dihitung di JS | Header editor tetap terbaca di browser lama | FIXED |
| K-008 | High | QR memakai warna theme yang bisa kontras rendah | `src/components/kiosk/ResultScreen.tsx` | Validasi `contrastRatio`; fallback `#111`/`#fff` | QR selalu dapat dipindai | FIXED |
| K-026 | High | Resume sesi menyusun paket sintetis dengan `print_count: 0` → entitlement cetak hilang | `src/server/devices.ts`, `src/components/kiosk/KioskApp.tsx` | Kirim `print_count` di `active_session`; pakai di paket sintetis | Print entitlement konsisten setelah reload | FIXED |
| K-009 | Medium | Default bridge origin hanya localhost | `src/lib/bridge-url.ts`, env | Loopback tetap wajib untuk bridge lokal; origin produksi diatur env | Bridge produksi tidak bergantung localhost | NOT APPLICABLE (bridge lokal by design) |
| K-011 | Medium | Voucher `usage_per_customer` belum ditegakkan | `src/server/payment/checkout-shared.ts` | Kiosk tanpa identitas customer; butuh identitas/device binding | Limit per customer ditegakkan | BLOCKED (butuh identitas customer) |
| K-012 | Medium | Resolusi kamera aktual belum diverifikasi | `CameraCapture.tsx`, `runtime/camera/**` | Laporkan resolusi aktual ke `device_status`; validasi minimum | Resolusi terverifikasi | NOT VERIFIED (butuh kamera fisik) |
| K-013 | Medium | Warm boot template kena 429 → thumbnail gagal | `template-cache.ts`, route template | Retry/backoff + cache existing | Thumbnail termuat saat warm boot | PARTIALLY FIXED |
| K-014 | Low | Editor finish belum punya in-flight guard | `Editor.tsx` | Guard `finishingRef` | Tidak ada double finalize | FIXED (already in code) |
| K-015 | Low | `kiosk_locked` belum mengunci operasi | `KioskApp.tsx`, `use-kiosk-lock.ts` | Hentikan polling/aksi saat locked | Operasi terbatas saat locked | PARTIALLY FIXED |
| K-016 | Low | Download lokal tidak bisa setelah reload | `ResultScreen.tsx` | Simpan hasil di IndexedDB / ambil ulang dari server | Download tetap tersedia | NOT VERIFIED |
| K-017 | Low | Thumbnail belum punya retry | `TemplatePicker.tsx` | Retry dengan backoff | Thumbnail pulih | PARTIALLY FIXED |
| K-018..K-025 | Low/Info | Dead state, dead code, unused hook, dokumentasi kiosk | `src/components/kiosk/**` | Audit pemakaian sebelum hapus | Tidak ada dead code | NOT VERIFIED |

---

## 2. AUTHENTICATION & ROUTING (Agent B)

| Finding ID | Severity | Root Cause | Affected Files | Fix Strategy | Acceptance | Status |
|---|---|---|---|---|---|---|
| AUTH-01 | High | Belum ada password reset/change | `src/server/auth-actions.ts`, settings UI | Tambah change-password terautentikasi (verifikasi password lama); reset via email butuh token + email infra | User dapat mengganti password dengan aman | PARTIALLY FIXED (change; reset belum) |
| AUTH-02 | High | Session 30 hari tanpa idle timeout | `src/lib/auth.ts`, `src/lib/constants.ts` | Tambah idle timeout di JWT callback (`lastSeen`), throttle update | Sesi idle berakhir | FIXED |
| AUTH-07 | High | Rate limit fallback memory per-instance | `src/lib/rate-limit.ts` | Redis sliding window sudah primary; fallback in-memory didokumentasikan | Limit konsisten multi-instance | PARTIALLY FIXED (butuh Redis produksi) |
| AUTH-11 | High | `AUTH_URL` localhost berisiko di production | `.env.example`, `src/lib/auth.ts` | `trustHost: true` + Host header; `.env.example` sudah https | Redirect tidak ke localhost | FIXED (already in code) |
| AUTH-03 | Medium | Staff invitation direct membership tanpa consent/token/expiry | `src/server/staff.ts` | Undangan berbasis token + expiry | Invitation butuh consent | NOT VERIFIED (desain produk) |
| AUTH-04 | Medium | Suspend satu business mencabut session seluruh member | `src/lib/tenant.ts` | Membership difilter per business; session tidak dicabut global | Scope suspend benar | FIXED (already in code) |
| AUTH-05 | Medium | Workspace creation belum idempotent | `src/server/business.ts` | Kembalikan business existing untuk owner+nama sama; tangani 23505 | Double submit tidak membuat dua workspace | FIXED |
| AUTH-06 | Medium | Hapus staff tidak mencabut session lama | `src/server/staff.ts` | Cabut `auth_sessions` bila user tidak punya membership tersisa | Staff dihapus tidak bisa memakai session lama | FIXED |
| AUTH-08 | Medium | Local counter lama memblokir setelah Redis sehat | `src/lib/rate-limit.ts` | `max(shared, local)` sudah dipakai | Counter tidak “turun” | FIXED (already in code) |
| AUTH-09 | Medium | Suspended workspace state kurang tepat | `src/lib/tenant.ts`, UI | Membership suspended difilter; tampilkan state yang jelas | State suspended benar | PARTIALLY FIXED |
| AUTH-10 | Medium | Touch target landing/mobile nav kecil | marketing components | Naikkan ke ≥44px | Target sentuh memadai | NOT VERIFIED |
| AUTH-12..AUTH-16 | Medium | Session/config/access-control/hardening (detail di laporan asli) | — | Verifikasi ulang terhadap kode | Sesuai laporan asli | NOT VERIFIED (detail tidak tersedia di brief) |
| AUTH-17 | Low | Invalid kiosk slug mengembalikan 200 | `src/app/p/**` | `notFound()` untuk slug invalid | HTTP 404 | FIXED (already in code) |
| AUTH-18..AUTH-20 | Low | Konsistensi keamanan/testing/authorization | — | Verifikasi ulang | Sesuai laporan asli | NOT VERIFIED |
| AUTH-21 | Low | CSRF logout API belum terverifikasi | `src/server/auth-actions.ts` | Server action + SameSite cookie | CSRF terlindungi | NOT VERIFIED |
| AUTH-22..AUTH-24 | Low | Maintenance/logging/consistency | — | Verifikasi ulang | Sesuai laporan asli | NOT VERIFIED |
| AUTH-25 | Info | Session expiry belum dibersihkan periodik; belum ada daftar session aktif | `auth_sessions`, cron | Tambah cron cleanup + UI session list | Session kedaluwarsa dibersihkan | NOT VERIFIED |

---

## 3. OWNER (Agent C)

| Finding ID | Severity | Root Cause | Affected Files | Fix Strategy | Acceptance | Status |
|---|---|---|---|---|---|---|
| O-001 | High | Resolver business context beda antara layout dashboard dan page | `src/app/(dashboard)/**`, `src/lib/tenant.ts` | Semua page dashboard memakai `getActiveBusinessForRoles(["owner","manager"])` | Context konsisten | FIXED |
| O-015 | High | Feature gate `staff` hanya saat invite; halaman staff tetap bisa diakses | `src/app/(dashboard)/dashboard/staff/page.tsx` | Inline `hasFeature("staff")` + `FeatureLockedPanel` | Halaman staff terkunci tanpa entitlement | FIXED |
| O-013 | High | Reports tanpa inline gate; export JSON 403 | `src/app/(dashboard)/dashboard/reports/page.tsx` | Inline `hasFeature("reports")` | UI dan API konsisten | FIXED |
| O-002 | Medium | Label subscription tidak mempertimbangkan tanggal | `SubscriptionPanel.tsx` | Gunakan `isSubscriptionEffective` | Label benar | NOT VERIFIED |
| O-003 | Medium | Quota expired memakai default Starter | `src/server/plan-limits.ts` | Read-only fallback intentional; mutasi fail-closed | Quota aman | NOT APPLICABLE (read-only fallback) |
| O-005 | Medium | Voucher `usage_per_customer` tidak ditegakkan | `checkout-shared.ts` | Butuh identitas customer | Limit ditegakkan | BLOCKED (sama dengan K-011) |
| O-010 | Medium | Finance gate tidak inline | `dashboard/finance/page.tsx` | Inline `hasFeature("finance")` | UI terkunci rapi | FIXED |
| O-011 | Medium | Payment page tidak cek `direct_payment`; credential bisa terlihat | `dashboard/payment/page.tsx` | Inline gate sebelum memuat credential | Credential tidak dimuat saat fitur mati | FIXED |
| O-012 | Medium | Dua active credential race | `src/server/payment-credentials.ts` | Cek constraint/transaksi DB | Tidak ada dua aktif | NOT VERIFIED |
| O-018 | Medium | Profil bisnis masih bisa diedit saat expired | `src/server/business.ts` | Gate mutasi dengan `requirePlanLimits` | Edit diblokir saat expired | FIXED |
| O-004, O-006..O-009, O-014, O-016, O-017 | Low/Info | Premium button role, POS add-on, storage error, denied state, PWA, test hook, dead code | dashboard components | Perbaikan UI bertahap | Konsisten | NOT VERIFIED |

---

## 4. ADMIN (Agent D)

| Finding ID | Severity | Root Cause | Affected Files | Fix Strategy | Acceptance | Status |
|---|---|---|---|---|---|---|
| A-009 | High | Storage deletion sebelum DB deletion berisiko orphan/lost | `src/server/admin/businesses.ts` | Storage disapu dulu; gagal → abort; DB dihapus setelahnya | Tidak ada kehilangan data | FIXED (already in code) |
| A-014 | High | Subscription `active` tanpa periode valid | `src/server/admin/subscriptions.ts` | Saat set `active`, pastikan `current_period_end` di masa depan (extend 30 hari bila perlu) | Active selalu punya periode | FIXED |
| A-015 | High | Add-on unit `feature` bisa quantity > 1 | `src/server/admin/subscriptions.ts` | Validasi `addOnQuantityAllowed` saat attach/update | Entitlement dan billing konsisten | FIXED |
| A-021 | High | Global template API melewati frame-origin allowlist | `src/lib/frame-proxy.ts`, `api/v1/public/frame` | Allowlist origin + path objek | Hanya origin sah | FIXED (already in code) |
| A-024 | High | Default retention menimpa override tenant | `src/server/admin/settings.ts` | Terapkan hanya ke tenant yang masih memakai default lama | Override tenant tidak tertimpa | FIXED |
| A-010/A-016 | High | Pagination di luar batas → 500 | `src/server/admin/*` | `Math.max(1, page)` + range aman | Tidak ada 500 | FIXED (already in code) |
| A-001 | Medium | MRR/active subscriber menghitung status tanpa periode | `src/server/admin/overview.ts` | Gunakan `isSubscriptionEffective` | Angka benar | FIXED |
| A-006 | Medium | Semua error user detail dianggap 404 | `src/server/admin/users.ts` | Bedakan NOT_FOUND vs INTERNAL | Error akurat | NOT VERIFIED |
| A-017 | Medium | Tenant fee tidak cek periode efektif | `src/server/admin/overview.ts` | Gunakan `isSubscriptionEffective` | Fee benar | FIXED |
| A-022 | Medium | Upload/replace template global tanpa audit konsisten | `src/server/admin/templates.ts` | Audit create/update/upload | Audit trail lengkap | PARTIALLY FIXED |
| A-025 | Medium | Prefix audit action tidak konsisten | `src/server/admin/*` | Standarkan `admin.<entity>.<action>` | Konsisten | PARTIALLY FIXED |
| A-032 | Medium | `getBroadcastStats` tanpa guard internal | `src/server/admin/broadcast.ts` | Tambah `requireAdmin` | Guard internal | FIXED |
| A-033 | Medium | Broadcast bisa kirim email duplikat | `src/server/admin/broadcast.ts` | Idempotency per recipient | Tidak ada duplikat | NOT VERIFIED |
| A-034 | Medium | Recipient history terhapus saat dihapus dari audience | `src/server/admin/broadcast.ts` | Soft delete / history terpisah | History tetap ada | NOT VERIFIED |
| A-002..A-005, A-007, A-008, A-011..A-013, A-018..A-020, A-023, A-026..A-031 | Low/Info | Touch target, external links, ordering, pagination, settings atomic, seed JSON, broadcast recovery | admin UI/server | Perbaikan bertahap | Konsisten | NOT VERIFIED |

---

## 5. STAFF (Agent E)

| Finding ID | Severity | Root Cause | Affected Files | Fix Strategy | Acceptance | Status |
|---|---|---|---|---|---|---|
| S-001 | High | PIN login membuat full account session | `src/lib/auth.ts`, `src/server/staff-pin.ts` | PIN hanya untuk membership role `staff` (sudah); residual: user multi-role tetap dapat session penuh | Tidak ada privilege escalation | PARTIALLY FIXED |
| S-002 | High | Staff multi-business tidak bisa pindah workspace | `StaffTopbar.tsx`, `staff/layout.tsx`, `business-actions.ts` | Tambah `WorkspaceSwitcher`; izinkan staff switch | Staff dapat pindah business | FIXED |
| S-003 | Medium | Counter package/template beda dengan isi modul | `staff-overview.ts` | Samakan query/filter | Counter akurat | NOT VERIFIED |
| S-004 | Medium | Live session dibatasi 20 tanpa indikator | `staff-overview.ts`, UI | Tampilkan batas/indikator | Batas terlihat | NOT VERIFIED |
| S-005 | Medium | Padding `StaffPanel` desktop tidak konsisten | `StaffPanel.tsx` | Samakan kontrak spacing | Konsisten | NOT VERIFIED |
| S-006 | Medium | Shadow briefing panel tidak konsisten | staff components | Pakai token shadow | Konsisten | NOT VERIFIED |
| S-007 | Medium | PIN assignment > 10 tidak diperiksa | `staff.ts`, `staff-pin.ts` | Batasi assignment PIN | Batas ditegakkan | NOT VERIFIED |
| S-008 | Medium | Mutasi staff tanpa audit log | `src/server/staff.ts` | Tambah `insertAudit()` untuk invite/role/remove/PIN | Dapat ditelusuri | FIXED |
| S-009 | Medium | POS tidak ada di navigasi staff | `StaffSidebar.tsx` | Tambah entry POS sesuai entitlement | POS dapat diakses | NOT VERIFIED |
| S-010..S-013 | Low/Info | Pagination katalog, booth assignment, expired session LIVE, data finansial | staff components/server | Perbaikan bertahap | Konsisten | NOT VERIFIED |

---

## 6. Temuan baru (NEW)

| Finding ID | Severity | Root Cause | Status |
|---|---|---|---|
| NEW-001 | Medium | `getActiveBusiness` (semua role) dipakai page dashboard sementara layout memakai owner/manager → context bisa berbeda untuk user multi-role | FIXED (O-001) |
| NEW-002 | Medium | `switchWorkspaceAction` menolak role staff → staff multi-business tidak bisa pindah | FIXED (S-002) |
| NEW-003 | Low | `color-mix()` di header editor tanpa fallback | FIXED (K-007) |
