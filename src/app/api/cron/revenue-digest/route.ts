import { bearerMatches } from "@/lib/cron-auth";
import { sendRevenueDigest } from "@/server/revenue-notify";

/**
 * Cron rekap revenue harian — dikirim ke topic Telegram revenue.
 * Jadwal: 14:00 UTC = 21:00 WIB (lihat deploy/cron/snapyos.cron + vercel.json).
 * Autentikasi: Bearer CRON_SECRET.
 *
 * Isi: revenue hari ini & bulan berjalan, jumlah transaksi, rincian per jenis,
 * pembayar teratas, dan jumlah trial baru/aktif — sehingga riwayat revenue
 * tetap terbaca walau notifikasi real-time terlewat.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.REVENUE_DIGEST_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Forbidden" } }, { status: 401 });
  }
  const sent = await sendRevenueDigest();
  return Response.json({ ok: true, sent });
}
