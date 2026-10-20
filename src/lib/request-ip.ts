/**
 * IP client untuk rate-limit (docs/08 §8.18, docs/09 §10).
 * Satu-satunya definisi kanonis — semua salinan inline
 * `x-forwarded-for?.split...` sudah dihapus (audit Fase 3).
 *
 * Trust model: header yang bisa di-spoof client (X-Forwarded-For) TIDAK
 * dipercaya begitu saja. Prioritas sumber IP yang diset platform:
 *   1. cf-connecting-ip   — anti-spoof header resmi Cloudflare (tidak bisa
 *      dipalsukan client); dipakai bila origin di belakang proxy Cloudflare.
 *   2. x-real-ip          — proxy terdekat yang sudah tervalidasi (Vercel/CF).
 *   3. x-vercel-forwarded-for — header khusus Vercel.
 *   4. x-forwarded-for    — ambil entri TERAKHIR (ditambahkan proxy tepercaya
 *      terdekat dengan origin; entri pertama adalah nilai yang bisa di-spoof
 *      client). Ini kebalikan dari trust hop-pertama yang rawan spoofing.
 * Tanpa header apa pun → "local".
 */

export function getClientIp(headers: Headers | null | undefined): string {
  if (!headers) return "local";
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const vercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1] as string;
  }
  return "local";
}
