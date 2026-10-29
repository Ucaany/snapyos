/**
 * Kiosk session lifecycle — docs/05 §5.1b (timer + auto-finalize), docs/08 §8.14.
 * v2 pay-first: sesi hanya bisa dimulai setelah checkout paid. Saat DEV_SKIP_PAYMENT
 * aktif, package_id dipakai untuk membuat checkout paid sintetik (docs/12 Phase 4).
 * Mode offline (docs/05): package_id diterima bila checkout.offline_enabled —
 * transaksi offline tercatat paid utk reporting, non-withdrawable by design.
 */

import "server-only";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { assertSessionCapacity } from "@/server/session-capacity";
import { resolveActiveDevice } from "@/server/devices";
import { getOfflineEnabled } from "@/server/business";
import { generateResultToken } from "@/lib/device-token";
import { computeExpiresAt, OFFLINE_FINALIZE_GRACE_MS } from "@/lib/session-timer";
import { MAX_SLOTS, slotCount } from "@/lib/template-layout";
import { validatePhotoFile } from "@/lib/upload-validation";
import { todayISO, formatTxNumber } from "@/lib/dashboard-math";
import { generateSlideshowGif } from "@/server/gif";
import {
  sessionCreateSchema,
  sessionFinalizeSchema,
  sessionAbortSchema,
  type SessionCreateInput,
  type SessionFinalizeInput,
  type SessionAbortInput,
} from "@/lib/validators";
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants";
import {
  assertStorageAvailable,
  accountStorageAdd,
  accountStorageSub,
} from "@/server/storage-usage";
import { getStorage, signedUrlMap, removeResolvedOutcome } from "@/server/storage";

const GENERATED_BUCKET = "generated-photos" as const;
const DEFAULT_RETENTION_DAYS = 3;

/** Jalankan task dengan konkurensi terbatas, urutan hasil dijaga. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

type PhotoFile = {
  name?: string | null;
  type?: string | null;
  size?: number | null;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type SessionRow = {
  id: string;
  business_id: string;
  outlet_id: string;
  photobox_id: string;
  package_id: string;
  status: string;
  retake_count: number;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  finalized_at: string | null;
  result_gif_key: string | null;
  created_at: string;
};

type CheckoutJoined = {
  result_token: string;
  session_id: string | null;
  business_id: string;
  sessions: SessionRow | SessionRow[] | null;
};

let devSkipPaymentWarned = false;

function devSkipPayment(): boolean {
  // Hard guard: tidak pernah aktif di production, apa pun isi env-nya.
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_SKIP_PAYMENT !== "true") return false;
  if (!devSkipPaymentWarned) {
    devSkipPaymentWarned = true;
    console.error(
      "[SECURITY] DEV_SKIP_PAYMENT aktif: pembayaran QRIS dilewati (hanya non-production)"
    );
  }
  return true;
}

/**
 * Batch signed URL foto + GIF (satu resolusi + satu presign per provider).
 * Fase 3: foto/GIF sesi baru di R2, sesi lama di Supabase — batch menghindari
 * N probe `head()` per foto pada hot path result.
 */
async function signedUrls(keys: string[]): Promise<Map<string, string>> {
  return signedUrlMap(GENERATED_BUCKET, keys, SIGNED_URL_TTL);
}

/**
 * Nama file unduhan untuk key hasil sesi — basename key (photo-00.jpg,
 * result.gif) supaya file pelanggan tidak saling menimpa dan terbaca jelas.
 */
function downloadName(key: string): string {
  const base = key.slice(key.lastIndexOf("/") + 1);
  return `snapyos-${base}`;
}

/**
 * Batch signed URL unduhan (Content-Disposition attachment, nama per-key).
 * Tombol unduh halaman result memakai URL ini: atribut `download` pada `<a>`
 * cross-origin diabaikan browser (docs/05 §5.13).
 */
async function downloadUrls(keys: string[]): Promise<Map<string, string>> {
  return signedUrlMap(GENERATED_BUCKET, keys, SIGNED_URL_TTL, downloadName);
}

async function loadSession(businessId: string, sessionId: string): Promise<SessionRow> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("business_id", businessId)
    .maybeSingle();
  const row = (data ?? null) as unknown as SessionRow | null;
  if (!row) throw new ApiError("NOT_FOUND", "Sesi tidak ditemukan");
  return row;
}

/** Mulai sesi (syarat checkout paid / dev bypass / mode offline) — docs/08 §8.14. */
export async function createSession(
  businessSlug: string,
  input: SessionCreateInput,
  idempotencyKey?: string | null
) {
  const parsed = sessionCreateSchema.parse(input);
  const device = await resolveActiveDevice(parsed.device_token);
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }

  const supabase = createServerClient();
  const photobox = device.photobox;
  const businessId = device.businessId;

  // Resolve package + checkout (pay-first, dev bypass, atau mode offline docs/05).
  let packageId: string;
  let checkoutId: string;
  let packagePrice = 0;
  let offlineMode = false;
  let resultToken = "";

  if (parsed.checkout_session_id) {
    const { data: checkout } = await supabase
      .from("checkout_sessions")
      .select(
        "id, package_id, photobox_id, status, result_token, session_id, sessions ( expires_at, status )"
      )
      .eq("id", parsed.checkout_session_id)
      .eq("business_id", businessId)
      .maybeSingle();
    const checkoutRow = (checkout ?? null) as unknown as {
      id: string;
      package_id: string;
      photobox_id: string;
      status: string;
      result_token: string | null;
      session_id: string | null;
      sessions:
        { expires_at: string; status: string } | { expires_at: string; status: string }[] | null;
    } | null;
    if (!checkoutRow) throw new ApiError("PAYMENT_NOT_FOUND", "Checkout tidak ditemukan");
    if (checkoutRow.status !== "paid") {
      throw new ApiError("PAYMENT_EXPIRED", "Pembayaran belum lunas");
    }
    if (checkoutRow.photobox_id !== photobox.id) {
      throw new ApiError("FORBIDDEN", "Checkout tidak cocok dengan booth ini");
    }
    if (checkoutRow.session_id) {
      const joined = Array.isArray(checkoutRow.sessions)
        ? checkoutRow.sessions[0]
        : checkoutRow.sessions;
      if (joined?.status === "active" && Date.now() < new Date(joined.expires_at).getTime()) {
        return {
          session_id: checkoutRow.session_id,
          expires_at: joined.expires_at,
          checkout_session_id: checkoutRow.id,
          result_token: checkoutRow.result_token,
        };
      }
      throw new ApiError("SESSION_EXPIRED", "Sesi pembayaran ini sudah berakhir");
    }
    packageId = checkoutRow.package_id;
    checkoutId = checkoutRow.id;
    resultToken = checkoutRow.result_token ?? "";
  } else if (parsed.package_id) {
    const devBypass = devSkipPayment();
    // Mode offline (docs/05): sesi tanpa QRIS bila owner mengaktifkannya.
    offlineMode = !devBypass && (await getOfflineEnabled(businessId));
    if (!devBypass && !offlineMode) {
      throw new ApiError("VALIDATION_ERROR", "Pembayaran wajib sebelum sesi foto (pay-first)");
    }
    const { data: pkg } = await supabase
      .from("packages")
      .select("id, price")
      .eq("id", parsed.package_id)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .maybeSingle();
    const pkgRow = (pkg ?? null) as unknown as { id: string; price: number } | null;
    if (!pkgRow) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");
    packageId = pkgRow.id;
    packagePrice = pkgRow.price;
    checkoutId = "";
  } else {
    throw new ApiError("VALIDATION_ERROR", "checkout_session_id atau package_id wajib diisi");
  }

  const now = new Date();

  // Waktu jual menurut booth. Sync worker runtime lokal mengirim
  // `client_created_at` supaya laporan harian owner mencatat transaksi pada
  // waktu pelanggan difoto, bukan waktu reconnect. Jalur checkout berbayar
  // tidak memakainya — di sana `paid_at` yang menentukan.
  const soldAt =
    !parsed.checkout_session_id && parsed.client_created_at
      ? new Date(parsed.client_created_at)
      : now;

  // Dedupe sync offline, SEBELUM cek kapasitas: booth mengulang `POST sessions`
  // bila respons hilang setelah commit (jaringan putus di tengah jawaban).
  // Tanpa ini satu sesi lokal menjadi dua sesi cloud + dua transaksi offline,
  // dan percobaan ulangnya sendiri ditolak SESSION_LIMIT_REACHED karena sesi
  // pertamanya masih aktif. Kuncinya = waktu jual, yang dikirim worker dari
  // `sessions.client_created_at` booth.
  // Identitas asli satu sesi lokal = `photobox_slug:local_session_id` yang
  // dikirim worker sebagai Idempotency-Key. Memakai started_at (turunan
  // client_created_at) membuat dua sesi berbeda dengan waktu sama dianggap
  // replay → satu penjualan hilang. Fallback lama dipertahankan untuk klien
  // yang belum mengirim header.
  const idemKey =
    typeof idempotencyKey === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey.trim())
      ? idempotencyKey.trim()
      : null;

  if (!parsed.checkout_session_id && (idemKey || parsed.client_created_at)) {
    let replayQuery = supabase
      .from("sessions")
      .select("id, expires_at, checkout_sessions ( id, result_token )")
      .eq("business_id", businessId)
      .eq("photobox_id", photobox.id);
    replayQuery = idemKey
      ? replayQuery.eq("idempotency_key", idemKey)
      : replayQuery.eq("started_at", soldAt.toISOString());
    const { data: replay } = await replayQuery
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const replayRow = (replay ?? null) as unknown as {
      id: string;
      expires_at: string | null;
      checkout_sessions:
        | { id: string; result_token: string | null }
        | { id: string; result_token: string | null }[]
        | null;
    } | null;
    if (replayRow) {
      const checkout = Array.isArray(replayRow.checkout_sessions)
        ? replayRow.checkout_sessions[0]
        : replayRow.checkout_sessions;
      return {
        session_id: replayRow.id,
        expires_at: replayRow.expires_at,
        checkout_session_id: checkout?.id ?? "",
        result_token: checkout?.result_token ?? null,
        replay: true,
      };
    }
  }

  // Limit sesi konkuren (docs/02 §2.3) — helper bersama dengan pre-payment check
  // (createCheckout/createPayment) agar aturan tidak drift.
  await assertSessionCapacity(businessId, photobox.id);

  const timerSeconds = (photobox.session_settings as { timer_seconds?: number } | null)
    ?.timer_seconds;

  // Timer sesi dimulai dari payment paid_at (docs/05 §5.1b baris 120:
  // "Timer mulai saat webhook PAID — waktu menunggu QRIS tidak dihitung").
  // Jika customer membayar lalu menunggu, sisa waktu berkurang.
  // Clamp minimum 30 detik agar auto-finalize tetap berjalan (customer
  // sudah bayar = tetap mendapat produk — docs/05 §5.1b baris 124).
  const MINIMUM_GRACE_MS = 30_000;
  let expiresAt: string;
  if (parsed.checkout_session_id) {
    const { data: payRow } = await supabase
      .from("payments")
      .select("paid_at")
      .eq("checkout_session_id", parsed.checkout_session_id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const paidAtMs = payRow?.paid_at ? new Date(payRow.paid_at as string).getTime() : NaN;
    if (!Number.isNaN(paidAtMs)) {
      const idealExpiry = new Date(computeExpiresAt(timerSeconds ?? 0, paidAtMs)).getTime();
      const clampedExpiry = Math.max(idealExpiry, now.getTime() + MINIMUM_GRACE_MS);
      expiresAt = new Date(clampedExpiry).toISOString();
    } else {
      // Fallback: paid_at missing (should not happen) → start from now.
      expiresAt = computeExpiresAt(timerSeconds ?? 0);
    }
  } else {
    // Dev bypass / mode offline: timer from now (no payment step).
    expiresAt = computeExpiresAt(timerSeconds ?? 0);
  }

  // Dev bypass / mode offline: buat checkout paid sintetik (result_token di-issue,
  // docs/05 §5.13). Jalur QRIS asli tidak pernah lewat sini.
  if (!parsed.checkout_session_id) {
    resultToken = generateResultToken();
    const { data: checkout, error: checkoutError } = await supabase
      .from("checkout_sessions")
      .insert({
        business_id: businessId,
        photobox_id: photobox.id,
        package_id: packageId,
        gross_amount: 0,
        discount_amount: 0,
        final_amount: 0,
        status: "paid",
        result_token: resultToken,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    const checkoutRow = (checkout ?? null) as unknown as { id: string } | null;
    if (checkoutError || !checkoutRow) throw new ApiError("INTERNAL", "Gagal membuat checkout");
    checkoutId = checkoutRow.id;
  }

  const sessionPayload = {
    business_id: businessId,
    outlet_id: photobox.outlet_id,
    photobox_id: photobox.id,
    package_id: packageId,
    status: "active",
    idempotency_key: idemKey,
    started_at: soldAt.toISOString(),
    expires_at: expiresAt,
    // Waktu jual dari booth (sync offline). `expires_at` tetap dari `now`:
    // sesi yang baru tiba lewat sync harus masih bisa difinalisasi.
    ...(parsed.client_created_at ? { created_at: soldAt.toISOString() } : {}),
  };
  let { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert(sessionPayload)
    .select("id, expires_at, status")
    .single();
  // Migrasi 0083 belum diterapkan → kolom belum ada. Jangan gagalkan sesi
  // offline hanya karena kolom opsional ini; ulangi tanpa kolom tersebut.
  if (sessionError && /idempotency_key/i.test(sessionError.message ?? "")) {
    const { idempotency_key: _ignored, ...legacy } = sessionPayload;
    ({ data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert(legacy)
      .select("id, expires_at, status")
      .single());
  }
  // Race antar booth (TOCTOU pre-check): partial unique index 1 sesi aktif per
  // photobox (db/0004) menegakkan limit secara atomik di sini.
  if (sessionError && (sessionError as { code?: string }).code === "23505") {
    throw new ApiError(
      "SESSION_LIMIT_REACHED",
      "Sesi lain masih berjalan di booth ini. Tunggu selesai sebelum memulai sesi baru."
    );
  }
  const sessionRow = (session ?? null) as unknown as {
    id: string;
    expires_at: string;
    status: string;
  } | null;
  if (sessionError || !sessionRow) throw new ApiError("INTERNAL", "Gagal membuat sesi");

  // Link checkout ↔ session (result_token lookup saat finalize). Gagal di sini
  // berarti customer sudah bayar tapi QR hasil tidak akan pernah ketemu —
  // jangan ditelan: rollback sesi supaya booth bisa mengulang.
  const { error: linkError } = await supabase
    .from("checkout_sessions")
    .update({ session_id: sessionRow.id })
    .eq("id", checkoutId);
  if (linkError) {
    await supabase.from("sessions").delete().eq("id", sessionRow.id);
    throw new ApiError("INTERNAL", "Gagal menautkan checkout ke sesi");
  }

  // Mode offline (docs/05): catat transaksi utk reporting — status paid,
  // payment_method 'offline'. BY DESIGN non-withdrawable (bukan pembayaran gateway).
  if (offlineMode) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("timezone")
      .eq("id", businessId)
      .maybeSingle();
    const tz = (biz as { timezone?: string } | null)?.timezone ?? "Asia/Jakarta";
    // Tanggal + waktu transaksi mengikuti waktu jual booth: laporan harian
    // memakai `created_at`, jadi penjualan semalam tidak boleh menumpuk di
    // hari reconnect.
    const { error: txError } = await supabase.from("transactions").insert({
      business_id: businessId,
      outlet_id: photobox.outlet_id,
      photobox_id: photobox.id,
      package_id: packageId,
      session_id: sessionRow.id,
      payment_method: "offline",
      withdrawable: false,
      gross_amount: packagePrice,
      discount_amount: 0,
      final_amount: packagePrice,
      status: "paid",
      number: formatTxNumber(todayISO(tz, soldAt), randomUUID().replace(/-/g, "").slice(0, 6)),
      paid_at: soldAt.toISOString(),
      ...(parsed.client_created_at ? { created_at: soldAt.toISOString() } : {}),
    });
    if (txError) throw new ApiError("INTERNAL", "Gagal mencatat transaksi offline");
  }

  return {
    session_id: sessionRow.id,
    expires_at: sessionRow.expires_at,
    checkout_session_id: checkoutId,
    result_token: resultToken || null,
  };
}

/** Finalize: upload foto + GIF, tandai completed (docs/05 §5.13, §5.15.1). */
/**
 * Abort sesi aktif oleh kiosk itu sendiri (customer reset / batal di tengah
 * flow tanpa foto). Device token = auth: hanya booth pemilik sesi yang boleh.
 * Tanpa jalur ini sesi zombie mengunci booth sampai grace offline habis
 * (assertSessionCapacity) — "Sesi lain masih berjalan" padahal kiosk kosong.
 */
/**
 * Sesi yang sedang difinalisasi di proses ini. Abort tidak boleh membatalkan
 * sesi yang uploadnya sedang berjalan: dulu abort bisa menang balapan, media
 * dihapus, dan sesi yang sudah dibayar hancur. Satu proses Node melayani
 * seluruh tenant di deployment ini, jadi set in-process cukup.
 */
const finalizingSessions = new Set<string>();

export async function abortSession(
  businessSlug: string,
  sessionId: string,
  input: SessionAbortInput
) {
  const parsed = sessionAbortSchema.parse(input);
  const device = await resolveActiveDevice(parsed.device_token);
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }
  const supabase = createServerClient();
  const session = await loadSession(device.businessId, sessionId);
  if (session.photobox_id !== device.photobox.id) {
    throw new ApiError("FORBIDDEN", "Device tidak cocok dengan sesi ini");
  }
  if (finalizingSessions.has(session.id)) {
    throw new ApiError(
      "PAYMENT_ALREADY_PROCESSED",
      "Sesi sedang difinalisasi. Tunggu sampai selesai."
    );
  }
  const { data: aborted } = await supabase
    .from("sessions")
    .update({ status: "expired", finalized_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  // Hanya jalur yang benar-benar membatalkan sesi yang boleh membersihkan objek.
  // Sesi yang sudah 'completed' (finalize menang balapan) tidak boleh disentuh:
  // hasilnya sudah ditampilkan customer.
  if (aborted) await discardSessionMedia(device.businessId, session);
  return { ok: true as const };
}

/**
 * Buang semua objek hasil sesi yang ditinggalkan jalur abort (foto parsial dari
 * finalize yang gagal, atau GIF yatim) — storage + ledger. Key deterministik
 * `photo-00..photo-NN` (N = batas maksimum frame/paket) + `result.gif`; key
 * absen = no-op, jadi aman dipanggil walau tak ada objek. Best-effort:
 * kegagalan hanya di-log.
 */
async function discardSessionMedia(businessId: string, session: SessionRow): Promise<void> {
  const supabase = createServerClient();
  const { data: pkgRow } = await supabase
    .from("packages")
    .select("photo_count")
    .eq("id", session.package_id)
    .eq("business_id", businessId)
    .maybeSingle();
  // A frame can require more captures than the package photo quota. Sessions
  // do not persist template_id, so clean the safe maximum for both contracts.
  const slots = Math.max(
    MAX_SLOTS,
    Math.max(0, (pkgRow as { photo_count: number } | null)?.photo_count ?? 0)
  );
  const uploadKey = `${businessId}/sessions/${session.id}`;
  const keys = [
    ...Array.from(
      { length: slots },
      (_, i) => `${uploadKey}/photo-${String(i).padStart(2, "0")}.jpg`
    ),
    `${uploadKey}/result.gif`,
  ];
  await discardUploadedObjects(businessId, keys);
}

/**
 * @param gifPhotos Capture mentah TANPA frame untuk GIF slideshow. Kosong
 *   (klien lama) → fallback ke `photos` seperti perilaku sebelumnya.
 */
export async function finalizeSession(
  businessSlug: string,
  sessionId: string,
  input: SessionFinalizeInput,
  photos: PhotoFile[],
  gifPhotos: PhotoFile[] = []
) {
  const parsed = sessionFinalizeSchema.parse(input);
  const device = await resolveActiveDevice(parsed.device_token);
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }

  const supabase = createServerClient();
  const session = await loadSession(device.businessId, sessionId);

  if (session.photobox_id !== device.photobox.id) {
    throw new ApiError("FORBIDDEN", "Device tidak cocok dengan sesi ini");
  }
  if (session.status === "completed") {
    return await buildResult(device.businessId, session);
  }
  if (session.status !== "active") {
    throw new ApiError("SESSION_EXPIRED", "Sesi sudah berakhir");
  }
  if (session.expires_at) {
    const expiredAt = new Date(session.expires_at).getTime();
    if (Date.now() >= expiredAt) {
      // Grace offline: foto ter-capture sebelum expiry tetap diproses bila
      // kiosk finalisasi terlambat karena sinkronisasi koneksi (docs/05 §5.1b).
      const withinGrace = Date.now() < expiredAt + OFFLINE_FINALIZE_GRACE_MS;
      if (!withinGrace || photos.length === 0) {
        await supabase
          .from("sessions")
          .update({ status: "expired", finalized_at: new Date().toISOString() })
          .eq("id", session.id)
          .eq("status", "active");
        throw new ApiError("SESSION_EXPIRED", "Waktu sesi sudah habis");
      }
    }
  }

  if (photos.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Belum ada foto untuk difinalisasi");
  }

  // Enforce capture count sesuai kontrak frame. Untuk template legacy, jumlah
  // Template legacy tetap mengikuti package.photo_count; frame ber-slot
  // mengganti ekspektasi capture setelah template tervalidasi.
  const { data: pkgRow } = await supabase
    .from("packages")
    .select("photo_count")
    .eq("id", session.package_id)
    .eq("business_id", device.businessId)
    .maybeSingle();
  const packagePhotoCount = (pkgRow as { photo_count: number } | null)?.photo_count;
  let expectedCaptureCount = packagePhotoCount;
  let templateSlotCount = 0;
  if (parsed.template_id) {
    const { data: template } = await supabase
      .from("templates")
      .select("id, layout, business_id, is_active")
      .eq("id", parsed.template_id)
      .eq("is_active", true)
      .or(`business_id.eq.${device.businessId},business_id.is.null`)
      .maybeSingle();
    if (!template) throw new ApiError("VALIDATION_ERROR", "Frame tidak tersedia");
    templateSlotCount = slotCount(template.layout);
    if (templateSlotCount > 0) expectedCaptureCount = templateSlotCount;
  }
  // Template ber-slot dikirim sebagai satu composite final, tetapi `gifPhotos`
  // tetap membawa seluruh capture mentah. Validasi jumlah slot harus memakai
  // capture mentah agar frame 6-slot tidak ditolak karena final hanya 1 file.
  // Klien lama tanpa `gif_photos` tidak bisa diperiksa jumlahnya (composite
  // tunggal memang sah), jadi pemeriksaan dilewati — bukan fallback ke `photos`
  // yang akan selalu gagal untuk frame ber-slot.
  const captureCount = gifPhotos.length > 0 ? gifPhotos.length : photos.length;
  if (
    templateSlotCount > 0 &&
    gifPhotos.length > 0 &&
    typeof expectedCaptureCount === "number" &&
    captureCount !== expectedCaptureCount
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Jumlah capture harus ${expectedCaptureCount} sesuai frame/paket, bukan ${captureCount}`
    );
  }
  if (templateSlotCount > 0 && photos.length !== 1) {
    throw new ApiError("VALIDATION_ERROR", "Frame ber-slot harus menghasilkan satu composite");
  }
  if (
    templateSlotCount === 0 &&
    typeof packagePhotoCount === "number" &&
    photos.length > packagePhotoCount
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Jumlah foto (${photos.length}) melebihi kuota paket (${packagePhotoCount})`
    );
  }

  const { data: sessionPhotobox } = await supabase
    .from("photoboxes")
    .select("session_settings")
    .eq("id", session.photobox_id)
    .eq("business_id", device.businessId)
    .maybeSingle();
  const maxRetakes = (sessionPhotobox?.session_settings as { max_retakes?: number | null } | null)
    ?.max_retakes;
  if (
    typeof maxRetakes === "number" &&
    (parsed.retake_count ?? session.retake_count) > maxRetakes
  ) {
    throw new ApiError("VALIDATION_ERROR", "Batas retake sesi terlampaui");
  }

  // Storage gate (0053): kuota penuh → blokir simpan hasil (riwayat foto).
  // Hanya foto final yang disimpan; capture mentah GIF tidak pernah di-upload,
  // jadi tidak boleh ikut dihitung (bisa menolak sesi yang sebenarnya muat).
  const photoBytes = photos.reduce((sum, f) => sum + (f.size ?? 0), 0);
  await assertStorageAvailable(device.businessId, photoBytes);

  const uploadKey = `${device.businessId}/sessions/${sessionId}`;
  // Semua key yang mungkin pernah dibuat percobaan finalize mana pun untuk sesi
  // ini: `photo-00..photo-NN` (N = batas frame/paket) + GIF. Dipakai untuk resync
  // akuntansi — idempotent per key, key absen = no-op — sehingga retry yang
  // mengirim foto LEBIH SEDIKIT dari percobaan sebelumnya tetap membebaskan
  // ledger key sisa (tanpa ini counter storage membengkak permanen).
  const maxSlots = Math.max(
    typeof expectedCaptureCount === "number" ? expectedCaptureCount : 0,
    photos.length
  );
  const photoKeys = Array.from(
    { length: maxSlots },
    (_, i) => `${uploadKey}/photo-${String(i).padStart(2, "0")}.jpg`
  );
  const gifKey = `${uploadKey}/result.gif`;
  await accountStorageSub(device.businessId, [...photoKeys, gifKey]);

  // Baca + validasi semua buffer sekali. Validasi SEBELUM upload apa pun agar
  // body invalid tidak meninggalkan objek parsial.
  const bodies: Buffer[] = [];
  for (const file of photos) {
    const body = Buffer.from(await file.arrayBuffer());
    const check = validatePhotoFile(file, body);
    if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error);
    bodies.push(body);
  }

  // GIF dibuat dari capture mentah (potret, tanpa frame) — bukan dari hasil
  // komposit. Hanya di-upload sebagai `result.gif`; tidak menjadi baris foto.
  const gifBodies: Buffer[] = [];
  for (const file of gifPhotos) {
    const body = Buffer.from(await file.arrayBuffer());
    const check = validatePhotoFile(file, body);
    if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error);
    gifBodies.push(body);
  }

  // Tandai sesi sedang difinalisasi SEBELUM byte pertama ditulis, supaya abort
  // yang datang di tengah upload ditolak (lihat abortSession).
  finalizingSessions.add(session.id);
  try {

  // Upload paralel dengan konkurensi terbatas (I/O-bound; 4 cukup untuk tablet
  // kiosk tanpa membanjiri koneksi booth). Urutan key tetap deterministik.
  // Upload key deterministik + idempotent: pemanggil konkuren yang nanti kalah
  // klaim pun meng-upload byte yang sama, jadi ledger tetap konvergen.
  const UPLOAD_CONCURRENCY = 4;
  await mapWithConcurrency(bodies, UPLOAD_CONCURRENCY, async (body, i) => {
    const key = photoKeys[i]!;
    const { error: upErr } = await getStorage().upload(GENERATED_BUCKET, key, body, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) throw new ApiError("INTERNAL", "Gagal mengunggah foto");
    await accountStorageAdd(device.businessId, GENERATED_BUCKET, key, body.length);
    return key;
  });

  // GIF slideshow server-side (docs/05 §5.13) — di-decode frame-by-frame
  // (puncak memori O(satu frame), bukan O(semua frame)). Sumber: capture
  // mentah bila ada; klien lama tanpa `gif_photos` tetap memakai hasil akhir.
  const gif = generateSlideshowGif(gifBodies.length > 0 ? gifBodies : bodies);
  const { error: gifErr } = await getStorage().upload(GENERATED_BUCKET, gifKey, gif, {
    contentType: "image/gif",
    upsert: true,
  });
  if (gifErr) throw new ApiError("INTERNAL", "Gagal mengunggah GIF");
  await accountStorageAdd(device.businessId, GENERATED_BUCKET, gifKey, gif.length);

  // KLAIM EKSKLUSIF sebelum menyentuh tabel `photos`. Dulu rows di-insert lebih
  // dulu lalu status di-CAS: dua finalize bersamaan (retry HTTP ganda) sama-sama
  // lolos insert → foto ganda di hasil & cetak, plus baris DB permanen. Sekarang
  // CAS 'active' → 'completed' jadi gerbangnya: tepat satu pemanggil menang
  // (predicate dievaluasi ulang setelah row lock), yang kalah reload dan
  // mengembalikan hasil existing tanpa pernah menulis `photos`. GIF sudah
  // di-upload di atas (key deterministik) agar klaim sekaligus menyimpan
  // `result_gif_key`.
  const completedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      completed_at: completedAt,
      finalized_at: completedAt,
      result_gif_key: gifKey,
      retake_count: parsed.retake_count ?? session.retake_count,
    })
    .eq("id", session.id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  const claimedRow = (claimed ?? null) as unknown as SessionRow | null;
  if (!claimedRow) {
    const reloaded = await loadSession(device.businessId, session.id);
    if (reloaded.status === "completed") {
      return await buildResult(device.businessId, reloaded);
    }
    // Abort (atau expiry) menang saat upload masih berjalan. Objek yang baru
    // saja kita tulis tidak akan pernah dirujuk baris `photos`, jadi hapus dan
    // kembalikan meterannya — dulu objek ini tertinggal permanen (foto customer
    // tanpa referensi, tenant tetap ditagih byte-nya).
    await discardUploadedObjects(device.businessId, [...photoKeys, gifKey]);
    throw new ApiError("SESSION_EXPIRED", "Sesi sudah dibatalkan");
  }

  // Pemenang klaim = satu-satunya penulis baris `photos`. Delete dulu agar retry
  // yang mengirim lebih sedikit foto tidak meninggalkan baris sisa; aman karena
  // tidak ada finalize lain yang bisa mencapai titik ini.
  await supabase.from("photos").delete().eq("session_id", session.id);
  if (bodies.length > 0) {
    const rows = bodies.map((_, i) => ({
      session_id: session.id,
      business_id: device.businessId,
      template_id: parsed.template_id ?? null,
      file_key: photoKeys[i]!,
      order_index: i,
    }));
    const { error: photoErr } = await supabase.from("photos").insert(rows);
    if (photoErr) {
      // Sesi tidak boleh tertinggal 'completed' tanpa baris foto: retry akan
      // melihat completed dan mengembalikan hasil kosong. Lepas klaim agar
      // retry bisa mengulang, dan buang objek yang sudah ter-upload agar tidak
      // jadi orphan (retry meng-upload ulang byte yang sama).
      await releaseFinalizeClaim(device.businessId, session.id);
      await discardUploadedObjects(device.businessId, [
        ...photoKeys.slice(0, bodies.length),
        gifKey,
      ]);
      throw new ApiError("INTERNAL", "Gagal menyimpan foto");
    }
  }

    return await buildResult(device.businessId, claimedRow);
  } finally {
    finalizingSessions.delete(session.id);
  }
}

/**
 * Lepas klaim finalize (status 'completed' → 'active') bila penulisan baris foto
 * gagal, supaya sesi tetap bisa di-finalize ulang. Best-effort: kegagalan di sini
 * di-log (sesi tetap 'completed' dan retry akan mengembalikan hasil kosong —
 * lebih buruk, tapi tidak boleh menutupi error aslinya).
 */
async function releaseFinalizeClaim(businessId: string, sessionId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "active", completed_at: null, finalized_at: null, result_gif_key: null })
    .eq("id", sessionId)
    .eq("business_id", businessId)
    .eq("status", "completed");
  if (error) {
    console.error(
      `[kiosk-sessions] gagal melepas klaim finalize sesi ${sessionId}:`,
      error.message
    );
  }
}

/** Buang objek hasil upload finalize yang gagal — storage + ledger, best-effort. */
async function discardUploadedObjects(businessId: string, keys: string[]): Promise<void> {
  const { ok, failures } = await removeResolvedOutcome(GENERATED_BUCKET, keys);
  if (failures.length > 0) {
    console.error(`[kiosk-sessions] ${failures.length} objek finalize gagal tidak dapat dibuang`);
  }
  if (ok.length > 0) await accountStorageSub(businessId, ok);
}

async function buildResult(businessId: string, session: Pick<SessionRow, "id" | "result_gif_key">) {
  const supabase = createServerClient();
  const { data: checkout } = await supabase
    .from("checkout_sessions")
    .select("result_token")
    .eq("session_id", session.id)
    .maybeSingle();

  const { data: photos } = await supabase
    .from("photos")
    .select("id, file_key, order_index")
    .eq("session_id", session.id)
    .order("order_index", { ascending: true });

  const photoRows = photos ?? [];
  const keys = [
    ...(session.result_gif_key ? [session.result_gif_key] : []),
    ...photoRows.map((p) => p.file_key),
  ];
  const urlMap = await signedUrls(keys);
  const gifUrl = session.result_gif_key ? (urlMap.get(session.result_gif_key) ?? null) : null;
  const photoItems = photoRows.map((p) => ({
    id: p.id,
    url: urlMap.get(p.file_key) ?? null,
    order_index: p.order_index,
  }));

  return {
    session_id: session.id,
    status: "completed",
    result_token: checkout?.result_token ?? null,
    gif_url: gifUrl,
    photos: photoItems,
  };
}

async function loadResult(resultToken: string) {
  const supabase = createServerClient();
  const { data: checkout } = await supabase
    .from("checkout_sessions")
    .select(
      "result_token, session_id, business_id, sessions ( id, business_id, status, result_gif_key, finalized_at )"
    )
    .eq("result_token", resultToken)
    .maybeSingle();

  const row = (checkout ?? null) as unknown as CheckoutJoined | null;
  const session = row?.sessions ?? null;
  if (!row || !session || Array.isArray(session)) {
    throw new ApiError("NOT_FOUND", "Link tidak valid atau kedaluwarsa");
  }
  // Hanya sesi yang benar-benar selesai yang punya hasil. Tanpa gerbang ini
  // link hasil yang dibagikan sebelum sesi finalize (atau sesi yang di-expire)
  // merender halaman "Foto kamu siap!" dengan grid kosong.
  if (session.status !== "completed") {
    throw new ApiError("NOT_FOUND", "Link tidak valid atau kedaluwarsa");
  }
  // Token hasil harus milik business yang sama dengan sesinya. Token acak sudah
  // sulit ditebak, tapi tanpa cek ini satu baris checkout yang tertaut ke sesi
  // business lain akan membocorkan foto tenant itu.
  if (session.business_id !== row.business_id) {
    throw new ApiError("NOT_FOUND", "Link tidak valid atau kedaluwarsa");
  }

  // Retention policy (docs/09 §9.8, default 3 hari — migrasi 0034).
  const { data: settings } = await supabase
    .from("business_settings")
    .select("retention_days")
    .eq("business_id", row.business_id)
    .maybeSingle();
  const retentionDays = settings?.retention_days ?? DEFAULT_RETENTION_DAYS;
  const finalizedAt = session.finalized_at ? new Date(session.finalized_at).getTime() : Date.now();
  if (Date.now() - finalizedAt > retentionDays * 24 * 60 * 60 * 1000) {
    throw new ApiError("NOT_FOUND", "Link kedaluwarsa");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", row.business_id)
    .maybeSingle();

  const { data: photos } = await supabase
    .from("photos")
    .select("id, file_key, order_index")
    .eq("session_id", session.id)
    .eq("business_id", row.business_id)
    .order("order_index", { ascending: true });

  const photoRows = photos ?? [];
  const keys = [
    ...(session.result_gif_key ? [session.result_gif_key] : []),
    ...photoRows.map((p) => p.file_key),
  ];
  const [urlMap, dlMap] = await Promise.all([signedUrls(keys), downloadUrls(keys)]);
  const gifUrl = session.result_gif_key ? (urlMap.get(session.result_gif_key) ?? null) : null;
  const gifDownloadUrl = session.result_gif_key
    ? (dlMap.get(session.result_gif_key) ?? null)
    : null;
  const photoItems = photoRows.map((p) => ({
    id: p.id,
    url: urlMap.get(p.file_key) ?? null,
    download_url: dlMap.get(p.file_key) ?? null,
    order_index: p.order_index,
  }));

  return {
    business: { name: business?.name ?? null },
    status: session.status,
    gif_url: gifUrl,
    gif_download_url: gifDownloadUrl,
    photos: photoItems,
  };
}

/**
 * Akses result online via result_token (docs/05 §5.13, retention docs/09).
 *
 * Dibungkus `cache()` (react) supaya satu request hanya menjalankan query ini
 * SEKALI. `/r/[token]/layout.tsx` memanggilnya sebagai gerbang 404 dan
 * `page.tsx` memanggilnya untuk merender. Tanpa cache keduanya menembak
 * Supabase dua kali untuk token yang sama.
 */
export const getResult = cache(loadResult);
