import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY.
 * Bypasses RLS, so tenant scoping MUST be enforced in code (docs/03 §3.5, §3.6).
 *
 * Singleton module-level: 350+ call-site memanggil createServerClient() per
 * request. Client Supabase stateless (persistSession:false) → satu instance
 * per proses aman, hemat alokasi/GC. Env divalidasi pada pemanggilan pertama
 * (lazy) agar import modul saat build tidak gagal bila env belum di-set.
 */
let cached: SupabaseClient | null = null;

export function createServerClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)");
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
