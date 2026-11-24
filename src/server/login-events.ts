import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { sendSnapyTopicHtml } from "@/server/snapyos-telegram";

/**
 * Catat percobaan login ke `public.audit_logs` (docs/09 §10).
 *
 * Kenapa audit_logs dan bukan tabel baru: skema sudah ada, RLS-nya sudah
 * `svc_all` untuk service_role, dan tabel ini sudah jadi tempat semua aksi
 * sensitif. Tidak perlu migrasi untuk fitur notifikasi login.
 *
 * Kenapa di level aplikasi dan bukan Nginx: login memakai Server Action
 * (`loginAction` → `signIn`), bukan `POST /api/auth/callback/credentials`,
 * jadi access log Nginx tidak pernah melihat request login — hanya request
 * halaman `/login`. Satu-satunya titik yang tahu "login berhasil" adalah
 * `authorize()` di `src/lib/auth.ts`.
 *
 * Best-effort seperti `insertAudit`: kegagalan menulis log TIDAK boleh
 * menggagalkan login itu sendiri (audit bukan transaksi).
 */

export type LoginMethod = "password" | "pin";

export type LoginEventInput = {
  /** `null` untuk email yang tidak terdaftar / gagal sebelum lookup. */
  userId: string | null;
  email: string;
  role?: string | null;
  ip: string;
  ua: string | null;
  method: LoginMethod;
  ok: boolean;
  /** Alasan singkat saat gagal; diabaikan saat sukses. */
  reason?: string;
};

/** Nilai `action` yang dipakai notifier (`scripts/snapyos-login-notify.py`). */
export const LOGIN_ACTION_OK = "auth.login";
export const LOGIN_ACTION_FAILED = "auth.login.failed";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function notifyTelegramLogin(input: LoginEventInput): Promise<void> {
  const text = [
    `🔐 <b>Login ${input.ok ? "berhasil" : "gagal"}</b>`,
    `👤 Akun: <code>${escapeHtml(input.email)}</code>`,
    ...(input.role ? [`🪪 Role: ${escapeHtml(input.role)}`] : []),
    `🔑 Metode: ${input.method === "pin" ? "PIN" : "password"}`,
    `🌐 IP: <code>${escapeHtml(input.ip)}</code>`,
    ...(input.ua ? [`💻 Browser/perangkat: ${escapeHtml(input.ua.slice(0, 180))}`] : []),
    ...(!input.ok && input.reason ? [`⚠️ Alasan: ${escapeHtml(input.reason)}`] : []),
    `🕒 Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
  ].join("\n");
  // Login = informasi operasional, bukan revenue → topic information.
  await sendSnapyTopicHtml(text, "info");
}

export async function recordLoginEvent(input: LoginEventInput): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: input.userId,
      business_id: null,
      action: input.ok ? LOGIN_ACTION_OK : LOGIN_ACTION_FAILED,
      target: input.email,
      meta: {
        email: input.email,
        role: input.role ?? null,
        ip: input.ip,
        ua: input.ua,
        method: input.method,
        ...(input.ok ? {} : { reason: input.reason ?? "kredensial ditolak" }),
      },
    });
    await notifyTelegramLogin(input);
    if (error) {
      console.error("[login-events] gagal menulis audit_logs:", error.message);
    }
  } catch (err) {
    // Jangan pernah melempar: pemanggilnya jalur login.
    console.error("[login-events] error tak terduga:", err instanceof Error ? err.message : err);
  }
}
