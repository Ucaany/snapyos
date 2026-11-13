"use server";

/**
 * Server actions auth: login/logout (docs/12 Phase 1 UI).
 * Rate limit: login 5/menit/IP + lockout per email (docs/09 §10, docs/08 §8.18).
 * Pendaftaran mandiri ditutup: /register = halaman konsultasi, akun dibuat
 * admin via /admin/users; tidak ada action register di sini.
 */

import { AuthError } from "next-auth";
import { hash, verify } from "@node-rs/argon2";
import { signIn, signOut } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/tenant";
import { str, toFormState } from "@/lib/form-state";
import { changePasswordSchema, loginSchema } from "@/lib/validators";

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

  return { success: "Password diperbarui." };
}
