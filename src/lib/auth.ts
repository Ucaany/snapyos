import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { randomBytes } from "crypto";

import { createServerClient } from "@/lib/supabase/server";
import { failureCount, rateLimit, registerFailure, resetLimit } from "@/lib/rate-limit";
import { redactSensitive } from "@/lib/error-redaction";
import { getClientIp } from "@/lib/request-ip";
import { recordLoginEvent } from "@/server/login-events";
import { verifyTurnstile } from "@/lib/turnstile";
import { SESSION_MAX_AGE_SECONDS as SESSION_MAX_AGE } from "@/lib/constants";
import { verifyStaffPin } from "@/server/staff-pin";

declare module "next-auth/jwt" {
  interface JWT {
    /** id user (public.users) */
    uid?: string;
    /** session_token baris public.auth_sessions — kunci revocation */
    sid?: string;
    /** role user (public.users) — dibawa di token supaya session callback bebas query */
    role?: "user" | "admin";
  }
}

// SESSION_MAX_AGE = 30 hari (docs/09 §10) — dipakai jwt.maxAge + cookie.

// ponytail: ceiling = 3 attempts/150ms backoff. Naikkan ketika jaringan unstable
// di produksi (mis. region jauh dari Supabase). Fail-closed tetap setelah habis.
const SESSION_FETCH_RETRIES = 3;
const SESSION_FETCH_BACKOFF_MS = 150;

/** Lockout per email: 5 percobaan gagal / 15 menit (docs/09 §10). */
const MAX_EMAIL_FAILURES = 5;
const EMAIL_FAILURE_WINDOW_MS = 15 * 60_000;

/**
 * Query baris sesi untuk revocation check, dengan retry ringan untuk error
 * transport transient ("fetch failed", ECONNRESET, ETIMEDOT, …). Blip 1 detik
 * tidak boleh logout user valid. Revocation (baris hilang/expired) tetap
 * fail-closed: query sukses tapi row kosong → logout, tanpa retry.
 */
async function fetchSessionRow(supabase: ReturnType<typeof createServerClient>, sid: string) {
  let lastError: { message: string } | null = null;
  for (let attempt = 1; attempt <= SESSION_FETCH_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("auth_sessions")
      .select("expires, users ( role, status )")
      .eq("session_token", sid)
      .maybeSingle();
    if (!error) return { data, error: null as null };
    lastError = error;
    // Hanya retry error transient (transport undici/node, atau HTTP 5xx gateway/
    // overload). Error bisnis (4xx SQLSTATE/PGRST*) langsung break → fail-closed.
    const code = String(error.code ?? "");
    const msg = String(error.message ?? "");
    const transient =
      /^(UND_ERR|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET)/i.test(code) ||
      /fetch failed|socket hang up|aborted|network error|other side closed|UND_ERR|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout/i.test(
        msg
      ) ||
      /^5\d\d$/.test(code);
    if (!transient || attempt === SESSION_FETCH_RETRIES) break;
    // jitter [0.5×..1.5×) base × attempt → anti thundering-herd saat outage parsial.
    await new Promise((r) =>
      setTimeout(r, SESSION_FETCH_BACKOFF_MS * attempt * (0.5 + Math.random()))
    );
  }
  return { data: null, error: lastError as { message: string } };
}

/** Baris gabungan `auth_sessions` + `users` yang dibaca revocation check. */
export type SessionRow = {
  expires: string;
  users?:
    | { role?: "user" | "admin"; status?: "active" | "suspended" }
    | { role?: "user" | "admin"; status?: "active" | "suspended" }[]
    | null;
};

/**
 * Putuskan token mana yang dikembalikan pada jalur "bukan sign-in" jwt callback.
 *
 * Dipisah dari callback agar bisa diuji langsung: ini inti kontrol revocation
 * (docs/09 §10) dan satu-satunya alasan sesi bisa dimatikan dari server. Semua
 * jalur gagal mengembalikan `{}` (klaim dibuang → logged out), tidak pernah
 * membiarkan sesi hidup.
 *
 * `now` disuntik supaya tes bisa menguji kedaluwarsa tanpa menunggu waktu nyata.
 */
export function resolveTokenAfterRevocationCheck(args: {
  token: JWT;
  row: SessionRow | null;
  rowError: { message: string } | null;
  now?: number;
}): JWT {
  const { token, row, rowError } = args;
  const now = args.now ?? Date.now();

  // Error DB (setelah retry) → fail-closed. Sesi yang sudah direvoke tidak boleh
  // tetap hidup hanya karena Supabase sedang outage.
  if (rowError) return {};
  // Baris hilang atau kedaluwarsa → sesi sudah tidak berlaku.
  if (!row || new Date(row.expires).getTime() <= now) return {};

  const joined = row.users;
  const userRow = Array.isArray(joined) ? joined[0] : joined;
  // Suspend user → sesi tidak berlaku (revocation).
  if (userRow && userRow.status && userRow.status !== "active") return {};

  const role = userRow?.role;
  return role ? { ...token, role } : token;
}

/**
 * Auth.js v5 — credential email/password.
 *
 * Auth.js MELARANG credentials + strategy "database" (UnsupportedStrategy),
 * sehingga transport cookie = JWT, TAPI revocability tetap DB-backed
 * (intent PRD docs/09 §10 — session revocable) via `public.auth_sessions`
 * (RLS on tanpa policy → hanya service_role):
 * - Sign-in → insert baris sesi (sid). JWT menyimpan sid.
 * - Setiap request → baris sid diverifikasi (ada & belum kedaluwarsa);
 *   baris dihapus (logout/multi-device sign-out) → sesi mati walau cookie ada.
 * - `public.users` = source of truth identitas + role (PRD §7.1).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Pakai Host header request (bukan AUTH_URL) → redirect callback benar saat
  // diakses via Cloudflare Tunnel / proxy. Host diverifikasi oleh tunnel.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password" },
        pin: { label: "PIN" },
        captcha_token: { label: "Captcha" },
      },
      authorize: async (credentials, request) => {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        const pin = String(credentials?.pin ?? "");
        const captchaToken = String(credentials?.captcha_token ?? "");
        if (!email) return null;

        // CAPTCHA (Turnstile) — gate SEBELUM lookup/verify supaya brute-force
        // dibelokkan tanpa menyentuh DB/argon2. Fail-closed di production tanpa
        // secret; dilewati di dev (lihat src/lib/turnstile.ts).
        const ip = getClientIp((request as Request | undefined)?.headers);
        // User-agent untuk notifikasi login (diringkas di notifier).
        const ua = (request as Request | undefined)?.headers?.get("user-agent") ?? null;
        if (
          !(await verifyTurnstile(captchaToken, {
            remoteIp: ip,
            expectedAction: "login",
          }))
        ) {
          return null;
        }

        // Rate-limit single source of truth untuk SEMUA jalur login
        // (server action maupun POST mentah /api/auth/callback/credentials).
        // loginAction sengaja TIDAK menghitung ulang agar satu request
        // tidak double-count (docs/09 §10, docs/08 §8.18).
        const ipLimit = await rateLimit(`login:ip:${ip}`, 5, 60_000);
        if (!ipLimit.ok) return null;
        const emailDayLimit = await rateLimit(`login:email:${email}`, 20, 86_400_000);
        if (!emailDayLimit.ok) return null;

        // Lockout per email: 5 percobaan / 15 menit (lapis kedua di atas limit
        // IP). Gate SEBELUM lookup user dan verifikasi argon2 supaya percobaan
        // ke-6 tidak menyentuh DB/hash sama sekali, dan supaya email yang tidak
        // terdaftar ikut terhitung. Direset saat login sukses (resetLimit).
        const failKey = `login:fail:${email}`;
        if ((await failureCount(failKey)) >= MAX_EMAIL_FAILURES) return null;

        const supabase = createServerClient();
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("id, email, name, avatar_url, role, status, password_hash")
          .eq("email", email)
          .maybeSingle();

        if (userError) {
          console.error("[auth] query user gagal:", userError.code, userError.message);
          return null;
        }
        // Email tak dikenal / user suspended hanya membuang satu kuota lockout
        // (dihitung di cabang verifikasi di bawah); tidak ada counter terpisah
        // supaya percobaan gagal tidak dihitung dua kali.
        if (!user) {
          // Dicatat tanpa actor_id: email yang dicoba tetap penting untuk
          // mendeteksi brute-force / salah ketik domain.
          await recordLoginEvent({
            userId: null,
            email,
            ip,
            ua,
            method: pin ? "pin" : "password",
            ok: false,
            reason: "email tidak terdaftar",
          });
          return null;
        }
        // User suspended (admin, docs/10 §10.2) tidak boleh login.
        if (user.status === "suspended") {
          await recordLoginEvent({
            userId: user.id,
            email,
            role: user.role,
            ip,
            ua,
            method: pin ? "pin" : "password",
            ok: false,
            reason: "akun ditangguhkan",
          });
          return null;
        }

        // Staff login via PIN, bukan password (0043). Booth TIDAK lagi dipilih
        // pra-sesi (dulu membocorkan ID/nama booth per email anonim): PIN
        // diverifikasi terhadap assignment milik email, lalu shell staff
        // menentukan business dari membership.
        if (pin) {
          // Lockout PIN per email (bukan per booth, karena booth tidak dipilih
          // pra-sesi); gate sebelum verify supaya argon2 tidak dibakar.
          const pinKey = `login:pin:${email}`;
          if ((await failureCount(pinKey)) >= MAX_EMAIL_FAILURES) {
            await registerFailure(failKey, EMAIL_FAILURE_WINDOW_MS);
            return null;
          }
          const ok = await verifyStaffPin(user.id, pin);
          if (!ok) {
            await registerFailure(pinKey, EMAIL_FAILURE_WINDOW_MS);
            await registerFailure(failKey, EMAIL_FAILURE_WINDOW_MS);
            await recordLoginEvent({
              userId: user.id,
              email,
              role: user.role,
              ip,
              ua,
              method: "pin",
              ok: false,
              reason: "PIN salah",
            });
            return null;
          }
          await resetLimit(pinKey);
          await resetLimit(failKey);
          await recordLoginEvent({
            userId: user.id,
            email,
            role: user.role,
            ip,
            ua,
            method: "pin",
            ok: true,
          });
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.avatar_url,
          };
        }

        if (!user.password_hash) {
          await registerFailure(failKey, EMAIL_FAILURE_WINDOW_MS);
          return null;
        }
        let valid = false;
        try {
          valid = await verify(user.password_hash, password);
        } catch (err) {
          console.error("[auth] verify argon2 gagal:", err);
          return null;
        }
        if (!valid) {
          // Lockout ditegakkan sebagai gate di atas; di sini cukup mencatat
          // kegagalan. Pesan generik yang sama untuk semua sebab (anti-enumerasi).
          await registerFailure(failKey, EMAIL_FAILURE_WINDOW_MS);
          await recordLoginEvent({
            userId: user.id,
            email,
            role: user.role,
            ip,
            ua,
            method: "password",
            ok: false,
            reason: "password salah",
          });
          return null;
        }
        await resetLimit(failKey);

        await recordLoginEvent({
          userId: user.id,
          email,
          role: user.role,
          ip,
          ua,
          method: "password",
          ok: true,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    // Sign-in: mint baris sesi DB (sid). Request berikutnya: cek revocation.
    jwt: async ({ token, user }) => {
      const supabase = createServerClient();

      if (user) {
        const sid = randomBytes(32).toString("base64url");
        const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
        const { error: insertError } = await supabase.from("auth_sessions").insert({
          session_token: sid,
          user_id: user.id,
          expires: expires.toISOString(),
        });
        if (insertError) {
          console.error("[auth] gagal membuat sesi DB:", insertError.message);
          return {}; // gagal mint sesi = gagal login
        }
        return { ...token, uid: user.id, sid };
      }

      // Token lama yang memiliki identitas tanpa session id tidak boleh melewati
      // revocation DB. Deployment perubahan ini sengaja mewajibkan login ulang.
      if (token.uid && !token.sid) return {};

      // Revocation check: baris hilang/expired membuat klaim dibuang.
      // Join users sekaligus ambil role agar pemeriksaan tetap satu round-trip.
      if (token.sid) {
        const { data: row, error: rowError } = await fetchSessionRow(supabase, token.sid);
        if (rowError) {
          console.error("[auth] cek sesi DB gagal:", rowError.message);
        }
        return resolveTokenAfterRevocationCheck({
          token,
          row: row as SessionRow | null,
          rowError: rowError as { message: string } | null,
        });
      }
      return token;
    },
    // Enrich session dengan role dari token (source of truth tetap
    // public.users — role diambil saat revocation check di jwt callback).
    session: async ({ session, token }) => {
      if (!token.uid) return session;
      session.user.id = token.uid;
      if (token.role) {
        session.user.role = token.role;
        return session;
      }
      // Fallback: join null / token lama tanpa klaim role → query lama.
      try {
        const supabase = createServerClient();
        const { data: row } = await supabase
          .from("users")
          .select("role")
          .eq("id", token.uid)
          .maybeSingle();
        session.user.role = row?.role ?? "user";
      } catch {
        session.user.role = "user";
      }
      return session;
    },
  },
  events: {
    // Logout tetap menghapus cookie Auth.js, tetapi kegagalan revocation DB wajib
    // terlihat agar token yang tersalin tidak diam-diam hidup sampai kedaluwarsa.
    signOut: async (message) => {
      const token = (message as { token?: JWT }).token;
      if (!token?.sid) return;
      try {
        const supabase = createServerClient();
        const { error } = await supabase
          .from("auth_sessions")
          .delete()
          .eq("session_token", token.sid);
        if (error) {
          console.error("[auth] gagal mencabut sesi DB:", redactSensitive(error));
        }
      } catch (error) {
        console.error("[auth] gagal mencabut sesi DB:", redactSensitive(error));
      }
    },
  },
});
