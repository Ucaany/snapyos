/**
 * PIN login staff (0043) — diverifikasi saat login, bebas dari siklus import
 * (auth.ts → tenant.ts → auth.ts). Dipakai src/lib/auth.ts (authorize) tanpa
 * menarik getMembership/tenant, dan src/server/staff.ts untuk set-PIN owner.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { verifyDevicePin } from "@/lib/device-token";

/** Batas hash PIN yang diverifikasi per percobaan login (anti CPU-exhaustion). */
export const MAX_PIN_CANDIDATES = 10;

/**
 * Hasil verifikasi PIN: business tempat PIN itu diterbitkan, atau null bila
 * tidak ada assignment yang cocok. Business WAJIB ikut dikembalikan — PIN yang
 * terverifikasi harus mengikat sesi ke tenant penerbitnya, bukan sekadar
 * menandai user sebagai "staff".
 */
export type StaffPinMatch = { businessId: string } | null;

/**
 * Verifikasi PIN login staff TANPA mengungkap daftar booth ke browser.
 *
 * PIN hanya berlaku untuk membership ber-role `staff`. Tanpa batas ini, PIN
 * booth (4–6 digit, dibagikan antar-shift dan diketik di tempat publik) menjadi
 * faktor autentikasi tingkat akun: manager/owner yang punya PIN bisa masuk
 * sebagai manager/owner penuh tanpa password.
 *
 * Assignment dicari lewat user_id (bukan email) supaya tidak butuh join users;
 * pemanggil sudah punya user.id dari lookup login.
 */
export async function verifyStaffPin(userId: string, pin: string): Promise<StaffPinMatch> {
  const supabase = createServerClient();

  // Hanya business tempat user ini benar-benar staff.
  const { data: memberships } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", userId);
  const staffBusinesses = ((memberships ?? []) as { business_id: string; role: string }[])
    .filter((row) => row.role === "staff")
    .map((row) => row.business_id);
  if (staffBusinesses.length === 0) return null;

  const { data } = await supabase
    .from("member_photoboxes")
    .select("pin_hash, photobox_id, business_id")
    .eq("user_id", userId)
    .in("business_id", staffBusinesses)
    .not("pin_hash", "is", null)
    // Urutan deterministik: tanpa `order by`, subset 10 hash yang diperiksa
    // berubah-ubah saat staff punya lebih dari MAX_PIN_CANDIDATES assignment,
    // sehingga PIN yang sah bisa tiba-tiba ditolak.
    .order("photobox_id", { ascending: true })
    .limit(MAX_PIN_CANDIDATES);

  const rows = ((data ?? []) as { pin_hash: string | null; business_id: string | null }[]).filter(
    (row): row is { pin_hash: string; business_id: string } =>
      Boolean(row.pin_hash) && Boolean(row.business_id)
  );
  if (rows.length === 0) return null;

  for (const row of rows) {
    if (await verifyDevicePin(pin, row.pin_hash)) return { businessId: row.business_id };
  }
  return null;
}