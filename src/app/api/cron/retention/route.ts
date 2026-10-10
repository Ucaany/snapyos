import { createServerClient } from "@/lib/supabase/server"
import { bearerMatches } from "@/lib/cron-auth"
import { OFFLINE_FINALIZE_GRACE_MS } from "@/lib/session-timer"
import { removeResolvedOutcome } from "@/server/storage"
import { accountStorageSub } from "@/server/storage-usage"
import { retentionCutoff, cleanupSessionMedia, type SessionMedia } from "@/lib/retention"

/**
 * Cron retention hasil foto — docs/09 (storage), docs/12 Phase 11.
 * Dijalankan harian (vercel.json cron). Autentikasi: Bearer CRON_SECRET,
 * FAIL-CLOSED (secret kosong = tolak; dev opt-in RETENTION_CRON_OPEN=1).
 * Juga meng-auto-expire sesi aktif yang stagnan (lewat expires_at + grace).
 * Yang dibersihkan: photos + GIF hasil sesi finalized lebih tua dari
 * retention_days per business. Baris transactions/sessions DIPERTAHANKAN
 * (source of truth finansial) — hanya media hasil foto yang dihapus.
 * Batch per business (≈5 round-trip) + marker media_cleaned_at agar
 * backlog tersalirkan dan kegagalan storage di-retry run berikutnya.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // Tolak jika CRON_SECRET dimulai dengan "change-me" (placeholder .env.example).
  if (secret && secret.startsWith("change-me")) return false
  // RETENTION_CRON_OPEN hanya boleh aktif di luar production (fail-closed di prod).
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false
    return process.env.RETENTION_CRON_OPEN === "1"
  }
  return bearerMatches(request.headers.get("authorization"), secret)
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/retention] CRON_SECRET tidak diset — retention mati (misconfig)")
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    )
  }
  if (!authorized(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Forbidden" } }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = Date.now()
  const cleanedAt = new Date(now).toISOString()

  const log = (message: string) => console.error(`[cron/retention] ${message}`)

  // Auto-expire sesi aktif yang sudah lewat expires_at + grace offline
  // (kiosk mati / crash sebelum finalize) — tanpa ini partial unique index
  // 1 sesi aktif per photobox mengunci booth selamanya. finalized_at di-set
  // agar cron retention di bawah ikut membersihkan medianya.
  const staleBefore = new Date(now - OFFLINE_FINALIZE_GRACE_MS).toISOString()
  let staleExpireFailed = false
  {
    const { error } = await supabase
      .from("sessions")
      .update({ status: "expired", finalized_at: new Date(now).toISOString() })
      .eq("status", "active")
      .lt("expires_at", staleBefore)
    if (error) {
      staleExpireFailed = true
      log(`gagal auto-expire sesi stagnan: ${error.message}`)
    }
  }

  const { data: settings, error: settingsError } = await supabase
    .from("business_settings")
    .select("business_id, retention_days")
  if (settingsError) {
    log(`gagal memuat business_settings: ${settingsError.message}`)
    return Response.json(
      { error: { code: "INTERNAL", message: "Gagal memuat settings" } },
      { status: 500 }
    )
  }

  let cleanedSessions = 0
  let removedObjects = 0
  let deferredSessions = 0
  let deferredAccounting = 0
  let queryFailures = 0

  for (const setting of (settings ?? []) as { business_id: string; retention_days: number }[]) {
    const cutoff = retentionCutoff(setting.retention_days, now)

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, result_gif_key")
      .eq("business_id", setting.business_id)
      .in("status", ["completed", "expired"])
      .lt("finalized_at", cutoff)
      .is("media_cleaned_at", null)
      .order("finalized_at", { ascending: true })
      .limit(200)
    if (sessionsError) {
      queryFailures += 1
      log(`gagal memuat sesi business ${setting.business_id}: ${sessionsError.message}`)
      continue
    }

    const rows = (sessions ?? []) as { id: string; result_gif_key: string | null }[]
    if (rows.length === 0) continue
    const ids = rows.map((s) => s.id)

    const { data: photos } = await supabase
      .from("photos")
      .select("session_id, file_key, thumbnail_key")
      .in("session_id", ids)
    const photosBySession = new Map<string, string[]>()
    for (const p of (photos ?? []) as {
      session_id: string
      file_key: string
      thumbnail_key: string | null
    }[]) {
      const list = photosBySession.get(p.session_id) ?? []
      list.push(p.file_key)
      if (p.thumbnail_key) list.push(p.thumbnail_key)
      photosBySession.set(p.session_id, list)
    }
    const batchSessions: SessionMedia[] = rows.map((s) => {
      const keys = photosBySession.get(s.id) ?? []
      const all = s.result_gif_key ? [...keys, s.result_gif_key] : keys
      return { id: s.id, keys: Array.from(new Set(all)) }
    })

    const result = await cleanupSessionMedia(batchSessions, cleanedAt, {
      // Fase 3: media sesi lama di Supabase, baru di R2 — resolusi per-key.
      // Provider-aware + tahan gangguan satu objek (partial failure).
      storage: {
        remove: (keys) => removeResolvedOutcome("generated-photos", keys),
      },
      // Akuntansi: kurangi counter setelah delete storage sukses (idempotent
      // per key). Teruskan { ok } — bila gagal, cleanupSessionMedia menahan
      // finalize (baris photos + media_cleaned_at dipertahankan) agar run
      // berikutnya mengulang account_sub; objek absen tetap dianggap ok.
      accountSub: (keys) => accountStorageSub(setting.business_id, keys),
      finalize: async (sessionIds, at) => {
        // Baris DB hanya dihapus setelah storage cleanup sukses (per sesi).
        await supabase.from("photos").delete().in("session_id", sessionIds)
        await supabase
          .from("sessions")
          .update({ media_cleaned_at: at, result_gif_key: null })
          .in("id", sessionIds)
      },
      log,
    })

    cleanedSessions += result.cleanedSessions
    removedObjects += result.removedObjects
    deferredSessions += result.deferredSessions
    deferredAccounting += result.deferredAccounting
  }

  if (deferredAccounting > 0) {
    log(`${deferredAccounting} sesi ditahan karena akuntansi storage (account_sub) gagal`)
  }

  const failures = queryFailures + (staleExpireFailed ? 1 : 0)
  if (failures > 0) {
    return Response.json(
      {
        error: { code: "INTERNAL", message: "Sebagian query retention gagal" },
        data: { cleanedSessions, removedObjects, deferredSessions, deferredAccounting },
      },
      { status: 500 }
    )
  }

  return Response.json({
    data: { cleanedSessions, removedObjects, deferredSessions, deferredAccounting },
  })
}
