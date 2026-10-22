/**
 * Credential rotation — Bug #18 (docs/12 Phase 3).
 * Decrypt semua credential business dengan key lama, re-encrypt dengan key
 * terbaru (v2), update DB dalam satu transaksi (RPC atau batch).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { reEncrypt } from "@/server/payment/providers/encrypt";

type CredentialRow = {
  id: string;
  server_key_encrypted: string;
  metadata: Record<string, unknown> | null;
};

export async function rotateCredentials(
  businessId: string
): Promise<{ total: number; rotated: number }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payment_credentials")
    .select("id, server_key_encrypted, metadata")
    .eq("business_id", businessId);
  if (error) throw new Error(`Gagal memuat credential business=${businessId}: ${error.message}`);

  const rows = (data ?? []) as CredentialRow[];
  let rotated = 0;

  for (const row of rows) {
    const serverKey = reEncrypt(row.server_key_encrypted);

    let metadataChanged = false;
    const patchedMetadata = row.metadata ? { ...row.metadata } : null;

    if (
      patchedMetadata &&
      typeof patchedMetadata.private_key_encrypted === "string" &&
      patchedMetadata.private_key_encrypted
    ) {
      const pk = reEncrypt(patchedMetadata.private_key_encrypted as string);
      if (pk.rotated) {
        patchedMetadata.private_key_encrypted = pk.payload;
        metadataChanged = true;
      }
    }

    if (
      patchedMetadata &&
      typeof patchedMetadata.webhook_secret_encrypted === "string" &&
      patchedMetadata.webhook_secret_encrypted
    ) {
      const ws = reEncrypt(patchedMetadata.webhook_secret_encrypted as string);
      if (ws.rotated) {
        patchedMetadata.webhook_secret_encrypted = ws.payload;
        metadataChanged = true;
      }
    }

    if (!serverKey.rotated && !metadataChanged) continue;

    const patch: Record<string, unknown> = {};
    if (serverKey.rotated) patch.server_key_encrypted = serverKey.payload;
    if (metadataChanged) patch.metadata = patchedMetadata;

    const { error: updateErr } = await supabase
      .from("payment_credentials")
      .update(patch)
      .eq("id", row.id)
      .eq("business_id", businessId);
    if (updateErr) {
      throw new Error(
        `Gagal memperbarui credential=${row.id} business=${businessId}: ${updateErr.message}`
      );
    }
    rotated++;
  }

  return { total: rows.length, rotated };
}

export async function rotateAllCredentials(): Promise<{
  businesses: number;
  totalCredentials: number;
  rotated: number;
  errors: number;
}> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payment_credentials")
    .select("business_id")
    .order("business_id");
  if (error) throw new Error(`Gagal memuat daftar business: ${error.message}`);

  const bizIds = Array.from(
    new Set((data ?? []).map((r) => (r as { business_id: string }).business_id))
  );

  let totalCredentials = 0;
  let rotated = 0;
  let errors = 0;

  for (const bizId of bizIds) {
    try {
      const result = await rotateCredentials(bizId);
      totalCredentials += result.total;
      rotated += result.rotated;
    } catch (err) {
      errors++;
      console.error(
        `[rotate-credentials] gagal business=${bizId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { businesses: bizIds.length, totalCredentials, rotated, errors };
}
