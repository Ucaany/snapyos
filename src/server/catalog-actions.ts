"use server";

/**
 * Server actions catalog: packages, templates, vouchers — docs/04 §4.9–4.11.
 */

import { revalidatePath } from "next/cache";
import { bool, num, str, toFormState, uuidList } from "@/lib/form-state";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import type { FormState } from "@/server/auth-actions";
import { createPackage, deletePackage, updatePackage } from "@/server/packages";
import {
  deleteTemplate,
  updateTemplate,
  uploadTemplate,
  uploadTemplateThumbnail,
  replaceTemplateFrame,
} from "@/server/templates";
import type { TemplateUpdateInput } from "@/lib/validators";
import { createVoucher, deleteVoucher, updateVoucher } from "@/server/vouchers";
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
    template_ids: uuidList(formData, "template_ids"),
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

  try {
    await uploadTemplate(ctx.user.id, ctx.businessId, file, {
      name,
      category: category as (typeof TEMPLATE_CATEGORIES)[number],
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/templates");
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
  try {
    await updateTemplate(ctx.user.id, ctx.businessId, id, {
      name: str(formData, "name") || undefined,
      category: TEMPLATE_CATEGORIES.includes(
        str(formData, "category") as (typeof TEMPLATE_CATEGORIES)[number]
      )
        ? (str(formData, "category") as (typeof TEMPLATE_CATEGORIES)[number])
        : undefined,
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
 * Simpan layout builder: draft (is_active=false) atau publish (true).
 * Layout divalidasi zod di updateTemplate (server = source of truth).
 * `thumbnail` = PNG opsional hasil TemplatePreview (auto thumbnail).
 */
export async function saveTemplateBuilderAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const id = str(formData, "id");
  const layoutRaw = str(formData, "layout");
  const thumbnail = formData.get("thumbnail");
  const chromaFile = formData.get("chroma_file");
  const isActive = bool(formData, "is_active");

  try {
    // Gerbang langganan WAJIB di dalam try: di luar try, ApiError 410 lolos ke
    // client sebagai 500 tanpa pesan yang bisa ditampilkan builder.
    await requireEffectiveSubscription(ctx.businessId, "write");
    if (!id) return { error: "Template tidak valid" };

    let layout: TemplateUpdateInput["layout"];
    try {
      layout = layoutRaw ? (JSON.parse(layoutRaw) as TemplateUpdateInput["layout"]) : null;
    } catch {
      return { fieldErrors: { layout: ["Data layout tidak valid"] } };
    }

    await updateTemplate(ctx.user.id, ctx.businessId, id, {
      layout,
      is_active: isActive,
    });
    if (thumbnail instanceof File && thumbnail.size > 0) {
      await uploadTemplateThumbnail(ctx.user.id, ctx.businessId, id, thumbnail);
    }
    if (chromaFile instanceof File && chromaFile.size > 0) {
      await replaceTemplateFrame(ctx.user.id, ctx.businessId, id, chromaFile);
    }
  } catch (error) {
    // Tanpa log ini kegagalan hanya terlihat sebagai state di browser.
    console.error(
      "[saveTemplateBuilder]",
      JSON.stringify({
        id,
        layoutBytes: layoutRaw.length,
        slots: (() => {
          try {
            const parsed = JSON.parse(layoutRaw) as { slots?: unknown[] };
            return Array.isArray(parsed?.slots) ? parsed.slots.length : null;
          } catch {
            return "unparsed";
          }
        })(),
        thumbnailBytes: thumbnail instanceof File ? thumbnail.size : 0,
        chromaBytes: chromaFile instanceof File ? chromaFile.size : 0,
        isActive,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    );
    return toFormState(error);
  }
  revalidatePath("/dashboard/templates");
  revalidatePath(`/dashboard/templates/builder/${id}`);
  return { error: undefined };
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
