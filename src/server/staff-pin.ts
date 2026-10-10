/**
 * PIN login staff (0043) — diverifikasi saat login, bebas dari siklus import
 * (auth.ts → tenant.ts → auth.ts). Dipakai src/lib/auth.ts (authorize) tanpa
 * menarik getMembership/tenant, dan src/server/staff.ts untuk set-PIN owner.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { verifyDevicePin } from "@/lib/device-token";

/** Booth (dengan PIN ter-set) yang bisa dipilih staff saat login — shell /staff. */
export async function listStaffLoginBooths(email: string): Promise<
  { photobox_id: string; name: string }[]
> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("member_photoboxes")
    .select("photobox_id, pin_hash, photoboxes ( name ), users!inner ( email )")
    .eq("users.email", email)
    .not("pin_hash", "is", null);
  return ((data ?? []) as {
    photobox_id: string;
    photoboxes: { name: string } | { name: string }[] | null;
  }[]).flatMap((row) => {
    const booth = Array.isArray(row.photoboxes) ? row.photoboxes[0] : row.photoboxes;
    if (!booth) return [];
    return [{ photobox_id: row.photobox_id, name: booth.name }];
  });
}

/** Verifikasi PIN login staff terhadap (member × booth). True = cocok. */
export async function verifyStaffPin(
  email: string,
  photoboxId: string,
  pin: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("member_photoboxes")
    .select("pin_hash, users!inner ( email )")
    .eq("users.email", email)
    .eq("photobox_id", photoboxId)
    .maybeSingle();
  const hash = (data as { pin_hash?: string | null } | null)?.pin_hash;
  if (!hash) return false;
  return verifyDevicePin(pin, hash);
}
