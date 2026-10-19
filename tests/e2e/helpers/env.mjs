/**
 * Konfigurasi suite E2E kiosk. Semua spec membaca env dari sini supaya
 * nilai default dan pesan error konsisten.
 *
 * Wajib: `.env.local` berisi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (dipakai untuk mint kode aktivasi dan reset booth).
 */

import { readFileSync } from "node:fs";

export function loadEnvFile(path = ".env.local") {
  const values = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

export function config() {
  const file = loadEnvFile();
  const base = process.env.E2E_BASE ?? process.env.AUTH_URL ?? "http://localhost:3000";
  const businessSlug = process.env.E2E_BUSINESS_SLUG ?? "klik-foto-dev";
  const photoboxSlug = process.env.E2E_PHOTOBOX_SLUG ?? "booth-02";
  const supabaseUrl = process.env.SUPABASE_URL ?? file.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? file.SUPABASE_SERVICE_ROLE_KEY;
  return {
    base,
    businessSlug,
    photoboxSlug,
    supabaseUrl,
    serviceKey,
    hasServiceRole: Boolean(supabaseUrl && serviceKey),
    kioskUrl: `${base}/p/${businessSlug}/${photoboxSlug}`,
    screenshotDir: process.env.E2E_SHOTS ?? "tests/e2e/artifacts",
  };
}

/** Gagal cepat dengan pesan jelas daripada spec gagal di tengah jalan. */
export function requireServiceRole(cfg) {
  if (cfg.hasServiceRole) return;
  console.error(
    "FAIL: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib ada di .env.local (atau environment)."
  );
  process.exit(1);
}
