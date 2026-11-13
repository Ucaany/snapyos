/**
 * Penyimpanan token auth (AUTH-03 undangan staff, AUTH-01 reset password).
 * Semua token disimpan sebagai hash; plaintext hanya dikembalikan ke pemanggil
 * untuk dikirim lewat email.
 */

import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  generateAuthToken,
  hashAuthToken,
  isAuthTokenUsable,
  PASSWORD_RESET_TTL_MS,
  STAFF_INVITATION_TTL_MS,
} from "@/lib/auth-tokens";

type InvitationRow = {
  id: string;
  business_id: string;
  email: string;
  role: "manager" | "staff";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  businesses: { name: string; status: string } | { name: string; status: string }[] | null;
};

export type StaffInvitationLookup =
  | { ok: true; invitation: { id: string; businessId: string; businessName: string; email: string; role: "manager" | "staff"; expiresAt: string } }
  | { ok: false; reason: "invalid" | "expired" | "used" | "revoked" | "business" };

export async function createStaffInvitation(input: {
  businessId: string;
  email: string;
  role: "manager" | "staff";
  invitedBy: string;
}): Promise<{ token: string; id: string; expiresAt: string }> {
  const supabase = createServerClient();
  const token = generateAuthToken();
  const expiresAt = new Date(Date.now() + STAFF_INVITATION_TTL_MS).toISOString();

  // Satu undangan pending per (business, email). Undangan lama direvoke agar
  // tautan lama berhenti berlaku dan partial unique index tidak bentrok.
  const nowIso = new Date().toISOString();
  await supabase
    .from("staff_invitations")
    .update({ revoked_at: nowIso })
    .eq("business_id", input.businessId)
    .eq("email", input.email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { data, error } = await supabase
    .from("staff_invitations")
    .insert({
      business_id: input.businessId,
      email: input.email,
      role: input.role,
      token_hash: hashAuthToken(token),
      invited_by: input.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Gagal membuat undangan staff");
  return { token, id: (data as { id: string }).id, expiresAt };
}

export async function markInvitationDelivery(
  invitationId: string,
  result: { ok: boolean; error?: string }
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("staff_invitations")
    .update({
      delivery_status: result.ok ? "sent" : "failed",
      delivery_error: result.ok ? null : (result.error ?? "unknown").slice(0, 500),
    })
    .eq("id", invitationId);
}

export async function lookupStaffInvitation(token: string): Promise<StaffInvitationLookup> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("staff_invitations")
    .select(
      "id, business_id, email, role, expires_at, accepted_at, revoked_at, businesses ( name, status )"
    )
    .eq("token_hash", hashAuthToken(token))
    .maybeSingle();

  if (!data) return { ok: false, reason: "invalid" };
  const row = data as InvitationRow;
  if (row.accepted_at) return { ok: false, reason: "used" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (!isAuthTokenUsable(row)) return { ok: false, reason: "expired" };

  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  if (!business || business.status !== "active") return { ok: false, reason: "business" };
  return {
    ok: true,
    invitation: {
      id: row.id,
      businessId: row.business_id,
      businessName: business.name,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
    },
  };
}

/** Konsumsi atomik: hanya satu request yang bisa menandai accepted. */
export async function claimStaffInvitation(invitationId: string, userId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("staff_invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function revokeStaffInvitation(
  businessId: string,
  invitationId: string,
  actorId: string
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("staff_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("business_id", businessId)
    .is("accepted_at", null);
  void actorId;
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function createPasswordResetToken(
  userId: string,
  requestedIp: string | null
): Promise<{ token: string; expiresAt: string }> {
  const supabase = createServerClient();
  const token = generateAuthToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  // Invalidasi token lama yang belum dipakai: hanya token terbaru yang sah.
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const { error } = await supabase.from("password_reset_tokens").insert({
    user_id: userId,
    token_hash: hashAuthToken(token),
    expires_at: expiresAt,
    requested_ip: requestedIp,
  });
  if (error) throw new Error("Gagal membuat token reset password");
  return { token, expiresAt };
}

/**
 * Konsumsi token reset secara atomik. Return user_id hanya sekali; pemakaian
 * kedua (termasuk request paralel) mendapat null.
 */
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hashAuthToken(token))
    .maybeSingle();

  if (!data) return null;
  const row = data as { id: string; user_id: string; expires_at: string; used_at: string | null };
  if (!isAuthTokenUsable(row)) return null;

  const { data: claimed } = await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("user_id")
    .maybeSingle();
  return claimed ? row.user_id : null;
}
