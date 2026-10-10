"use server";

/**
 * Server actions auth — register/login/logout (docs/12 Phase 1 UI).
 * Rate limit: login 5/menit/IP + lockout per email (docs/09 §10, docs/08 §8.18).
 */

import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth";
import { toFormState } from "@/lib/form-state";
import { loginSchema } from "@/lib/validators";
import { isAdminEmail } from "@/server/admin";
import { listStaffLoginBooths } from "@/server/staff-pin";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const EMPTY: FormState = {};

export async function registerAction(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  // Pendaftaran mandiri DITUTUP — akun hanya dibuat admin CEO via /admin/users.
  return {
    error: "Pendaftaran mandiri ditutup. Hubungi admin platform untuk pembuatan akun.",
  };
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    pin: formData.get("pin") || undefined,
    photobox_id: formData.get("photobox_id") || undefined,
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
  // dan tidak me-verify argon2 dua kali. Redirect dihitung dari lookup role
  // ringan (tanpa hash) + allowlist email admin.
  const isPinLogin = Boolean(parsed.data.pin && parsed.data.photobox_id);
  // Redirect dihitung dari allowlist statis admin SAJA — tanpa pre-query role
  // DB (query role sebelum signIn bocor via timing: role ter-enumerasi pada
  // failure). isAdminEmail = allowlist env, bukan lookup DB → aman.
  const redirectTo = isAdminEmail(parsed.data.email) ? "/admin" : "/dashboard";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password ?? "",
      pin: parsed.data.pin ?? "",
      photobox_id: parsed.data.photobox_id ?? "",
      captcha_token: captchaToken,
      redirectTo,
    });
  } catch (error) {
    // NEXT_REDIRECT (sukses) bukan AuthError → dilempar ulang.
    if (error instanceof AuthError) {
      return {
        error: isPinLogin
          ? "PIN atau booth salah."
          : "Email atau password salah.",
      };
    }
    throw error;
  }
  return EMPTY;
}

/** Booth yang bisa dipilih staff saat login (dengan PIN ter-set). */
export async function staffLoginBoothsAction(
  email: string
): Promise<{ photobox_id: string; name: string }[]> {
  // Auth-gated: tanpa sesi login, jangan enumerate booth milik email sembarang.
  const session = await auth();
  if (!session?.user?.id) return [];
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return [];
  return listStaffLoginBooths(clean);
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
