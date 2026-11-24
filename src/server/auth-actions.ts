"use server";

/**
 * Server actions auth: login/logout (docs/12 Phase 1 UI).
 * Rate limit: login 5/menit/IP + lockout per email (docs/09 §10, docs/08 §8.18).
 * Pendaftaran mandiri ditutup: /register = halaman konsultasi, akun dibuat
 * admin via /admin/users; tidak ada action register di sini.
 */

import { AuthError } from "next-auth";
import { hash, verify } from "@node-rs/argon2";
import { headers } from "next/headers";
import { signIn, signOut } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { requireUser } from "@/lib/tenant";
import { str, toFormState } from "@/lib/form-state";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validators";
import { consumePasswordResetToken, createPasswordResetToken } from "@/server/auth-tokens";
import { sendPasswordResetEmail } from "@/lib/auth-emails";
import { insertAudit } from "@/server/audit";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

const EMPTY: FormState = {};

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Field yang absen dari FormData (mis. submit saat input `disabled` karena
  // `pending`) harus jadi string kosong, bukan `null`: `null` membuat Zod
  // membalas pesan mentah berbahasa Inggris ("expected string, received null")
  // yang bocor ke UI. Password TIDAK di-trim (spasi bisa bagian dari password);
  // email/PIN sudah di-trim oleh loginSchema sendiri.
  const parsed = loginSchema.safeParse({
    email: str(formData, "email"),
    password: String(formData.get("password") ?? "") || undefined,
    pin: str(formData, "pin") || undefined,
  });
  if (!parsed.success) {
    return toFormState(parsed.error);
  }

  // CAPTCHA token (Turnstile) — verifikasi HANYA di authorize() (single source
  // of truth semua jalur login); di sini cukup diteruskan mentah.
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "");

  // Rate-limit + verifikasi (password atau PIN) HANYA di authorize()
  // (src/lib/auth.ts) — single source of truth untuk semua jalur login.
  // Action ini tidak menghitung ulang agar satu request tidak double-count,
  // dan tidak me-verify argon2 dua kali. Setelah session terbentuk, /login
  // menentukan tujuan dari role session + membership. Dengan begitu role admin
  // dari DB dan allowlist email memakai resolver yang sama tanpa pre-query user.
  const isPinLogin = Boolean(parsed.data.pin);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password ?? "",
      pin: parsed.data.pin ?? "",
      captcha_token: captchaToken,
      redirectTo: "/login",
    });
  } catch (error) {
    // NEXT_REDIRECT (sukses) bukan AuthError → dilempar ulang.
    if (error instanceof AuthError) {
      return {
        error: isPinLogin ? "PIN salah." : "Email atau password salah.",
      };
    }
    throw error;
  }
  return EMPTY;
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * Logout khusus onboarding/welcome — mendarat di /login, bukan landing.
 * Tanpa ini user tanpa membership terjebak loop: /login me-redirect
 * user yang masih login balik ke /welcome.
 */
export async function logoutToLoginAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Ganti password untuk user yang sudah login (AUTH-01). Wajib verifikasi
 * password lama — tanpa itu, session yang dicuri bisa mengganti kredensial.
 * Reset via email belum tersedia (butuh token + infra email).
 */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };

  // Batasi percobaan verifikasi password lama (anti brute-force dari session
  // yang dicuri).
  const limit = await rateLimit(`password-change:${user.id}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  }

  const parsed = changePasswordSchema.safeParse({
    current_password: String(formData.get("current_password") ?? ""),
    new_password: String(formData.get("new_password") ?? ""),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const supabase = createServerClient();
  const { data } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();
  const currentHash = (data as { password_hash: string | null } | null)?.password_hash;
  if (!currentHash) {
    return { error: "Akun ini tidak memakai password (login PIN staff)." };
  }

  let valid = false;
  try {
    valid = await verify(currentHash, parsed.data.current_password);
  } catch {
    return { error: "Gagal memverifikasi password." };
  }
  if (!valid) return { error: "Password saat ini salah." };

  const newHash = await hash(parsed.data.new_password);
  const { error } = await supabase
    .from("users")
    .update({ password_hash: newHash })
    .eq("id", user.id);
  if (error) return { error: "Gagal menyimpan password baru." };

  // Password berubah = semua sesi lama tidak boleh hidup (sama seperti
  // resetPasswordAction, updateStaffRole, admin user update). Tanpa ini sesi
  // yang dicuri tetap valid setelah korban merotasi kredensialnya.
  await supabase.from("auth_sessions").delete().eq("user_id", user.id);
  await insertAudit({
    actorId: user.id,
    businessId: null,
    action: "auth.password.change",
    target: user.id,
  });

  return { success: "Password diperbarui. Silakan login ulang." };
}

/**
 * Minta tautan reset password (AUTH-01). Respons SELALU sama, baik email
 * terdaftar maupun tidak (anti-enumerasi). Token hanya dibuat untuk akun aktif
 * yang punya password; kegagalan kirim email tidak membocorkan keberadaan akun.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const generic: FormState = {
    success: "Jika email terdaftar, tautan reset password sudah dikirim. Cek kotak masuk.",
  };
  const ip = getClientIp(await headers());
  const ipLimit = await rateLimit(`forgot:ip:${ip}`, 5, 15 * 60_000);
  if (!ipLimit.ok) return generic;

  const parsed = forgotPasswordSchema.safeParse({ email: str(formData, "email") });
  if (!parsed.success) return toFormState(parsed.error);

  const emailLimit = await rateLimit(`forgot:email:${parsed.data.email}`, 3, 60 * 60_000);
  if (!emailLimit.ok) return generic;

  const supabase = createServerClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, email, name, status, password_hash")
    .eq("email", parsed.data.email)
    .maybeSingle();

  const account = user as
    | { id: string; email: string; name: string | null; status: string; password_hash: string | null }
    | null;
  if (account && account.status === "active" && account.password_hash) {
    try {
      const reset = await createPasswordResetToken(account.id, ip);
      const delivery = await sendPasswordResetEmail({
        to: account.email,
        name: account.name,
        token: reset.token,
      });
      if (!delivery.ok) {
        console.error("[auth] reset password email gagal:", delivery.error);
      }
      await insertAudit({
        actorId: account.id,
        businessId: null,
        action: "auth.password.reset.request",
        target: account.id,
        meta: { delivery: delivery.ok ? "sent" : "failed" },
      });
    } catch (error) {
      console.error("[auth] gagal membuat reset token:", error instanceof Error ? error.message : error);
    }
  }
  return generic;
}

/** Selesaikan reset password dengan token sekali pakai (AUTH-01). */
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = getClientIp(await headers());
  const limit = await rateLimit(`reset:ip:${ip}`, 10, 15 * 60_000);
  if (!limit.ok) {
    return { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  }

  const parsed = resetPasswordSchema.safeParse({
    token: str(formData, "token"),
    password: String(formData.get("password") ?? ""),
    confirm_password: String(formData.get("confirm_password") ?? ""),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const userId = await consumePasswordResetToken(parsed.data.token);
  if (!userId) {
    return { error: "Tautan reset tidak valid, sudah dipakai, atau sudah kedaluwarsa." };
  }

  const passwordHash = await hash(parsed.data.password);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", userId);
  if (error) return { error: "Gagal menyimpan password baru. Minta tautan reset baru." };

  // Password berubah = semua sesi lama tidak boleh hidup.
  await supabase.from("auth_sessions").delete().eq("user_id", userId);
  await insertAudit({
    actorId: userId,
    businessId: null,
    action: "auth.password.reset",
    target: userId,
  });
  return { success: "Password diperbarui. Silakan login dengan password baru." };
}
