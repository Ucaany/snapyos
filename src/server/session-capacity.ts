import "server-only";

/**
 * Kapasitas seat — SATU implementasi dipakai di semua titik
 * (createCheckout, createPayment, createSession) agar aturan tidak drift.
 * - Business: seat = jumlah device online (heartbeat), vs max_concurrent_sessions
 *   (+ add-on) — plan camera-sdk §B. Booth offline TIDAK menghabiskan seat.
 * - Photobox: 1 sesi aktif per booth (docs/05 §5.1b throughput) — TIDAK diganggu.
 * Ditegakkan SEBELUM pembayaran (anti bayar-lalu-gagal-sesi).
 */

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { OFFLINE_FINALIZE_GRACE_MS } from "@/lib/session-timer";
import { getPlanLimits } from "@/server/plan-limits";
import { countOnlineDevices } from "@/server/device-online";

export async function assertSessionCapacity(businessId: string, photoboxId: string) {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Self-heal booth: expire sesi aktif yang lewat expires_at + grace (kiosk
  // crash/abandon). Tanpa ini, partial unique index 1 sesi aktif/photobox
  // (db/0004) mengunci booth sampai cron retention harian — booth tidak bisa
  // dipakai berjam-jam padahal tidak ada sesi sungguhan berjalan ("sesi lain
  // masih berjalan" padahal hanya 1/zombie). Cron retention lakukan hal sama
  // tapi hanya harian; di sini dijalankan tiap attempt sesi/checkout agar booth
  // cepat bebas. Threshold = grace finalize offline → lindungi in-flight
  // finalize kiosk yang baru saja kehilangan koneksi (foto belum disinkronkan).
  const staleBefore = new Date(Date.now() - OFFLINE_FINALIZE_GRACE_MS).toISOString();
  await supabase
    .from("sessions")
    .update({ status: "expired", finalized_at: now })
    .eq("photobox_id", photoboxId)
    .eq("status", "active")
    .lt("expires_at", staleBefore);

  const [onlineDevices, boothCount, limits] = await Promise.all([
    countOnlineDevices(businessId),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("photobox_id", photoboxId)
      .eq("status", "active"),
    getPlanLimits(businessId),
  ]);

  // Seat = device online. Device yang sudah online memegang seatnya sendiri,
  // jadi gate menolak hanya bila jumlah device MELEBIHI kuota (>, bukan >=).
  // `1 device online vs limit 1` = valid → lolos (plan camera-sdk §B validation).
  if (onlineDevices > limits.max_concurrent_sessions) {
    throw new ApiError(
      "SESSION_LIMIT_REACHED",
      `Plan Anda dibatasi ${limits.max_concurrent_sessions} perangkat online. Matikan perangkat yang tidak dipakai.`
    );
  }
  if ((boothCount.count ?? 0) >= 1) {
    throw new ApiError(
      "SESSION_LIMIT_REACHED",
      "Sesi lain masih berjalan di booth ini. Tunggu selesai sebelum membayar."
    );
  }
}
