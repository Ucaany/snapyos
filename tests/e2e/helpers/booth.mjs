/**
 * Operasi booth untuk E2E: mint kode aktivasi, reset sesi aktif, baca sesi.
 * Semua lewat service role dan DI-SCOPE ke satu photobox — tidak ada operasi
 * yang menyapu tabel lintas tenant.
 */

import { createClient } from "@supabase/supabase-js";

export function createAdmin(supabaseUrl, serviceKey) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function resolvePhotobox(sb, businessSlug, photoboxSlug) {
  const { data: business, error: bizError } = await sb
    .from("businesses")
    .select("id, slug, name")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (bizError) throw bizError;
  if (!business) throw new Error(`Business ${businessSlug} tidak ditemukan`);

  const { data: photobox, error: boxError } = await sb
    .from("photoboxes")
    .select("id, slug, name, business_id, camera_settings, print_settings")
    .eq("business_id", business.id)
    .eq("slug", photoboxSlug)
    .maybeSingle();
  if (boxError) throw boxError;
  if (!photobox) throw new Error(`Photobox ${photoboxSlug} tidak ditemukan`);
  return { business, photobox };
}

/** Kode aktivasi sekali pakai, 6 karakter alfanumerik. */
export async function mintActivationCode(sb, photoboxId, businessId) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  const { error } = await sb.from("activation_codes").insert({
    photobox_id: photoboxId,
    business_id: businessId,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return code;
}

/** Tutup sesi & checkout yang menggantung agar spec tidak "Sesi lain masih berjalan". */
export async function resetBooth(sb, photoboxId) {
  const now = new Date().toISOString();
  await sb
    .from("sessions")
    .update({ status: "expired", finalized_at: now })
    .eq("photobox_id", photoboxId)
    .eq("status", "active");
  await sb
    .from("checkout_sessions")
    .update({ status: "expired" })
    .eq("photobox_id", photoboxId)
    .in("status", ["pending", "creating"]);
}

export async function readLatestSession(sb, photoboxId) {
  const { data } = await sb
    .from("sessions")
    .select("id, status, package_id, result_token, completed_at")
    .eq("photobox_id", photoboxId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Aktifkan device lewat API publik (jalur yang sama dengan kiosk asli). */
export async function activateDevice(base, code) {
  const res = await fetch(`${base}/api/v1/public/devices/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.device_token) {
    throw new Error(`Aktivasi gagal: ${res.status} ${json?.error?.message ?? ""}`);
  }
  return json.data.device_token;
}

/** Preferensi cetak booth dipaksa lewat DB agar spec tidak bergantung UI form. */
export async function setPrintSettings(sb, photoboxId, patch) {
  const { data: row, error } = await sb
    .from("photoboxes")
    .select("print_settings")
    .eq("id", photoboxId)
    .maybeSingle();
  if (error) throw error;
  const merged = { ...((row?.print_settings ?? {}) || {}), ...patch };
  const { error: updateError } = await sb
    .from("photoboxes")
    .update({ print_settings: merged })
    .eq("id", photoboxId);
  if (updateError) throw updateError;
  return merged;
}

/**
 * Tunggu config publik memakai mode cetak yang diminta. `getPublicConfig`
 * di-cache 30 detik; menulis langsung ke DB tidak meng-invalidate tag, jadi
 * spec harus menunggu TTL lewat sebelum membuka kiosk.
 */
export async function waitForPrintMode(base, businessSlug, photoboxSlug, mode, timeoutMs = 60_000) {
  const url = `${base}/api/v1/public/${businessSlug}?photobox=${encodeURIComponent(photoboxSlug)}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      const current = json?.data?.photobox?.print_settings?.mode ?? "browser";
      if (current === mode) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Config publik tidak memakai mode ${mode} dalam ${timeoutMs} ms`);
}
