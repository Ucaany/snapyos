import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { randomBytes } from "crypto";

import { createServerClient } from "@/lib/supabase/server";
import { rateLimit, registerFailure, resetLimit } from "@/lib/rate-limit";
import { redactSensitive } from "@/lib/error-redaction";
import { getClientIp } from "@/lib/request-ip";
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
      /fetch failed|socket hang up|aborted|network error|other side closed|UND_ERR|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout/i.test(msg) ||
      /^5\d\d$/.test(code);
    if (!transient || attempt === SESSION_FETCH_RETRIES) break;
    // jitter [0.5×..1.5×) base × attempt → anti thundering-herd saat outage parsial.
    await new Promise((r) =>
      setTimeout(r, SESSION_FETCH_BACKOFF_MS * attempt * (0.5 + Math.random()))
    );
  }
  return { data: null, error: lastError as { message: string } };
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

        const failKey = `login:fail:${email}`;
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
        if (!user) {
          await registerFailure(failKey, 15 * 60_000);
          return null;
        }
        // User suspended (admin, docs/10 §10.2) tidak boleh login.
        if (user.status === "suspended") {
          await registerFailure(failKey, 15 * 60_000);
          return null;
        }

        // Staff login via PIN, bukan password (0043). Booth TIDAK lagi dipilih
        // pra-sesi (dulu membocorkan ID/nama booth per email anonim): PIN
        // diverifikasi terhadap assignment milik email, lalu shell staff
        // menentukan business dari membership.
        if (pin) {
          // Lockout per email: 5 gagal / 15 menit (di atas limit IP).
          const pinKey = `login:pin:${email}`;
          const pinFails = await registerFailure(pinKey, 15 * 60_000);
          if (pinFails > 5) {
            await registerFailure(failKey, 15 * 60_000);
            return null;
          }
          const ok = await verifyStaffPin(email, pin);
          if (!ok) {
            await registerFailure(failKey, 15 * 60_000);
            return null;
          }
          await resetLimit(pinKey);
          await resetLimit(failKey);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.avatar_url,
          };
        }

        if (!user.password_hash) {
          await registerFailure(failKey, 15 * 60_000);
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
          const fails = await registerFailure(failKey, 15 * 60_000);
          if (fails >= 5) return null; // lockout 15 menit (pesan dipetakan di action)
          return null;
        }
        await resetLimit(failKey);

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
          // Fail-closed: DB unreachable setelah retry → klaim dibuang (logged out).
          // Sesi yang sudah direvoke tidak boleh tetap hidup hanya karena outage DB.
          console.error("[auth] cek sesi DB gagal:", rowError.message);
          return {};
        } else if (!row || new Date(row.expires).getTime() <= Date.now()) {
          const revoked: JWT = {}; // klaim dibuang → auth() tanpa user
          return revoked;
        }
        const joined = (row as { users?: { role?: "user" | "admin"; status?: "active" | "suspended" } | { role?: "user" | "admin"; status?: "active" | "suspended" }[] | null }).users;
        const userRow = Array.isArray(joined) ? joined[0] : joined;
        // Suspend user → sesi tidak berlaku (revocation). Join users.status.
        if (userRow && userRow.status && userRow.status !== "active") {
          return {}; // klaim dibuang → logged out
        }
        const role = userRow?.role;
        return role ? { ...token, role } : token;
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
