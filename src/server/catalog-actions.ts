"use server";

/**
 * Server actions catalog: packages, templates, vouchers — docs/04 §4.9–4.11.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, num, str, toFormState, uuidList } from "@/lib/form-state";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import type { FormState } from "@/server/auth-actions";
import { createPackage, deletePackage, duplicatePackage, updatePackage } from "@/server/packages";
import {
  deleteTemplate,
  duplicateTemplate,
  saveTemplateLayout,
  updateTemplate,
  uploadTemplate,
} from "@/server/templates";
import { createVoucher, deleteVoucher, updateVoucher } from "@/server/vouchers";
import { extractFrameChromaSlots } from "@/server/template-chroma";
import { TEMPLATE_CATEGORIES } from "@/lib/validators";

// --- PACKAGES (docs/04 §4.9) ---

function packageInput(formData: FormData) {
  return {
    name: str(formData, "name"),
    price: num(formData, "price"),
    photo_count: num(formData, "photo_count"),
    print_count: num(formData, "print_count"),
    digital_output: bool(formData, "digital_output"),
    capture_mode: (str(formData, "capture_mode") || "single") as "single" | "burst" | "photostrip",
    description: str(formData, "description") || undefined,
    is_active: bool(formData, "is_active"),
    outlet_ids: uuidList(formData, "outlet_ids"),
    photobox_ids: uuidList(formData, "photobox_ids"),
  };
}

export async function createPackageAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  try {
    await createPackage(ctx.user.id, ctx.businessId, packageInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/packages");
  return { error: undefined };
}

export async function updatePackageAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  const id = str(formData, "id");
  if (!id) return { error: "Package tidak valid" };
  try {
    await updatePackage(ctx.user.id, ctx.businessId, id, packageInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/packages");
  return { error: undefined };
}

export async function deletePackageAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deletePackage(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menghapus paket. Coba lagi.");
  }
  revalidatePath("/dashboard/packages");
  return { error: undefined };
}

/**
 * Duplikat paket sebagai draft nonaktif. Pola sama dengan `deletePackageAction`:
 * id dari formData, error diteruskan ke FormState, revalidate halaman paket.
 */
export async function duplicatePackageAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await duplicatePackage(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menduplikasi paket. Coba lagi.");
  }
  revalidatePath("/dashboard/packages");
  return { error: undefined };
}

// --- TEMPLATES (docs/04 §4.10) ---

export async function uploadTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");

  const file = formData.get("file");
  const name = str(formData, "name");
  const category = str(formData, "category");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: ["File frame wajib diunggah"] } };
  }
  if (!TEMPLATE_CATEGORIES.includes(category as (typeof TEMPLATE_CATEGORIES)[number])) {
    return { fieldErrors: { category: ["Kategori tidak valid"] } };
  }

  const publish = bool(formData, "publish");
  let createdId: string | null = null;
  try {
    const created = await uploadTemplate(ctx.user.id, ctx.businessId, file, {
      name,
      category: category as (typeof TEMPLATE_CATEGORIES)[number],
      is_active: publish,
    });
    createdId = created.id as string;
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/templates");
  // redirect di luar try/catch — NEXT_REDIRECT tidak boleh tertelan catch.
  if (createdId) redirect(`/dashboard/templates/builder/${createdId}`);
  return { error: undefined };
}

export async function updateTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  const id = str(formData, "id");
  if (!id) return { error: "Template tidak valid" };
  const categoryRaw = str(formData, "category");
  if (
    categoryRaw &&
    !TEMPLATE_CATEGORIES.includes(categoryRaw as (typeof TEMPLATE_CATEGORIES)[number])
  ) {
    return { fieldErrors: { category: ["Kategori tidak valid"] } };
  }
  try {
    await updateTemplate(ctx.user.id, ctx.businessId, id, {
      name: str(formData, "name") || undefined,
      category: categoryRaw ? (categoryRaw as (typeof TEMPLATE_CATEGORIES)[number]) : undefined,
      is_active: bool(formData, "is_active"),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/templates");
  return { error: undefined };
}

export async function deleteTemplateAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deleteTemplate(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menghapus template. Coba lagi.");
  }
  revalidatePath("/dashboard/templates");
  return { error: undefined };
}

// --- TEMPLATE BUILDER (docs/15 §15.3) ---

/**
 * Simpan layout builder: draft (publish=false) atau publish (true).
 * Layout divalidasi zod di saveTemplateLayout (server = source of truth).
 */
export async function saveTemplateLayoutAction(
  templateId: string,
  layout: unknown,
  publish: boolean
): Promise<{ error?: string; fieldErrors?: Record<string, string[]> }> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (typeof templateId !== "string" || !templateId.trim()) {
    return { fieldErrors: { templateId: ["Template tidak valid"] } };
  }
  try {
    // Gerbang langganan WAJIB di dalam try: di luar try, ApiError 410 lolos ke
    // client sebagai 500 tanpa pesan yang bisa ditampilkan builder.
    await requireEffectiveSubscription(ctx.businessId, "write");
    await saveTemplateLayout(ctx.user.id, ctx.businessId, templateId, layout, publish);
  } catch (error) {
    return toFormState(error) as { error?: string; fieldErrors?: Record<string, string[]> };
  }
  revalidatePath("/dashboard/templates");
  revalidatePath("/dashboard/packages");
  return { error: undefined };
}

/**
 * Duplikat template (frame + layout) jadi template baru milik business ini.
 * Dipakai tombol "Duplikat template" di builder — template platform read-only
 * tetap tidak tersentuh.
 */
export async function duplicateTemplateAction(templateId: string): Promise<{
  templateId?: string;
  error?: string;
}> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  if (typeof templateId !== "string" || !templateId.trim()) {
    return { error: "Template tidak valid" };
  }
  try {
    const created = await duplicateTemplate(ctx.user.id, ctx.businessId, templateId);
    revalidatePath("/dashboard/templates");
    return { templateId: created.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Gagal menduplikasi template." };
  }
}

/**
 * Deteksi area hijau frame → slot mask (docs/15 §15.3). Tidak publish:
 * `is_active` tidak disentuh, builder tetap harus simpan/publish eksplisit.
 */
export async function detectTemplateChromaSlotsAction(templateId: string): Promise<{
  layout?: unknown;
  frameUrl?: string | null;
  skipped?: number;
  error?: string;
}> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  if (typeof templateId !== "string" || !templateId.trim()) {
    return { error: "Template tidak valid" };
  }
  let result: Awaited<ReturnType<typeof extractFrameChromaSlots>>;
  try {
    result = await extractFrameChromaSlots(ctx.user.id, ctx.businessId, templateId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Deteksi gagal" };
  }
  revalidatePath("/dashboard/templates");
  revalidatePath(`/dashboard/templates/builder/${templateId}`);
  return { layout: result.layout, frameUrl: result.frameUrl, skipped: result.skipped };
}

// --- VOUCHERS (docs/04 §4.11) ---
function voucherInput(formData: FormData) {
  const toIso = (key: string) => {
    const v = str(formData, key);
    return v ? new Date(v).toISOString() : null;
  };
  const usageLimit = str(formData, "usage_limit");
  const maxDiscount = str(formData, "max_discount");
  return {
    code: str(formData, "code"),
    type: (str(formData, "type") || "percentage") as "percentage" | "fixed",
    amount: num(formData, "amount"),
    start_date: toIso("start_date"),
    end_date: toIso("end_date"),
    usage_limit: usageLimit ? num(formData, "usage_limit") : null,
    usage_per_customer: num(formData, "usage_per_customer") || 1,
    min_transaction: num(formData, "min_transaction") || 0,
    max_discount: maxDiscount ? num(formData, "max_discount") : null,
    is_active: bool(formData, "is_active"),
    package_ids: uuidList(formData, "package_ids"),
    outlet_ids: uuidList(formData, "outlet_ids"),
  };
}

export async function createVoucherAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  try {
    await createVoucher(ctx.user.id, ctx.businessId, voucherInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/vouchers");
  return { error: undefined };
}

export async function updateVoucherAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  const id = str(formData, "id");
  if (!id) return { error: "Voucher tidak valid" };
  try {
    await updateVoucher(ctx.user.id, ctx.businessId, id, voucherInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/vouchers");
  return { error: undefined };
}

export async function deleteVoucherAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deleteVoucher(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menghapus voucher. Coba lagi.");
  }
  revalidatePath("/dashboard/vouchers");
  return { error: undefined };
}
