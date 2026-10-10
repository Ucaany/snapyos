# SnapyOS Glossary

Status: active
Audience: all contributors
Last updated: 2026-10-08
Last verified: 2026-10-08
Source of truth: `db/schema.sql`, `AGENTS.md`, active code

| Term | Canonical meaning |
| --- | --- |
| Business | Tenant utama milik owner. Seluruh data operasional bisnis harus memiliki `business_id`. |
| Owner | Member dengan role `owner`. Memiliki kendali bisnis dan konfigurasi payment. |
| Manager | Member dengan role `manager`. Akses operasional sesuai RBAC. |
| Staff | Member dengan role `staff`. Akses operasional terbatas dan dapat diberi akses booth. |
| Admin | User platform dengan `users.role = 'admin'` atau allowlist admin yang berlaku. |
| Outlet | Lokasi fisik bisnis. Satu outlet dapat memiliki beberapa photobox. |
| Photobox | Booth atau station foto yang terhubung ke outlet dan URL kiosk publik. |
| Kiosk | Aplikasi customer pada route `/p/[businessSlug]/[photoboxSlug]`. |
| Package | Produk yang menentukan harga, jumlah foto, dan jumlah print. Gunakan `package`, bukan `paket` di nama entity atau endpoint. |
| Template | Layout frame dengan slot foto. `slot_count` harus sama dengan `photo_count` package saat assignment. |
| Frame | Istilah customer-facing untuk template visual. Entity canonical tetap `templates`. |
| Checkout session | Reservation pembayaran sebelum sesi foto. |
| Session | Sesi foto setelah checkout berstatus paid. Memiliki `expires_at`. |
| Payment | Detail settlement dari provider atau metode pembayaran. |
| Transaction | Source of truth laporan finansial bisnis. |
| Direct merchant | Credential payment milik business. Dana provider masuk langsung ke merchant owner. |
| Voucher | Kode diskon atau pembayaran penuh untuk transaksi customer. |
| Offline cash | Metode pembayaran kiosk yang memerlukan konfirmasi operator terautentikasi. |
| Result | Hasil finalize yang diakses publik lewat `/r/[token]`. |
| Gross | Nilai transaksi sebelum fee atau penyesuaian. |
| Net | Nilai setelah fee atau penyesuaian yang tercatat backend. |
| Active subscription | Subscription yang lolos status dan pemeriksaan tanggal melalui `isSubscriptionEffective()`. |
| RLS policy `svc_all` | Policy Row Level Security (`for all to service_role using (true) with check (true)`) yang memberi akses penuh hanya ke `service_role`; `anon`/`authenticated` di-revoke. Lihat migrasi 0064. |
| `requireEffectiveSubscription` | Gate lifecycle server-side tunggal (`src/server/require-subscription.ts`); mutasi finansial memanggilnya dengan mode `"write"` sebelum menyentuh `transactions`. |
| `adminRoute` | Wrapper route `/api/v1/admin/*` yang memanggil `requireAdmin()` di lapisan route sebelum handler (guard admin tidak bergantung pada callee). |
| Webhook `received` / `processed` | Status non-authoritative (`received`) dicatat sebelum server-to-server verify, dipromosikan `processed` hanya setelah settlement sukses — idempotency state-aware (migrasi 0066). |
| Server action | Mutasi atau query server-side yang dipanggil langsung dari aplikasi Next.js. |
| REST API | Route handler HTTP yang masih sengaja diekspos untuk device, public kiosk, report, webhook, atau admin yang terdokumentasi. |
| BLOCKED | Evidence atau provider belum boleh dipromosikan ke status siap. Tidak sama dengan `NOT_AUTHORIZED`. |
| Archive | Dokumen atau flow historis. Tidak menjadi kontrak runtime. |

## Copy rules

- UI customer memakai Bahasa Indonesia yang singkat dan langsung.
- Istilah teknis dipertahankan bila menjadi nama entity, enum, route, provider, atau API field.
- Jangan mencampur `Anda` dan `kamu` dalam satu audience. Customer memakai `Anda` pada copy formal operasional.
- Harga selalu integer IDR tanpa desimal.
- Jangan memakai `withdrawal` untuk alur kiosk aktif.
