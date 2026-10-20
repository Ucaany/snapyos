# POS Add-on — Phase 6: Subdomain `pos.domain.com` (OPSIONAL)

> Status: **OPSI — hanya dikerjakan atas keputusan eksplisit user. Default = SKIP.**
> Prasyarat: Phase 5 selesai. Risiko tertinggi dari semua phase (menyentuh auth global).

---

## Daftar Isi

1. Kapan Fase Ini Perlu
2. Desain
3. File & Perubahan
4. Security
5. Testing
6. Rollback
7. Acceptance Criteria

---

## 1. Kapan Fase Ini Perlu

Hanya untuk branding (kasir melihat `pos.bisnis.com` saat membuka terminal). **Tidak dibutuhkan** untuk keamanan, isolasi, ataupun fungsi — path-based `/pos/*` (Phase 3) sudah lengkap. Jika alasan = "biar keren" → jangan (YAGNI).

Konsekuensi wajib dipahami sebelum setujui:

1. Cookie Auth.js harus set `domain = .root-domain` → session terbaca lintas semua subdomain. Logout di satu subdomain tetap global (revocation DB) — bukan issue keamanan, tapi perilaku berubah.
2. Butuh `middleware.ts` PERTAMA kalinya di repo — surface baru untuk host-header spoofing bila salah validasi.
3. Wildcard DNS + Vercel domain config (di luar repo, ops platform).

---

## 2. Desain

```
Browser: https://pos.rootdomain.com/terminal
  → middleware (matcher /_next kecuali static):
      host = x-forwarded-host (Vercel) — dibandingkan STRICT equal "pos." + ROOT_DOMAIN env
      match → rewrite → /pos/terminal   (hanya path prefix /pos yang di-rewrite; lainnya 404 host-mismatch? → NO: rewrite hanya bila path startsWith /pos, selain itu redirect ke rootdomain)
      host lain → no-op (next())
  → layout guard /pos existing (tanpa perubahan)
```

Keputusan: subdomain = **alias murni**. Tidak ada perubahan routing/link app; semua link internal tetap path-based relative (aman di kedua host).

---

## 3. File & Perubahan

| File                                                        | Perubahan                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware.ts` (BARU — repo saat ini tanpa middleware) | Host strict-match `pos.${ROOT_DOMAIN}` + rewrite `/pos/*`; selain itu pass                                                                    |
| `src/lib/auth.ts`                                           | `cookies: { sessionToken: { domain: process.env.ROOT_DOMAIN ? "." + process.env.ROOT_DOMAIN : undefined } }` — hanya aktif jika env terpasang |
| `.env.example`                                              | Tambah `ROOT_DOMAIN=` (kosong = perilaku lama host-only)                                                                                      |
| `vercel.json` / Vercel dashboard                            | Wildcard domain `*.rootdomain.com` (ops, di luar repo)                                                                                        |

---

## 4. Security

- Host validation: `host === "pos." + ROOT_DOMAIN` (strict equality, **bukan** `startsWith("pos.")` — cegah `pos.evil.com` / `pos-evil` bypass). Env wajib non-kosong saat fitur aktif; mismatch → next() (tidak rewrite).
- Middleware TIDAK melakukan auth/keputusan data — hanya rewrite; keamanan tetap di layout guard + `requirePosAccess` (tidak berubah).
- Cookie domain: verification JWT tetap server-side; `auth_sessions` revocation tetap; device-token kiosk tidak pakai cookie (tidak terdampak).
- Rate-limit login per-IP tidak berubah (IP sama lintas host).

---

## 5. Testing

- Preview Vercel dengan domain wildcard: login di root → buka `pos.*` → session terbaca; logout root → `pos.*` logout.
- Regression: login/logout/register dashboard + kiosk device flow tetap hijau.
- Host spoof manual: set header `x-forwarded-host: pos.evil.com` (lokal) → tidak di-rewrite.
- Full suite `npm run test && typecheck && lint && build`.

---

## 6. Rollback

Hapus `src/middleware.ts`, kosongkan/hapus `ROOT_DOMAIN` env, redeploy. Cookie lama (dengan domain) akan expired natural — logout paksa tidak diperlukan (revocation tetap valid).

---

## 7. Acceptance Criteria

1. `pos.<root>` menampilkan terminal POS dengan sesi login shared; semua fungsi Phase 3–5 bekerja identik di subdomain.
2. Login/logout lintas host konsisten; kiosk + dashboard + admin tanpa regresi.
3. Host-header spoof tidak di-rewrite.
4. Tanpa `ROOT_DOMAIN` env: perilaku identik pra-fase ini (zero diff behavior).

**STATUS: OPSIONAL — default SKIP. Jika user menolak: tandai fase ini SKIPPED di file ini dan lanjut Phase 7.**
