"use server";

/**
 * Server actions auth: login/logout (docs/12 Phase 1 UI).
 * Rate limit: login 5/menit/IP + lockout per email (docs/09 §10, docs/08 §8.18).
 * Pendaftaran mandiri ditutup: /register = halaman konsultasi, akun dibuat
 * admin via /admin/users; tidak ada action register di sini.
 */

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { str, toFormState } from "@/lib/form-state";
import { loginSchema } from "@/lib/validators";

export type FormState = {
  error?: string;
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
