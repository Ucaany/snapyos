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
 * Verifikasi PIN login staff TANPA mengungkap daftar booth ke browser.
 * `photoboxId` opsional: bila klien lama masih mengirimnya, verifikasi hanya
 * assignment itu; bila tidak, semua assignment PIN milik email dicoba (dibatasi
 * MAX_PIN_CANDIDATES) sehingga halaman login tidak perlu enumerasi booth.
 */
export async function verifyStaffPin(
  email: string,
  pin: string,
  photoboxId?: string | null
): Promise<boolean> {
  const supabase = createServerClient();
  let query = supabase
    .from("member_photoboxes")
    .select("pin_hash, users!inner ( email )")
    .eq("users.email", email)
    .not("pin_hash", "is", null)
    .limit(MAX_PIN_CANDIDATES);
  if (photoboxId) query = query.eq("photobox_id", photoboxId);

  const { data } = await query;
  const hashes = ((data ?? []) as { pin_hash: string | null }[])
    .map((row) => row.pin_hash)
    .filter((hash): hash is string => Boolean(hash));
  if (hashes.length === 0) return false;

  for (const hash of hashes) {
    if (await verifyDevicePin(pin, hash)) return true;
  }
  return false;
}
