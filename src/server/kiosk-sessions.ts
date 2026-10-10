/**
 * Kiosk session lifecycle — docs/05 §5.1b (timer + auto-finalize), docs/08 §8.14.
 * v2 pay-first: sesi hanya bisa dimulai setelah checkout paid. Saat DEV_SKIP_PAYMENT
 * aktif, package_id dipakai untuk membuat checkout paid sintetik (docs/12 Phase 4).
 * Mode offline (docs/05): package_id diterima bila checkout.offline_enabled —
 * transaksi offline tercatat paid utk reporting, non-withdrawable by design.
 */

import "server-only"
import { randomUUID } from "node:crypto"
import { createServerClient } from "@/lib/supabase/server"
import { ApiError } from "@/lib/api-errors"
import { assertSessionCapacity } from "@/server/session-capacity"
import { resolveActiveDevice } from "@/server/devices"
import { getOfflineEnabled } from "@/server/business"
import { generateResultToken } from "@/lib/device-token"
import { computeExpiresAt, OFFLINE_FINALIZE_GRACE_MS } from "@/lib/session-timer"
import { validatePhotoFile } from "@/lib/upload-validation"
import { todayISO, formatTxNumber } from "@/lib/dashboard-math"
import { generateSlideshowGif } from "@/server/gif"
import {
  sessionCreateSchema,
  sessionFinalizeSchema,
  sessionAbortSchema,
  type SessionCreateInput,
  type SessionFinalizeInput,
  type SessionAbortInput,
} from "@/lib/validators"
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants"
import {
  assertStorageAvailable,
  accountStorageAdd,
  accountStorageSub,
} from "@/server/storage-usage"
import { getStorage, signedUrlMap } from "@/server/storage"

const GENERATED_BUCKET = "generated-photos" as const
const DEFAULT_RETENTION_DAYS = 3

/** Jalankan task dengan konkurensi terbatas, urutan hasil dijaga. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

type PhotoFile = {
  name?: string | null
  type?: string | null
  size?: number | null
  arrayBuffer(): Promise<ArrayBuffer>
}

type SessionRow = {
  id: string
  business_id: string
  outlet_id: string
  photobox_id: string
  package_id: string
  status: string
  retake_count: number
  started_at: string | null
  completed_at: string | null
  expires_at: string | null
  finalized_at: string | null
  result_gif_key: string | null
  created_at: string
}

type CheckoutJoined = {
  result_token: string
  session_id: string | null
  business_id: string
  sessions: SessionRow | SessionRow[] | null
}

let devSkipPaymentWarned = false

function devSkipPayment(): boolean {
  // Hard guard: tidak pernah aktif di production, apa pun isi env-nya.
  if (process.env.NODE_ENV === "production") return false
  if (process.env.DEV_SKIP_PAYMENT !== "true") return false
  if (!devSkipPaymentWarned) {
    devSkipPaymentWarned = true
    console.error(
      "[SECURITY] DEV_SKIP_PAYMENT aktif — pembayaran QRIS dilewati (hanya non-production)"
    )
  }
  return true
}

/**
 * Batch signed URL foto + GIF (satu resolusi + satu presign per provider).
 * Fase 3: foto/GIF sesi baru di R2, sesi lama di Supabase — batch menghindari
 * N probe `head()` per foto pada hot path result.
 */
async function signedUrls(keys: string[]): Promise<Map<string, string>> {
  return signedUrlMap(GENERATED_BUCKET, keys, SIGNED_URL_TTL)
}

async function loadSession(businessId: string, sessionId: string): Promise<SessionRow> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("business_id", businessId)
    .maybeSingle()
  const row = (data ?? null) as unknown as SessionRow | null
  if (!row) throw new ApiError("NOT_FOUND", "Sesi tidak ditemukan")
  return row
}

/** Mulai sesi (syarat checkout paid / dev bypass / mode offline) — docs/08 §8.14. */
export async function createSession(businessSlug: string, input: SessionCreateInput) {
  const parsed = sessionCreateSchema.parse(input)
  const device = await resolveActiveDevice(parsed.device_token)
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  }

  const supabase = createServerClient()
  const photobox = device.photobox
  const businessId = device.businessId

  // Resolve package + checkout (pay-first, dev bypass, atau mode offline docs/05).
  let packageId: string
  let checkoutId: string
  let packagePrice = 0
  let offlineMode = false
  let resultToken = ""

  if (parsed.checkout_session_id) {
    const { data: checkout } = await supabase
      .from("checkout_sessions")
      .select(
        "id, package_id, photobox_id, status, result_token, session_id, sessions ( expires_at, status )"
      )
      .eq("id", parsed.checkout_session_id)
      .eq("business_id", businessId)
      .maybeSingle()
    const checkoutRow = (checkout ?? null) as unknown as {
      id: string
      package_id: string
      photobox_id: string
      status: string
      result_token: string | null
      session_id: string | null
      sessions:
        { expires_at: string; status: string } | { expires_at: string; status: string }[] | null
    } | null
    if (!checkoutRow) throw new ApiError("PAYMENT_NOT_FOUND", "Checkout tidak ditemukan")
    if (checkoutRow.status !== "paid") {
      throw new ApiError("PAYMENT_EXPIRED", "Pembayaran belum lunas")
    }
    if (checkoutRow.photobox_id !== photobox.id) {
      throw new ApiError("FORBIDDEN", "Checkout tidak cocok dengan booth ini")
    }
    if (checkoutRow.session_id) {
      const joined = Array.isArray(checkoutRow.sessions)
        ? checkoutRow.sessions[0]
        : checkoutRow.sessions
      if (joined?.status === "active" && Date.now() < new Date(joined.expires_at).getTime()) {
        return {
          session_id: checkoutRow.session_id,
          expires_at: joined.expires_at,
          checkout_session_id: checkoutRow.id,
          result_token: checkoutRow.result_token,
        }
      }
      throw new ApiError("SESSION_EXPIRED", "Sesi pembayaran ini sudah berakhir")
    }
    packageId = checkoutRow.package_id
    checkoutId = checkoutRow.id
    resultToken = checkoutRow.result_token ?? ""
  } else if (parsed.package_id) {
    const devBypass = devSkipPayment()
    // Mode offline (docs/05): sesi tanpa QRIS bila owner mengaktifkannya.
    offlineMode = !devBypass && (await getOfflineEnabled(businessId))
    if (!devBypass && !offlineMode) {
      throw new ApiError("VALIDATION_ERROR", "Pembayaran wajib sebelum sesi foto (pay-first)")
    }
    const { data: pkg } = await supabase
      .from("packages")
      .select("id, price")
      .eq("id", parsed.package_id)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .maybeSingle()
    const pkgRow = (pkg ?? null) as unknown as { id: string; price: number } | null
    if (!pkgRow) throw new ApiError("NOT_FOUND", "Package tidak ditemukan")
    packageId = pkgRow.id
    packagePrice = pkgRow.price
    checkoutId = ""
  } else {
    throw new ApiError("VALIDATION_ERROR", "checkout_session_id atau package_id wajib diisi")
  }

  // Limit sesi konkuren (docs/02 §2.3) — helper bersama dengan pre-payment check
  // (createCheckout/createPayment) agar aturan tidak drift.
  await assertSessionCapacity(businessId, photobox.id)

  const now = new Date()

  const timerSeconds = (photobox.session_settings as { timer_seconds?: number } | null)
    ?.timer_seconds

  // Timer sesi dimulai dari payment paid_at (docs/05 §5.1b baris 120:
  // "Timer mulai saat webhook PAID — waktu menunggu QRIS tidak dihitung").
  // Jika customer membayar lalu menunggu, sisa waktu berkurang.
  // Clamp minimum 30 detik agar auto-finalize tetap berjalan (customer
  // sudah bayar = tetap mendapat produk — docs/05 §5.1b baris 124).
  const MINIMUM_GRACE_MS = 30_000
  let expiresAt: string
  if (parsed.checkout_session_id) {
    const { data: payRow } = await supabase
      .from("payments")
      .select("paid_at")
      .eq("checkout_session_id", parsed.checkout_session_id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const paidAtMs = payRow?.paid_at ? new Date(payRow.paid_at as string).getTime() : NaN
    if (!Number.isNaN(paidAtMs)) {
      const idealExpiry = new Date(computeExpiresAt(timerSeconds ?? 0, paidAtMs)).getTime()
      const clampedExpiry = Math.max(idealExpiry, now.getTime() + MINIMUM_GRACE_MS)
      expiresAt = new Date(clampedExpiry).toISOString()
    } else {
      // Fallback: paid_at missing (should not happen) → start from now.
      expiresAt = computeExpiresAt(timerSeconds ?? 0)
    }
  } else {
    // Dev bypass / mode offline: timer from now (no payment step).
    expiresAt = computeExpiresAt(timerSeconds ?? 0)
  }

  // Dev bypass / mode offline: buat checkout paid sintetik (result_token di-issue,
  // docs/05 §5.13). Jalur QRIS asli tidak pernah lewat sini.
  if (!parsed.checkout_session_id) {
    resultToken = generateResultToken()
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
      .single()
    const checkoutRow = (checkout ?? null) as unknown as { id: string } | null
    if (checkoutError || !checkoutRow) throw new ApiError("INTERNAL", "Gagal membuat checkout")
    checkoutId = checkoutRow.id
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      business_id: businessId,
      outlet_id: photobox.outlet_id,
      photobox_id: photobox.id,
      package_id: packageId,
      status: "active",
      started_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select("id, expires_at, status")
    .single()
  // Race antar booth (TOCTOU pre-check): partial unique index 1 sesi aktif per
  // photobox (db/0004) menegakkan limit secara atomik di sini.
  if (sessionError && (sessionError as { code?: string }).code === "23505") {
    throw new ApiError(
      "SESSION_LIMIT_REACHED",
      "Sesi lain masih berjalan di booth ini. Tunggu selesai sebelum memulai sesi baru."
    )
  }
  const sessionRow = (session ?? null) as unknown as {
    id: string
    expires_at: string
    status: string
  } | null
  if (sessionError || !sessionRow) throw new ApiError("INTERNAL", "Gagal membuat sesi")

  // Link checkout ↔ session (result_token lookup saat finalize).
  await supabase
    .from("checkout_sessions")
    .update({ session_id: sessionRow.id })
    .eq("id", checkoutId)

  // Mode offline (docs/05): catat transaksi utk reporting — status paid,
  // payment_method 'offline'. BY DESIGN non-withdrawable (bukan pembayaran gateway).
  if (offlineMode) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("timezone")
      .eq("id", businessId)
      .maybeSingle()
    const tz = (biz as { timezone?: string } | null)?.timezone ?? "Asia/Jakarta"
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
      number: formatTxNumber(todayISO(tz), randomUUID().replace(/-/g, "").slice(0, 6)),
      paid_at: now.toISOString(),
    })
    if (txError) throw new ApiError("INTERNAL", "Gagal mencatat transaksi offline")
  }

  return {
    session_id: sessionRow.id,
    expires_at: sessionRow.expires_at,
    checkout_session_id: checkoutId,
    result_token: resultToken || null,
  }
}

/** Finalize: upload foto + GIF, tandai completed (docs/05 §5.13, §5.15.1). */
/**
 * Abort sesi aktif oleh kiosk itu sendiri (customer reset / batal di tengah
 * flow tanpa foto). Device token = auth: hanya booth pemilik sesi yang boleh.
 * Tanpa jalur ini sesi zombie mengunci booth sampai grace offline habis
 * (assertSessionCapacity) — "Sesi lain masih berjalan" padahal kiosk kosong.
 */
export async function abortSession(
  businessSlug: string,
  sessionId: string,
  input: SessionAbortInput
) {
  const parsed = sessionAbortSchema.parse(input)
  const device = await resolveActiveDevice(parsed.device_token)
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  }
  const supabase = createServerClient()
  const session = await loadSession(device.businessId, sessionId)
  if (session.photobox_id !== device.photobox.id) {
    throw new ApiError("FORBIDDEN", "Device tidak cocok dengan sesi ini")
  }
  await supabase
    .from("sessions")
    .update({ status: "expired", finalized_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "active")
  return { ok: true as const }
}

export async function finalizeSession(
  businessSlug: string,
  sessionId: string,
  input: SessionFinalizeInput,
  photos: PhotoFile[]
) {
  const parsed = sessionFinalizeSchema.parse(input)
  const device = await resolveActiveDevice(parsed.device_token)
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  }

  const supabase = createServerClient()
  const session = await loadSession(device.businessId, sessionId)

  if (session.photobox_id !== device.photobox.id) {
    throw new ApiError("FORBIDDEN", "Device tidak cocok dengan sesi ini")
  }
  if (session.status === "completed") {
    return await buildResult(device.businessId, session)
  }
  if (session.status !== "active") {
    throw new ApiError("SESSION_EXPIRED", "Sesi sudah berakhir")
  }
  if (session.expires_at) {
    const expiredAt = new Date(session.expires_at).getTime()
    if (Date.now() >= expiredAt) {
      // Grace offline: foto ter-capture sebelum expiry tetap diproses bila
      // kiosk finalisasi terlambat karena sinkronisasi koneksi (docs/05 §5.1b).
      const withinGrace = Date.now() < expiredAt + OFFLINE_FINALIZE_GRACE_MS
      if (!withinGrace || photos.length === 0) {
        await supabase
          .from("sessions")
          .update({ status: "expired", finalized_at: new Date().toISOString() })
          .eq("id", session.id)
          .eq("status", "active")
        throw new ApiError("SESSION_EXPIRED", "Waktu sesi sudah habis")
      }
    }
  }

  if (photos.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Belum ada foto untuk difinalisasi")
  }

  // Enforce photo count vs package.photo_count (docs/05) — kiosk tidak boleh
  // menembak foto lebih banyak dari jumlah yang dibayar.
  const { data: pkgRow } = await supabase
    .from("packages")
    .select("photo_count")
    .eq("id", session.package_id)
    .eq("business_id", device.businessId)
    .maybeSingle()
  const photoCount = (pkgRow as { photo_count: number } | null)?.photo_count
  if (typeof photoCount === "number" && photos.length > photoCount) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Jumlah foto (${photos.length}) melebihi kuota paket (${photoCount})`
    )
  }

  const { data: sessionPhotobox } = await supabase
    .from("photoboxes")
    .select("session_settings")
    .eq("id", session.photobox_id)
    .eq("business_id", device.businessId)
    .maybeSingle()
  const maxRetakes = (sessionPhotobox?.session_settings as { max_retakes?: number | null } | null)
    ?.max_retakes
  if (
    typeof maxRetakes === "number" &&
    (parsed.retake_count ?? session.retake_count) > maxRetakes
  ) {
    throw new ApiError("VALIDATION_ERROR", "Batas retake sesi terlampaui")
  }

  // Storage gate (0053): kuota penuh → blokir simpan hasil (riwayat foto).
  // Incoming = total foto; GIF slideshow mengikuti ukuran foto gabungan.
  const photoBytes = photos.reduce((sum, f) => sum + (f.size ?? 0), 0)
  await assertStorageAvailable(device.businessId, photoBytes)

  const uploadKey = `${device.businessId}/sessions/${sessionId}`

  // Retry-safe: percobaan finalize sebelumnya bisa gagal parsial setelah
  // sebagian rows photos ter-insert → hapus dulu agar insert ulang tidak
  // menabrak duplikat dan hasil retry identik.
  await supabase.from("photos").delete().eq("session_id", session.id)

  // Resync akuntansi: key foto/GIF deterministik di-upsert pada retry. Hapus
  // ledger key lama dulu agar accountStorageAdd di bawah mencatat ukuran AKTUAL
  // (idempotent per key; key absen = no-op).
  const retryKeys = [
    ...photos.map((_, i) => `${uploadKey}/photo-${String(i).padStart(2, "0")}.jpg`),
    `${uploadKey}/result.gif`,
  ]
  await accountStorageSub(device.businessId, retryKeys)

  // Baca + validasi semua buffer sekali (GIF membutuhkan seluruh frame). Validasi
  // SEBELUM upload apa pun agar body invalid tidak meninggalkan objek parsial.
  const bodies: Buffer[] = []
  for (const file of photos) {
    const body = Buffer.from(await file.arrayBuffer())
    const check = validatePhotoFile(file, body)
    if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error)
    bodies.push(body)
  }

  // Upload paralel dengan konkurensi terbatas (I/O-bound; 4 cukup untuk tablet
  // kiosk tanpa membanjiri koneksi booth). Urutan key tetap deterministik.
  const UPLOAD_CONCURRENCY = 4
  await mapWithConcurrency(bodies, UPLOAD_CONCURRENCY, async (body, i) => {
    const key = `${uploadKey}/photo-${String(i).padStart(2, "0")}.jpg`
    const { error: upErr } = await getStorage().upload(GENERATED_BUCKET, key, body, {
      contentType: "image/jpeg",
      upsert: true,
    })
    if (upErr) throw new ApiError("INTERNAL", "Gagal mengunggah foto")
    await accountStorageAdd(device.businessId, GENERATED_BUCKET, key, body.length)
    return key
  })

  // Batch insert rows photos — satu round-trip PostgREST, bukan N.
  if (bodies.length > 0) {
    const rows = bodies.map((_, i) => ({
      session_id: session.id,
      business_id: device.businessId,
      template_id: parsed.template_id ?? null,
      file_key: `${uploadKey}/photo-${String(i).padStart(2, "0")}.jpg`,
      order_index: i,
    }))
    const { error: photoErr } = await supabase.from("photos").insert(rows)
    if (photoErr) throw new ApiError("INTERNAL", "Gagal menyimpan foto")
  }

  // GIF slideshow server-side (docs/05 §5.13) — di-decode frame-by-frame
  // (puncak memori O(satu frame), bukan O(semua frame)).
  const gifKey = `${uploadKey}/result.gif`
  const gif = generateSlideshowGif(bodies)
  const { error: gifErr } = await getStorage().upload(GENERATED_BUCKET, gifKey, gif, {
    contentType: "image/gif",
    upsert: true,
  })
  if (gifErr) throw new ApiError("INTERNAL", "Gagal mengunggah GIF")
  await accountStorageAdd(device.businessId, GENERATED_BUCKET, gifKey, gif.length)

  const completedAt = new Date().toISOString()
  // Atomic transition: hanya menang bila masih 'active'. Bila baris sudah
  // di-complete pemanggil konkuren (double-finalize race), `.eq("status",
  // "active")` mengembalikan 0 baris → reload dan kembalikan hasil existing.
  const { data: updated } = await supabase
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
    .maybeSingle()
  const updatedRow = (updated ?? null) as unknown as SessionRow | null
  if (!updatedRow) {
    const reloaded = await loadSession(device.businessId, session.id)
    if (reloaded.status === "completed") {
      return await buildResult(device.businessId, reloaded)
    }
    throw new ApiError("INTERNAL", "Gagal memfinalisasi sesi")
  }

  return await buildResult(device.businessId, updatedRow)
}

async function buildResult(businessId: string, session: Pick<SessionRow, "id" | "result_gif_key">) {
  const supabase = createServerClient()
  const { data: checkout } = await supabase
    .from("checkout_sessions")
    .select("result_token")
    .eq("session_id", session.id)
    .maybeSingle()

  const { data: photos } = await supabase
    .from("photos")
    .select("id, file_key, order_index")
    .eq("session_id", session.id)
    .order("order_index", { ascending: true })

  const photoRows = photos ?? []
  const keys = [
    ...(session.result_gif_key ? [session.result_gif_key] : []),
    ...photoRows.map((p) => p.file_key),
  ]
  const urlMap = await signedUrls(keys)
  const gifUrl = session.result_gif_key ? (urlMap.get(session.result_gif_key) ?? null) : null
  const photoItems = photoRows.map((p) => ({
    id: p.id,
    url: urlMap.get(p.file_key) ?? null,
    order_index: p.order_index,
  }))

  return {
    session_id: session.id,
    status: "completed",
    result_token: checkout?.result_token ?? null,
    gif_url: gifUrl,
    photos: photoItems,
  }
}

/** Akses result online via result_token (docs/05 §5.13, retention docs/09). */
export async function getResult(resultToken: string) {
  const supabase = createServerClient()
  const { data: checkout } = await supabase
    .from("checkout_sessions")
    .select(
      "result_token, session_id, business_id, sessions ( id, status, result_gif_key, finalized_at )"
    )
    .eq("result_token", resultToken)
    .maybeSingle()

  const row = (checkout ?? null) as unknown as CheckoutJoined | null
  const session = row?.sessions ?? null
  if (!row || !session || Array.isArray(session)) {
    throw new ApiError("NOT_FOUND", "Link tidak valid atau kedaluwarsa")
  }

  // Retention policy (docs/09 §9.8, default 7 hari).
  const { data: settings } = await supabase
    .from("business_settings")
    .select("retention_days")
    .eq("business_id", row.business_id)
    .maybeSingle()
  const retentionDays = settings?.retention_days ?? DEFAULT_RETENTION_DAYS
  const finalizedAt = session.finalized_at ? new Date(session.finalized_at).getTime() : Date.now()
  if (Date.now() - finalizedAt > retentionDays * 24 * 60 * 60 * 1000) {
    throw new ApiError("NOT_FOUND", "Link kedaluwarsa")
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", row.business_id)
    .maybeSingle()

  const { data: photos } = await supabase
    .from("photos")
    .select("id, file_key, order_index")
    .eq("session_id", session.id)
    .order("order_index", { ascending: true })

  const photoRows = photos ?? []
  const keys = [
    ...(session.result_gif_key ? [session.result_gif_key] : []),
    ...photoRows.map((p) => p.file_key),
  ]
  const urlMap = await signedUrls(keys)
  const gifUrl = session.result_gif_key ? (urlMap.get(session.result_gif_key) ?? null) : null
  const photoItems = photoRows.map((p) => ({
    id: p.id,
    url: urlMap.get(p.file_key) ?? null,
    order_index: p.order_index,
  }))

  return {
    business: { name: business?.name ?? null },
    status: session.status,
    gif_url: gifUrl,
    photos: photoItems,
  }
}
