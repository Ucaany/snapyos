import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  CONSULT_SETTINGS_KEY,
  CONSULT_WHATSAPP_DEFAULT,
} from "@/lib/consult";

/**
 * Nomor WhatsApp konsultasi pendaftaran — platform_settings (admin bisa ubah),
 * fallback default. Tidak pernah throw: config display-only.
 */
export async function getConsultWhatsApp(): Promise<string> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", CONSULT_SETTINGS_KEY)
      .maybeSingle();

    const value = (data as { value?: unknown } | null)?.value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  } catch {
    // Env/DB belum siap (build/test) — fallback default, tidak pernah throw.
  }
  return CONSULT_WHATSAPP_DEFAULT;
}
