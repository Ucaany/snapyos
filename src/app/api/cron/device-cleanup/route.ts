import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";

/**
 * Cron pembersihan device non-aktif, docs/08 §8.5.
 * Dijalankan harian (vercel.json cron). Autentikasi: Bearer CRON_SECRET,
 * FAIL-CLOSED (secret kosong = tolak; dev opt-in DEVICE_CLEANUP_CRON_OPEN=1).
 *
 * Latar: pembersihan ini dulu menempel di handler GET /devices dan
 * GET /photoboxes/:id/activation sebagai efek samping DELETE, jadi GET tidak
 * idempoten dan bisa menghapus data saat sekadar dibaca. Sekarang jalur baca
 * murni read-only; purge pindah ke sini.
 *
 * Yang dihapus: baris `devices` berstatus non-aktif (riwayat dihapus permanen,
 * docs/05 §5.0). Batch berulang (select id, lalu delete by id) supaya backlog
 * besar tersalirkan tanpa satu query raksasa, dengan plafon ronde agar durasi
 * fungsi tetap di bawah maxDuration. Idempotent, aman dijalankan berkali-kali.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 500;
const MAX_ROUNDS = 20;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Tolak jika CRON_SECRET dimulai dengan "change-me" (placeholder .env.example).
  if (secret && secret.startsWith("change-me")) return false;
  // DEVICE_CLEANUP_CRON_OPEN hanya boleh aktif di luar production (fail-closed).
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.DEVICE_CLEANUP_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/device-cleanup] CRON_SECRET tidak diset, cleanup mati (misconfig)");
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Forbidden" } },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  const log = (message: string) => console.error(`[cron/device-cleanup] ${message}`);

  let deleted = 0;
  let rounds = 0;
  let failure: string | null = null;

  // Batas allowlist `active`: apa pun status baru di schema ikut tersapu,
  // bukan hanya 'revoked' yang kebetulan kita tahu hari ini.
  while (rounds < MAX_ROUNDS) {
    rounds += 1;

    const { data, error } = await supabase
      .from("devices")
      .select("id")
      .neq("status", "active")
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) {
      failure = `gagal memuat device non-aktif: ${error.message}`;
      log(failure);
      break;
    }

    const ids = ((data ?? []) as { id: string }[]).map((d) => d.id);
    if (ids.length === 0) break;

    const { error: deleteError } = await supabase.from("devices").delete().in("id", ids);
    if (deleteError) {
      failure = `gagal menghapus batch device: ${deleteError.message}`;
      log(failure);
      break;
    }
    deleted += ids.length;

    // Batch terakhir tidak penuh, berarti tidak ada sisa, berhenti lebih awal.
    if (ids.length < BATCH_LIMIT) break;
  }

  const backlogRemaining = rounds >= MAX_ROUNDS && !failure;
  if (backlogRemaining) {
    log(`plafon ${MAX_ROUNDS} ronde tercapai, sisa backlog disalurkan run berikutnya`);
  }

  if (failure) {
    return Response.json(
      { error: { code: "INTERNAL", message: "Pembersihan device gagal" }, data: { deleted } },
      { status: 500 }
    );
  }

  return Response.json({ data: { deleted, rounds, backlogRemaining } });
}
