/**
 * Device pairing & setup — docs/05 §5.0, docs/08 §8.5/§8.14.
 * - Owner: generate kode aktivasi, list device, revoke.
 * - Public: activate (kode → device_token), verify (boot/reload), report (setup wizard).
 * device_token disimpan hash sha256 di server (docs/09 §9).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import {
  ACTIVATION_CODE_LENGTH,
  activationExpiresAt,
  generateActivationCode,
  generateDeviceToken,
  hashDeviceToken,
  verifyDevicePin,
} from "@/lib/device-token";
import type {
  DeviceActivateInput,
  DeviceExitInput,
  DeviceReportInput,
  DeviceVerifyInput,
} from "@/lib/validators";

type DeviceRow = {
  id: string;
  photobox_id: string;
  photobox_name: string | null;
  name: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
};

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "photobox:write")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengelola perangkat");
  }
}

/** Photobox harus milik business (anti cross-tenant, docs/03 §3.5). */
async function assertPhotoboxOwned(businessId: string, photoboxId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("photoboxes")
    .select("id, business_id, slug, outlet_id")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  const row = (data ?? null) as unknown as {
    id: string;
    business_id: string;
    slug: string;
    outlet_id: string;
  } | null;
  if (!row) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  return row;
}

/** Photobox yang di-join dari device (bentuk non-array hasil maybeSingle). */
type PhotoboxJoined = {
  id: string;
  business_id: string;
  slug: string;
  outlet_id: string;
  camera_settings: Record<string, unknown> | null;
  print_settings: Record<string, unknown> | null;
  session_settings: Record<string, unknown> | null;
  device_status: Record<string, unknown> | null;
  exit_pin_hash: string | null;
  exit_pin_failed_count: number | null;
  exit_pin_locked_until: string | null;
};

type DeviceJoined = {
  id: string;
  business_id: string;
  photobox_id: string;
  status: string;
  last_seen_at: string | null;
  last_heartbeat_at: string | null;
  photoboxes: PhotoboxJoined | PhotoboxJoined[] | null;
  businesses: { slug: string; status: string } | { slug: string; status: string }[] | null;
};

/** Resolve device aktif dari token (verifikasi tiap request, docs/05 §5.0). */
export async function resolveActiveDevice(token: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("devices")
    .select(
      "id, business_id, photobox_id, status, last_seen_at, last_heartbeat_at, photoboxes ( id, business_id, slug, outlet_id, camera_settings, print_settings, session_settings, device_status, exit_pin_hash, exit_pin_failed_count, exit_pin_locked_until ), businesses ( slug, status )"
    )
    .eq("device_token_hash", hashDeviceToken(token))
    .maybeSingle();

  const row = (data ?? null) as unknown as DeviceJoined | null;
  const photobox = row?.photoboxes ?? null;
  const business = row?.businesses ?? null;
  if (!row || !photobox || Array.isArray(photobox) || !business || Array.isArray(business)) {
    throw new ApiError("FORBIDDEN", "Device tidak aktif atau telah dicabut");
  }
  if (row.status !== "active") {
    throw new ApiError("FORBIDDEN", "Device tidak aktif atau telah dicabut");
  }
  // Business non-aktif (admin, docs/10 §10.5) — kiosk tidak bisa checkout/sesi
  // baru. Cek allowlist `active`, bukan blokir `suspended`, supaya status baru
  // di schema ikut tertolak alih-alih lolos diam-diam.
  if (business.status !== "active") {
    throw new ApiError("FORBIDDEN", "Bisnis sedang ditangguhkan");
  }
  // Throttle heartbeat: tulis last_seen_at + last_heartbeat_at hanya bila
  // >60 detik stale (anti write di setiap request kiosk). last_heartbeat_at
  // jadi kanonik untuk seat counting (plan camera-sdk §B).
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen > 60_000) {
    const heartbeatNow = new Date().toISOString();
    await supabase
      .from("devices")
      .update({ last_seen_at: heartbeatNow, last_heartbeat_at: heartbeatNow })
      .eq("id", row.id);
  }
  return { deviceId: row.id, businessId: row.business_id, photobox, businessSlug: business.slug };
}

// --- Owner ---

/**
 * Generate kode aktivasi sekali pakai (expire ~5 menit) untuk satu photobox.
 * Saat device aktif sudah terhubung: tolak (tidak bisa add lagi).
 * Handler ini murni baca + insert kode; pembersihan device non-aktif
 * dijalankan cron /api/cron/device-cleanup, bukan di jalur GET ini.
 */
export async function generateActivation(userId: string, businessId: string, photoboxId: string) {
  await requireOwner(userId, businessId);
  const photobox = await assertPhotoboxOwned(businessId, photoboxId);

  const supabase = createServerClient();

  const { data: active } = await supabase
    .from("devices")
    .select("id")
    .eq("photobox_id", photobox.id)
    .eq("status", "active")
    .maybeSingle();
  if (active) {
    throw new ApiError(
      "FORBIDDEN",
      "Device aktif sudah terhubung. Cabut dulu sebelum memasang perangkat baru."
    );
  }

  const code = generateActivationCode(ACTIVATION_CODE_LENGTH);
  const expiresAt = activationExpiresAt();

  const { data, error } = await supabase
    .from("activation_codes")
    .insert({
      photobox_id: photobox.id,
      business_id: businessId,
      code,
      expires_at: expiresAt,
    })
    .select("code, expires_at")
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal membuat kode aktivasi");

  return { code: data.code, expires_at: data.expires_at, photobox_slug: photobox.slug };
}

/**
 * Daftar device per business, read-only (efek samping pembersihan dipindah
 * ke cron /api/cron/device-cleanup). Filter status eksplisit: tanpa itu baris
 * non-aktif ikut terbaca sejak purge tidak lagi jalan di jalur GET.
 * Maks 3 device terakhir per photobox.
 */
export async function listDevices(userId: string, businessId: string): Promise<DeviceRow[]> {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("devices")
    .select("id, photobox_id, name, status, last_seen_at, created_at, photoboxes ( name )")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat perangkat");

  const all = (data ?? []).map((row) => {
    const pb = row.photoboxes as { name: string } | { name: string }[] | null;
    return {
      id: row.id,
      photobox_id: row.photobox_id,
      photobox_name: pb && !Array.isArray(pb) ? pb.name : null,
      name: row.name,
      status: row.status,
      last_seen_at: row.last_seen_at,
      created_at: row.created_at,
    };
  });

  const byPhotobox = new Map<string, DeviceRow[]>();
  for (const d of all) {
    const arr = byPhotobox.get(d.photobox_id) ?? [];
    arr.push(d);
    byPhotobox.set(d.photobox_id, arr);
  }
  return [...byPhotobox.values()].flatMap((arr) => arr.slice(0, 3));
}

/** Cabut device: hapus permanen dari database (riwayat dihapus permanen). */
export async function revokeDevice(userId: string, businessId: string, deviceId: string) {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("devices")
    .delete()
    .eq("id", deviceId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal mencabut device");
  if (!data) throw new ApiError("NOT_FOUND", "Device tidak ditemukan");
}

// --- Public ---

/**
 * Aktivasi device: kode sekali pakai → terbitkan device_token (docs/05 §5.0).
 * Saat aktivasi, semua device lama untuk photobox ini dihapus permanen —
 * tidak ada sesi dalam sesi (yang lama langsung batal).
 */
export async function activateDevice(input: DeviceActivateInput) {
  const supabase = createServerClient();
  const deviceToken = generateDeviceToken();
  const { data, error } = await supabase.rpc("activate_device_atomically", {
    p_code: input.code,
    p_device_token_hash: hashDeviceToken(deviceToken),
  });
  if (error) throw new ApiError("INTERNAL", "Gagal mengaktifkan device");

  const row = (data as { device_id: string; photobox_id: string; reason: string }[] | null)?.[0];
  if (!row || row.reason === "NOT_FOUND") {
    throw new ApiError("VALIDATION_ERROR", "Kode aktivasi tidak ditemukan. Periksa kembali kode.", {
      code: ["Kode aktivasi tidak ditemukan"],
    });
  }
  if (row.reason === "USED") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Kode aktivasi sudah digunakan oleh perangkat lain. Buat kode baru di dashboard owner.",
      { code: ["Kode aktivasi sudah digunakan"] }
    );
  }
  if (row.reason === "EXPIRED") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Kode aktivasi kedaluwarsa. Buat kode baru di dashboard owner.",
      { code: ["Kode aktivasi kedaluwarsa"] }
    );
  }
  if (row.reason !== "OK") throw new ApiError("INTERNAL", "Gagal mengaktifkan device");

  return {
    device_token: deviceToken,
    device_id: row.device_id,
    photobox_id: row.photobox_id,
  };
}

/** Verifikasi device saat boot/reload (docs/05 §5.0 API). */
export async function verifyDevice(input: DeviceVerifyInput) {
  const { photobox, deviceId, businessSlug } = await resolveActiveDevice(input.device_token);
  const supabase = createServerClient();

  // Sesi aktif di booth ini (jika ada) — dipakai kiosk untuk RESUME, bukan
  // memaksa customer memilih paket lagi (anti "bayar lalu terkunci").
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("id, package_id, expires_at, checkout_sessions ( result_token ), packages ( photo_count )")
    .eq("photobox_id", photobox.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = (sessionRow ?? null) as unknown as {
    id: string;
    package_id: string;
    expires_at: string;
    checkout_sessions: { result_token: string | null } | { result_token: string | null }[] | null;
    packages: { photo_count: number } | { photo_count: number }[] | null;
  } | null;
  const checkout = active?.checkout_sessions ?? null;
  const resultToken =
    checkout && !Array.isArray(checkout) ? checkout.result_token : Array.isArray(checkout) ? (checkout[0]?.result_token ?? null) : null;
  // Kuota foto paket asli (fix drift): dipakai kiosk untuk menyusun paket
  // sintetis saat resume pasca-pembayaran — memastikan capture/upload sesuai
  // yang divalidasi server (`photos.length <= package.photo_count`).
  const pkgJoin = active?.packages ?? null;
  const photoCount =
    pkgJoin && !Array.isArray(pkgJoin) ? pkgJoin.photo_count : Array.isArray(pkgJoin) ? (pkgJoin[0]?.photo_count ?? null) : null;

  // Checkout paid tapi sesi belum dibuat (kiosk keluar/reload pasca-bayar,
  // sebelum onPaid sempat jalan) → diklaim otomatis kiosk saat boot, agar
  // customer TIDAK diminta membayar ulang (anti stranded-payment).
  // Checkout paid tetap claimable setelah QR kedaluwarsa. Expiry QR membatasi
  // pembayaran, bukan hak customer yang sudah lunas untuk membuka sesi.
  let claimableCheckoutId: string | null = null;
  if (!active) {
    const { data: paid } = await supabase
      .from("checkout_sessions")
      .select("id")
      .eq("photobox_id", photobox.id)
      .eq("status", "paid")
      .is("session_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    claimableCheckoutId = ((paid as { id: string } | null) ?? null)?.id ?? null;
  }

  return {
    device_id: deviceId,
    business_slug: businessSlug,
    photobox: {
      id: photobox.id,
      slug: photobox.slug,
      camera_settings: photobox.camera_settings ?? {},
      print_settings: photobox.print_settings ?? {},
      session_settings: photobox.session_settings ?? {},
      device_status: photobox.device_status,
    },
    active_session: active
      ? {
          session_id: active.id,
          package_id: active.package_id,
          expires_at: active.expires_at,
          result_token: resultToken,
          photo_count: photoCount,
        }
      : null,
    claimable_checkout_id: claimableCheckoutId,
  };
}

/**
 * Verifikasi PIN keluar kiosk — dipakai petugas untuk keluar mode photobooth.
 * Tanpa PIN terpasang: keluar diizinkan (kompatibilitas booth lama).
 *
 * Throttle brute-force: gagal ≥ 5 kali beruntun → booth di-lock 5 menit
 * (kolom `exit_pin_locked_until` + `exit_pin_failed_count` di photoboxes).
 * Sukses → reset counter + lock. Selama masih terkunci → PIN_LOCKED (429)
 * dengan `retry_after_seconds` supaya UI kiosk bisa hitung mundur.
 */
const PIN_FAIL_THRESHOLD = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

export async function verifyDeviceExit(input: DeviceExitInput) {
  const { photobox } = await resolveActiveDevice(input.device_token);
  if (!photobox.exit_pin_hash) return { ok: true, pin_required: false };

  const supabase = createServerClient();
  const now = Date.now();

  // 1) Lock aktif → tolak tanpa memeriksa PIN (hemat CPU argon2). Re-read
  //    locked_until fresh (bukan stale join) agar lock dari request konkuren
  //    langsung terlihat.
  const { data: fresh } = await supabase
    .from("photoboxes")
    .select("exit_pin_locked_until")
    .eq("id", photobox.id)
    .maybeSingle();
  const lockedUntilMs =
    (fresh as { exit_pin_locked_until?: string | null } | null)?.exit_pin_locked_until
      ? new Date((fresh as { exit_pin_locked_until: string }).exit_pin_locked_until).getTime()
      : 0;
  if (lockedUntilMs > now) {
    throw new ApiError("PIN_LOCKED", "PIN keluar terkunci — coba lagi nanti", {
      retry_after_seconds: Math.ceil((lockedUntilMs - now) / 1000),
    });
  }

  // 2) Verifikasi argon2 (async). Untuk hash sha256 lama, verify → false
  //    otomatis; owner harus set ulang PIN via halaman settings.
  const ok = input.pin ? await verifyDevicePin(input.pin, photobox.exit_pin_hash) : false;

  if (!ok) {
    // Atomic increment via RPC — anti read-modify-write race (fix #8). RPC
    // menambah counter lalu, bila mencapai threshold, mereset counter + set
    // locked_until dalam satu operasi atomik.
    const { data: failData, error: failErr } = await supabase.rpc(
      "exit_pin_register_failure",
      { p_photobox_id: photobox.id, p_threshold: PIN_FAIL_THRESHOLD, p_lock_ms: PIN_LOCK_MS }
    );
    if (failErr) throw new ApiError("INTERNAL", "Gagal memproses PIN keluar");
    const failRow = (failData as
      | { locked: boolean; failed_count: number; locked_until: string | null }[]
      | null)?.[0];
    if (failRow?.locked) {
      throw new ApiError("PIN_LOCKED", "PIN keluar terkunci — coba lagi nanti", {
        retry_after_seconds: Math.ceil(PIN_LOCK_MS / 1000),
      });
    }
    throw new ApiError("FORBIDDEN", "PIN keluar salah");
  }

  // 3) Sukses → bersihkan counter + lock supaya sesi berikutnya bersih.
  if ((photobox.exit_pin_failed_count ?? 0) > 0 || photobox.exit_pin_locked_until) {
    await supabase
      .from("photoboxes")
      .update({ exit_pin_failed_count: 0, exit_pin_locked_until: null })
      .eq("id", photobox.id);
  }
  return { ok: true, pin_required: true };
}

/** Laporan status device dari setup wizard (docs/05 §5.0.1). */
export async function reportDevice(input: DeviceReportInput) {
  const { photobox, deviceId } = await resolveActiveDevice(input.device_token);
  const supabase = createServerClient();

  const cameraSettings = {
    ...((photobox.camera_settings as Record<string, unknown>) ?? {}),
  };
  if (input.preferred_device_id !== undefined) {
    cameraSettings.preferred_device_id = input.preferred_device_id;
  }

  const deviceStatus = {
    ...((photobox.device_status as Record<string, unknown>) ?? {}),
  };
  if (input.camera) deviceStatus.camera = { ...((deviceStatus.camera as object) ?? {}), ...input.camera };
  if (input.printer) deviceStatus.printer = { ...((deviceStatus.printer as object) ?? {}), ...input.printer };

  const { error } = await supabase
    .from("photoboxes")
    .update({ camera_settings: cameraSettings, device_status: deviceStatus })
    .eq("id", photobox.id);
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan status device");

  // Mirror ke kontrak devices.* (docs/16 §K2): camera_config/printer_config/
  // diagnostics wajib terisi — dashboard & diagnostik membaca kolom ini.
  // last_heartbeat_at ditulis resolveActiveDevice (throttle 60s di atas).
  const diagnostics: Record<string, unknown> = { last_report_at: new Date().toISOString() };
  if (input.preferred_device_id !== undefined) diagnostics.preferred_device_id = input.preferred_device_id;
  if (input.camera) diagnostics.camera = input.camera;
  if (input.printer) diagnostics.printer = input.printer;
  const deviceUpdate: Record<string, unknown> = { diagnostics };
  if (input.camera) deviceUpdate.camera_config = input.camera;
  if (input.printer) deviceUpdate.printer_config = input.printer;
  const { error: deviceError } = await supabase
    .from("devices")
    .update(deviceUpdate)
    .eq("id", deviceId);
  if (deviceError) throw new ApiError("INTERNAL", "Gagal menyimpan status device");

  return { ok: true, device_id: deviceId };
}
