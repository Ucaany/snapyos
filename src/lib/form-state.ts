import { ApiError } from "./api-errors.ts";
import type { FormState } from "@/server/auth-actions";

/**
 * Helper murni untuk server actions — BUKAN file "use server"
 * (Next.js: semua export file "use server" wajib async).
 * Satu-satunya definisi kanonis: semua salinan lokal di *-actions
 * sudah dihapus (audit Fase 3).
 */

export type ZodIssueLike = { path: PropertyKey[]; message: string };

export function fieldErrorsFromIssues(
  issues: ZodIssueLike[]
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function toFormState(
  error: unknown,
  fallback = "Terjadi kesalahan. Coba lagi."
): FormState {
  if (error instanceof ApiError) {
    return { error: error.message, fieldErrors: error.details as FormState["fieldErrors"] };
  }
  if (error && typeof error === "object" && "issues" in error) {
    return {
      fieldErrors: fieldErrorsFromIssues(
        (error as { issues: ZodIssueLike[] }).issues
      ),
    };
  }
  return { error: fallback };
}

export function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Integer dari form (IDR/limit). Membuang pemisah ribuan `1.500.000` → 1500000.
 * JANGAN dipakai untuk field desimal (mis. platform_fee_percent 2.5) — pakai
 * numDecimal(); pemisah titik di sini akan mengubah 2.5 → 25.
 */
export function num(formData: FormData, key: string): number {
  const raw = str(formData, key).replace(/[.\s]/g, "");
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Desimal dari form (mis. platform_fee_percent ber-step 0.5).
 * Normalisasi koma→titik, buang spasi; titik dipertahankan sebagai titik
 * desimal. `2.5` → 2.5, `2,5` → 2.5, `2` → 2.
 */
export function numDecimal(formData: FormData, key: string): number {
  const raw = str(formData, key).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function bool(formData: FormData, key: string): boolean {
  return formData
    .getAll(key)
    .some((v) => v === "on" || v === "true" || v === "1");
}

export function uuidList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
}

/** Integer opsional dari form: "" → null, invalid → NaN, float → trunc. */
export function intOrNull(
  formData: FormData,
  key: string
): number | null | undefined {
  const raw = str(formData, key);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

/**
 * Bangun payload platform settings dari FormData — HANYA untuk key yang benar
 * benar dikirim form. Halaman /admin/settings punya DUA form terpisah (global
 * + gateway); tanpa guard keberadaan, submit form global akan membaca toggle
 * gateway yang tidak hadir sebagai "false" dan menimpanya (dan sebaliknya).
 *
 * Murni (tanpa I/O) supaya bisa diuji; validasi tetap di adminSettingsUpdateSchema.
 */
export function buildSettingsPayload(
  formData: FormData
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const decimalKeys = new Set(["platform_fee_percent"]);
  const integerKeys = new Set(["platform_fee_flat", "default_retention_days", "trial_days"]);
  for (const key of decimalKeys) {
    if (formData.has(key)) {
      out[key] = str(formData, key) ? numDecimal(formData, key) : undefined;
    }
  }
  for (const key of integerKeys) {
    if (formData.has(key)) {
      out[key] = str(formData, key) ? num(formData, key) : undefined;
    }
  }
  if (formData.has("maintenance_mode")) {
    out.maintenance_mode = formData.getAll("maintenance_mode").includes("true");
  }
  if (formData.has("maintenance_message")) {
    out.maintenance_message = str(formData, "maintenance_message") || undefined;
  }
  if (formData.has("chroma_key_default_enabled")) {
    out.chroma_key_default_enabled = formData.getAll("chroma_key_default_enabled").includes("true");
  }
  for (const key of ["gateway_pakasir_enabled", "gateway_midtrans_enabled", "gateway_tripay_enabled"]) {
    if (formData.has(key)) {
      out[key] = formData.getAll(key).includes("true");
    }
  }
  return out;
}

/**
 * Bangun patch `checkout` dari FormData — HANYA key yang benar-benar dikirim form.
 * `qris_expiry_minutes` selalu wajib; `offline_enabled` HANYA bila field hadir,
 * supaya form QRIS (tanpa toggle offline) tidak menimpa toggle offline yang
 * diatur di tempat lain menjadi `false` (bug clobber jsonb checkout).
 * Murni (tanpa I/O) supaya bisa diuji; validasi range tetap di checkoutSettingsSchema.
 */
export function buildCheckoutPayload(
  formData: FormData
): { qris_expiry_minutes: number; offline_enabled?: boolean } {
  const minutes = Number(str(formData, "qris_expiry_minutes"));
  const out: { qris_expiry_minutes: number; offline_enabled?: boolean } = {
    qris_expiry_minutes: minutes,
  };
  if (formData.has("offline_enabled")) {
    out.offline_enabled = bool(formData, "offline_enabled");
  }
  return out;
}

/** Merge field-level objek `checkout` — update parsial tidak boleh wipe key lain. */
export function mergeCheckout(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(current ?? {}), ...patch };
}
