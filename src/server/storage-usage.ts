/**
 * Storage usage per business — docs/09 (storage), keputusan #5 (storage add-on).
 * Kuota efektif = plan.storage_limit_mb + sum add-on aktif ber-storage_mb.
 *
 * Fase 5 (0062): pemakaian TIDAK lagi dihitung dengan recursive listing bucket
 * pada setiap upload/finalize (biaya linear jumlah objek → tidak scalable).
 * Sebagai gantinya, ledger `storage_objects` + counter `storage_usage` diperbarui
 * ATOMIK via RPC saat upload/delete sukses. Hot-path (getBusinessUsedBytes /
 * assertStorageAvailable) = SATU SELECT counter, O(1), tanpa listing bucket.
 *
 * Backfill initial usage: `scripts/backfill-storage-usage.mjs` (listing sekali,
 * bukan per-upload). Safety net: `getStorageUsage` (jalur tampilan) men-seed
 * counter dari listing sekali bila baris `storage_usage` bisnis belum ada.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { isMissingFunction } from "@/lib/supabase/errors";
import { isSubscriptionEffective } from "@/lib/subscription-math";
import { isFeatureEnabled } from "@/lib/feature-gate";
import { activeStorageProviders } from "@/server/storage";
import type { StorageBucket, StorageProvider } from "@/server/storage/types";
import { bytesToMb, mbToBytes, sumStorageAddOnMb } from "@/lib/storage-units";

const BUCKETS: StorageBucket[] = ["business-assets", "generated-photos"];

/**
 * Sum + kumpulkan objek (key, bytes) di bawah prefix rekursif — HANYA untuk
 * rekonsiliasi sekali (bukan hot-path upload). Lihat `reconcileUsedBytes`.
 */
async function collectFolderObjects(
  provider: StorageProvider,
  bucket: StorageBucket,
  prefix: string
): Promise<{ key: string; bytes: number }[]> {
  const out: { key: string; bytes: number }[] = [];
  const stack: string[] = [prefix];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const { data, error } = await provider.list(bucket, dir, { limit, offset });
      if (error) {
        console.error(`[storage-usage] list gagal bucket=${bucket} dir=${dir}:`, error.message);
        break;
      }
      const items = data ?? [];
      for (const it of items) {
        if (it.id) out.push({ key: `${dir}/${it.name}`, bytes: it.metadata?.size ?? 0 });
        else stack.push(`${dir}/${it.name}`);
      }
      offset += items.length;
      if (items.length < limit) break;
    }
  }
  return out;
}

/**
 * Seed ledger + counter sekali dari listing bucket untuk business yang belum
 * punya baris `storage_usage` (pra-migrasi sebelum backfill). Menulis SATU
 * ledger entry per objek nyata via RPC (idempotent) agar delete per-key berikutnya
 * mengurangi counter dengan benar. BUKAN hot-path — hanya dipicu dari jalur
 * tampilan saat baris counter absen.
 */
async function reconcileUsedBytes(businessId: string): Promise<number> {
  const providers = activeStorageProviders();
  let total = 0;
  for (const provider of providers) {
    for (const bucket of BUCKETS) {
      const objects = await collectFolderObjects(provider, bucket, businessId);
      for (const obj of objects) {
        await accountStorageAdd(businessId, bucket, obj.key, obj.bytes);
        total += obj.bytes;
      }
    }
  }
  return total;
}

/**
 * Pemakaian bytes business — SATU SELECT counter (O(1)), tanpa listing bucket.
 * `failOpen`: bila baris counter tidak ada → 0 (business belum pernah upload);
 * error kueri → 0 (failOpen) atau throw (failOpen=false, jalur enforcement).
 * `reconcileIfMissing`: jalur tampilan seed counter dari listing sekali bila
 * baris absen (pra-backfill). Hot-path upload TIDAK memakai ini.
 */
export async function getBusinessUsedBytes(
  businessId: string,
  failOpen = true,
  reconcileIfMissing = false
): Promise<number> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("storage_usage")
    .select("used_bytes")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    if (!failOpen) throw new Error(`[storage-usage] baca counter gagal: ${error.message}`);
    console.error(`[storage-usage] baca counter gagal business=${businessId}:`, error.message);
    return 0;
  }
  if (!data) {
    return reconcileIfMissing ? await reconcileUsedBytes(businessId) : 0;
  }
  const used = (data as { used_bytes?: number } | null)?.used_bytes;
  return typeof used === "number" && used > 0 ? used : 0;
}

/**
 * Catat bytes objek yang BERHASIL diupload ke akuntansi (idempotent per key).
 * Panggil HANYA setelah `provider.upload` sukses — upload gagal tak menambah.
 * Key = object key storage (unik) → retry upload key sama tak menggandakan.
 */
export async function accountStorageAdd(
  businessId: string,
  bucket: StorageBucket,
  key: string,
  bytes: number
): Promise<{ ok: boolean; error?: string; missing?: boolean }> {
  const size = Math.max(0, Math.floor(bytes));
  if (size === 0) return { ok: true };
  const supabase = createServerClient();
  const { error } = await supabase.rpc("storage_account_add", {
    p_business: businessId,
    p_key: key,
    p_bucket: bucket,
    p_bytes: size,
  });
  if (error) {
    // Accounting gagal tidak boleh menggagalkan upload yang sudah sukses —
    // log; backfill/rekonsiliasi menyusul. ponytail: retry queue bila perlu.
    // Hasil { ok:false } dikembalikan agar call-path yang butuh integritas
    // (retention) dapat menahan finalize; upload-path cukup mengabaikannya.
    // Klasifikasi: fungsi/tabel absen = misconfig (fail-open di pemanggil);
    // selain itu transien (tahan/retry).
    const missing = isMissingFunction(error);
    console.error(
      `[storage-usage] account_add gagal key=${key}${missing ? " (MISCONFIG: fungsi/tabel akuntansi absen)" : ""}:`,
      error.message
    );
    return { ok: false, error: error.message, missing };
  }
  return { ok: true };
}

/**
 * Catat bytes objek yang BERHASIL dihapus dari akuntansi (idempotent per key).
 * Panggil HANYA setelah delete storage sukses — delete gagal tak mengurangi.
 * Key tak ada di ledger = no-op (delete ganda aman); counter di-clamp ≥ 0.
 */
export async function accountStorageSub(
  businessId: string,
  keys: string[]
): Promise<{ ok: boolean; error?: string; missing?: boolean }> {
  const unique = Array.from(new Set(keys.filter((k) => typeof k === "string" && k.length > 0)));
  if (unique.length === 0) return { ok: true };
  const supabase = createServerClient();
  const { error } = await supabase.rpc("storage_account_sub", {
    p_business: businessId,
    p_keys: unique,
  });
  if (error) {
    // Kembalikan { ok:false } — pemanggil jalur retention WAJIB menahan
    // finalize agar baris photos + media_cleaned_at tetap ada dan retry run
    // berikutnya mengulang account_sub (ledger belum berkurang).
    // PGRST202 (fungsi absen) / PGRST205 (tabel absen) / pesan "does not exist"
    // / "schema cache" = migration belum diterapkan (MISCONFIG), bukan gangguan
    // transien. Tandai `missing` agar retention dapat fail-open (tetap bersihkan
    // media) alih-alih menahan sesi selamanya.
    const missing = isMissingFunction(error);
    console.error(
      `[storage-usage] account_sub gagal business=${businessId}${missing ? " (MISCONFIG: fungsi/tabel akuntansi absen)" : ""}:`,
      error.message
    );
    return { ok: false, error: error.message, missing };
  }
  return { ok: true };
}

export type StorageLimit = {
  planMb: number;
  addOnMb: number;
  totalMb: number;
};

/** Kuota storage efektif: plan + add-on storage aktif (date-aware). */
export async function getStorageLimit(businessId: string): Promise<StorageLimit> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("id, status, trial_ends_at, current_period_end, plans ( storage_limit_mb, features )")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type PlanRef = { storage_limit_mb: number | null; features: Record<string, boolean> | null };
  const row = data as {
    id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: PlanRef | PlanRef[] | null;
  } | null;

  // Fail-closed: kuota (plan + add-on) hanya dihitung bila subscription masih
  // efektif secara WAKTU. past_due lewat grace / expired → 0.
  const subscriptionEffective = Boolean(
    row && isSubscriptionEffective(row.status, row.trial_ends_at, row.current_period_end)
  );

  let planMb = 0;
  if (subscriptionEffective && row) {
    const plan = row.plans && !Array.isArray(row.plans) ? row.plans : null;
    // `storage` (fitur plan, docs/02 §2.7) hanya meng-gate kuota BASE plan.
    // Add-on `extra_storage` tetap dihitung di bawah — pembelian add-on tidak
    // boleh hangus karena plan tidak menyertakan storage base.
    if (isFeatureEnabled(plan?.features ?? null, "storage")) {
      if (plan && typeof plan.storage_limit_mb === "number") planMb = plan.storage_limit_mb;
    }
  }

  let addOnMb = 0;
  if (subscriptionEffective && row?.id) {
    const { data: addOns } = await supabase
      .from("subscription_add_ons")
      .select("quantity, add_ons!inner(storage_mb)")
      .eq("subscription_id", row.id)
      .eq("status", "active");
    const addOnRows = addOns as unknown as {
      quantity: number;
      add_ons: { storage_mb: number | null } | { storage_mb: number | null }[];
    }[];
    addOnMb = sumStorageAddOnMb(
      (addOnRows ?? []).map((a) => ({
        quantity: a.quantity,
        addOn: Array.isArray(a.add_ons) ? (a.add_ons[0] ?? null) : a.add_ons,
      }))
    );
  }

  return { planMb, addOnMb, totalMb: planMb + addOnMb };
}

export type StorageUsage = {
  usedBytes: number;
  limitBytes: number;
  usedMb: number;
  limitMb: number;
  remainingBytes: number;
  remainingMb: number;
  percent: number;
  isFull: boolean;
};

/**
 * Pemakaian + sisa storage untuk tampilan (settings owner / admin).
 * ⚠️ INTERNAL-ONLY: `businessId` harus server-derived / DIVERIFIKASI pemanggil
 * (mis. route memanggil getMembership dulu). TIDAK melakukan otorisasi sendiri
 * — memanggilnya dengan businessId dari input user = IDOR (M1).
 */
export async function getStorageUsage(businessId: string): Promise<StorageUsage> {
  const [usedBytes, limit] = await Promise.all([
    getBusinessUsedBytes(businessId, true, true),
    getStorageLimit(businessId),
  ]);
  const limitBytes = mbToBytes(limit.totalMb);
  const hasLimit = limitBytes > 0;
  return {
    usedBytes,
    limitBytes,
    usedMb: bytesToMb(usedBytes),
    limitMb: limit.totalMb,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    remainingMb: Math.max(0, limit.totalMb - bytesToMb(usedBytes)),
    // ponytail: tanpa kuota aktif (feature flag off / belum berlangganan),
    // percent=0 & isFull=false — jangan tampil "PENUH" palsu saat limit 0.
    percent: !hasLimit
      ? 0
      : usedBytes >= limitBytes
        ? 100
        : Math.min(99, Math.round((usedBytes / limitBytes) * 100)),
    isFull: hasLimit && usedBytes >= limitBytes,
  };
}

/**
 * Pemakaian + kuota untuk BANYAK business sekaligus (admin list — anti N+1).
 * TIDAK merekonsiliasi dari listing bucket (hot path tetap O(1)); bisnis tanpa
 * baris counter tampil 0 (backfill/cron yang mengisi). Kuota dihitung dari
 * subscription efektif + add-on dalam 2 query batch.
 */
export async function getStorageUsageBatch(
  businessIds: string[]
): Promise<Map<string, StorageUsage>> {
  const ids = Array.from(
    new Set(businessIds.filter((id) => typeof id === "string" && id.length > 0))
  );
  const out = new Map<string, StorageUsage>();
  if (ids.length === 0) return out;

  const supabase = createServerClient();
  const [{ data: usageRows }, { data: subs }] = await Promise.all([
    supabase.from("storage_usage").select("business_id, used_bytes").in("business_id", ids),
    supabase
      .from("subscriptions")
      .select(
        "id, business_id, status, trial_ends_at, current_period_end, plans ( storage_limit_mb, features )"
      )
      .in("business_id", ids)
      .in("status", ["trial", "active", "past_due"])
      .order("created_at", { ascending: false }),
  ]);

  const usedByBusiness = new Map<string, number>();
  for (const r of (usageRows ?? []) as { business_id: string; used_bytes: number }[]) {
    const v = typeof r.used_bytes === "number" && r.used_bytes > 0 ? r.used_bytes : 0;
    usedByBusiness.set(r.business_id, v);
  }

  // Ambil subscription terbaru per business (baris pertama menang dari order desc).
  type PlanRef = { storage_limit_mb: number | null; features: Record<string, boolean> | null };
  type SubRow = {
    id: string;
    business_id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: PlanRef | PlanRef[] | null;
  };
  const latestSub = new Map<string, SubRow>();
  for (const s of (subs ?? []) as unknown as SubRow[]) {
    if (!latestSub.has(s.business_id)) latestSub.set(s.business_id, s);
  }

  let addOnMbBySub = new Map<string, number>();
  const subIds = Array.from(latestSub.values()).map((s) => s.id);
  if (subIds.length > 0) {
    const { data: addOns } = await supabase
      .from("subscription_add_ons")
      .select("subscription_id, quantity, add_ons!inner(storage_mb)")
      .in("subscription_id", subIds)
      .eq("status", "active");
    const tally = new Map<string, number>();
    for (const a of (addOns ?? []) as unknown as {
      subscription_id: string;
      quantity: number;
      add_ons: { storage_mb: number | null } | { storage_mb: number | null }[];
    }[]) {
      const addOn = Array.isArray(a.add_ons) ? (a.add_ons[0] ?? null) : a.add_ons;
      const rowMb = sumStorageAddOnMb([{ quantity: a.quantity, addOn }]);
      if (rowMb > 0) tally.set(a.subscription_id, (tally.get(a.subscription_id) ?? 0) + rowMb);
    }
    addOnMbBySub = tally;
  }

  for (const id of ids) {
    const usedBytes = usedByBusiness.get(id) ?? 0;
    const sub = latestSub.get(id);
    // Fail-closed: plan DAN add-on hanya dihitung bila subscription efektif
    // secara waktu; expired/past-grace → 0 untuk keduanya.
    const subscriptionEffective = Boolean(
      sub && isSubscriptionEffective(sub.status, sub.trial_ends_at, sub.current_period_end)
    );
    let planMb = 0;
    if (subscriptionEffective && sub) {
      const plan = sub.plans && !Array.isArray(sub.plans) ? sub.plans : null;
      if (isFeatureEnabled(plan?.features ?? null, "storage")) {
        if (plan && typeof plan.storage_limit_mb === "number") planMb = plan.storage_limit_mb;
      }
    }
    const addOnMb = subscriptionEffective && sub ? (addOnMbBySub.get(sub.id) ?? 0) : 0;
    const limitBytes = mbToBytes(planMb + addOnMb);
    const hasLimit = limitBytes > 0;
    out.set(id, {
      usedBytes,
      limitBytes,
      usedMb: bytesToMb(usedBytes),
      limitMb: planMb + addOnMb,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      remainingMb: Math.max(0, planMb + addOnMb - bytesToMb(usedBytes)),
      percent: !hasLimit
        ? 0
        : usedBytes >= limitBytes
          ? 100
          : Math.min(99, Math.round((usedBytes / limitBytes) * 100)),
      isFull: hasLimit && usedBytes >= limitBytes,
    });
  }
  return out;
}

/** Hard-block upload/finalize saat kuota akan terlampaui (server-side). */
export async function assertStorageAvailable(
  businessId: string,
  incomingBytes: number
): Promise<void> {
  const extra = Math.max(0, Math.floor(incomingBytes));
  if (extra === 0) return;
  const [usedBytes, limit] = await Promise.all([
    getBusinessUsedBytes(businessId, false),
    getStorageLimit(businessId),
  ]);
  // Kuota 0 = storage tak aktif di plan (docs/02 §2.7) — blokir dengan pesan
  // akurat, bukan "penuh" (konsisten dengan getStorageUsage yang menampilkan
  // 0% bukan PENUH saat limit 0).
  if (limit.totalMb <= 0) {
    throw new ApiError(
      "STORAGE_UNAVAILABLE",
      "Storage tidak termasuk dalam plan Anda. Upgrade subscription untuk mengaktifkan penyimpanan."
    );
  }
  if (usedBytes + extra > mbToBytes(limit.totalMb)) {
    throw new ApiError(
      "STORAGE_FULL",
      "Penyimpanan penuh. Upgrade plan atau tambah add-on storage untuk melanjutkan."
    );
  }
}

/**
 * Rekonsiliasi storage business — cron scheduled (Bug #12).
 * Listing bucket lalu seed/update ledger + counter via RPC idempotent.
 * Aman dipanggil ulang: accountStorageAdd per key idempotent.
 */
export async function reconcileBusinessStorage(businessId: string): Promise<number> {
  return reconcileUsedBytes(businessId);
}
