"use server";

/**
 * Admin platform server actions — dipakai form UI /admin (docs/10).
 * Semua lewat guard requireAdmin (role=admin / ADMIN_EMAILS) + audit_logs.
 */

import { revalidatePath } from "next/cache";

import {
  toFormState,
  str,
  num,
  numDecimal,
  bool,
  intOrNull,
  uuidList,
  buildSettingsPayload,
} from "@/lib/form-state";
import type { AdminSettingsUpdateInput } from "@/lib/validators";
import type { FormState } from "@/server/auth-actions";
import {
  activateManually,
  attachSubscriptionAddOn,
  cancelSubscriptionAddOn,
  createAddOn,
  createAppRelease,
  createGlobalTemplate,
  createPlan,
  createBroadcast,
  createPromo,
  createTemplateCategory,
  createUser,
  deleteAppRelease,
  deleteAuditLogs,
  deleteBusiness,
  deleteGlobalTemplate,
  deleteTemplateCategory,
  deleteUser,
  dismissFailure,
  markRefunded,
  resendBroadcast,
  sendBroadcast,
  setAppReleaseActive,
  setGatewayEnabled,
  setGlobalTemplateActive,
  updateAddOn,
  updateAppRelease,
  updateBusiness,
  updateGlobalTemplate,
  updateGlobalTemplateLayout,
  uploadGlobalTemplateFile,
  uploadGlobalTemplateThumbnail,
  replaceGlobalTemplateFrame,
  updatePlan,
  updatePlatformSettings,
  updatePromo,
  updateSubscription,
  updateSupportTicketStatus,
  updateUser,
} from "@/server/admin";

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await updateUser(str(formData, "userId"), {
      status: (str(formData, "status") || undefined) as "active" | "suspended" | undefined,
      role: (str(formData, "role") || undefined) as "user" | "admin" | undefined,
    });
    refresh("/admin/users", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await createUser({
      name: str(formData, "name"),
      email: str(formData, "email"),
      password: str(formData, "password"),
      role: str(formData, "role") === "admin" ? "admin" : "user",
    });
    refresh("/admin/users", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function deleteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await deleteUser(str(formData, "userId"));
    refresh("/admin/users", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateBusinessAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await updateBusiness(str(formData, "businessId"), {
      status: str(formData, "status") === "suspended" ? "suspended" : "active",
    });
    refresh("/admin/businesses", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function deleteBusinessAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await deleteBusiness(str(formData, "businessId"));
    refresh("/admin/businesses", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function createPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    // Feature flags: hidden "false" + checkbox "true" per `feature_<key>`
    // (unchecked tetap terkirim). Symmetric dgn updatePlanAction.
    const features: Record<string, boolean> = {};
    for (const key of formData.keys()) {
      if (key.startsWith("feature_")) {
        features[key.slice(8)] = formData.getAll(key).includes("true");
      }
    }
    const flagKeys = Object.keys(features);
    await createPlan({
      code: str(formData, "code"),
      name: str(formData, "name"),
      price_monthly: num(formData, "price_monthly"),
      price_yearly: str(formData, "price_yearly") ? num(formData, "price_yearly") : null,
      billing_cycle: str(formData, "billing_cycle") === "yearly" ? "yearly" : "monthly",
      max_businesses: str(formData, "max_businesses") ? num(formData, "max_businesses") : undefined,
      max_outlets: num(formData, "max_outlets"),
      max_photoboxes: num(formData, "max_photoboxes"),
      max_concurrent_sessions: num(formData, "max_concurrent_sessions"),
      max_staff: num(formData, "max_staff"),
      storage_limit_mb: num(formData, "storage_limit_mb"),
      platform_fee_percent: numDecimal(formData, "platform_fee_percent"),
      platform_fee_flat: num(formData, "platform_fee_flat"),
      ...(flagKeys.length > 0 ? { features } : {}),
      is_active: formData.has("is_active") ? formData.getAll("is_active").includes("true") : true,
    });
    refresh("/admin/plans", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    // Feature flags: hidden "false" + checkbox "true" per `feature_<key>`
    // (unchecked tetap terkirim → clear-to-empty jalan) — H2/M4 audit (docs/02 §2.6, docs/10 §10.2).
    const features: Record<string, boolean> = {};
    for (const key of formData.keys()) {
      if (key.startsWith("feature_")) {
        features[key.slice(8)] = formData.getAll(key).includes("true");
      }
    }
    const flagKeys = Object.keys(features);
    const allOff = flagKeys.length > 0 && flagKeys.every((k) => !features[k]);
    await updatePlan(str(formData, "planId"), {
      name: str(formData, "name") || undefined,
      price_monthly: str(formData, "price_monthly") ? num(formData, "price_monthly") : undefined,
      price_yearly: str(formData, "price_yearly") ? num(formData, "price_yearly") : null,
      billing_cycle: str(formData, "billing_cycle")
        ? str(formData, "billing_cycle") === "yearly"
          ? "yearly"
          : "monthly"
        : undefined,
      max_businesses: str(formData, "max_businesses") ? num(formData, "max_businesses") : undefined,
      max_outlets: str(formData, "max_outlets") ? num(formData, "max_outlets") : undefined,
      max_photoboxes: str(formData, "max_photoboxes") ? num(formData, "max_photoboxes") : undefined,
      max_concurrent_sessions: str(formData, "max_concurrent_sessions")
        ? num(formData, "max_concurrent_sessions")
        : undefined,
      max_staff: str(formData, "max_staff") ? num(formData, "max_staff") : undefined,
      storage_limit_mb: str(formData, "storage_limit_mb")
        ? num(formData, "storage_limit_mb")
        : undefined,
      platform_fee_percent: str(formData, "platform_fee_percent")
        ? numDecimal(formData, "platform_fee_percent")
        : undefined,
      platform_fee_flat: str(formData, "platform_fee_flat")
        ? num(formData, "platform_fee_flat")
        : undefined,
      // Checkbox + hidden "false" (unchecked tetap terkirim) — H2 audit.
      is_active: formData.getAll("is_active").includes("true"),
      ...(flagKeys.length > 0 ? { features: allOff ? {} : features } : {}),
    });
    refresh("/admin/plans", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function createAddOnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await createAddOn({
      code: str(formData, "code"),
      name: str(formData, "name"),
      price_monthly: num(formData, "price_monthly"),
      unit: str(formData, "unit") || undefined,
      storage_mb: intOrNull(formData, "storage_mb"),
    });
    refresh("/admin/add-ons");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateAddOnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await updateAddOn(str(formData, "addOnId"), {
      name: str(formData, "name") || undefined,
      price_monthly: str(formData, "price_monthly") ? num(formData, "price_monthly") : undefined,
      unit: str(formData, "unit") || undefined,
      storage_mb: intOrNull(formData, "storage_mb"),
      // Checkbox + hidden "false" (unchecked tetap terkirim) — H2 audit.
      is_active: formData.getAll("is_active").includes("true"),
    });
    refresh("/admin/add-ons");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateSubscriptionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await updateSubscription(str(formData, "subscriptionId"), {
      status: (str(formData, "status") || undefined) as
        "trial" | "active" | "past_due" | "cancelled" | "expired" | undefined,
      extend_days: str(formData, "extend_days") ? num(formData, "extend_days") : undefined,
      cancel: formData.has("cancel"),
    });
    refresh("/admin/subscriptions", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function attachAddOnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await attachSubscriptionAddOn({
      subscription_id: str(formData, "subscription_id"),
      add_on_id: str(formData, "add_on_id"),
      quantity: num(formData, "quantity"),
    });
    refresh("/admin/subscriptions");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function cancelAddOnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await cancelSubscriptionAddOn(str(formData, "linkId"), {
      mode: (str(formData, "mode") || undefined) as "deferred" | "immediate" | undefined,
      manual_cancel_reason: str(formData, "manual_cancel_reason") || undefined,
    });
    refresh("/admin/subscriptions");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateSettingsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    // Halaman punya DUA form terpisah (global + gateway); buildSettingsPayload
    // hanya mengirim key yang ada di form ini supaya submit satu form tidak
    // menimpa toggle form lain (lihat tests/admin-settings-form.test.ts).
    const input = buildSettingsPayload(formData) as AdminSettingsUpdateInput;
    await updatePlatformSettings(input);
    refresh("/admin/settings", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await createTemplateCategory({
      name: str(formData, "name"),
      price: intOrNull(formData, "price"),
    });
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function deleteCategoryAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await deleteTemplateCategory(str(formData, "categoryId"));
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function toggleTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await setGlobalTemplateActive(str(formData, "templateId"), bool(formData, "active"));
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function deleteGlobalTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await deleteGlobalTemplate(str(formData, "templateId"));
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function createGlobalTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const file = formData.get("file");
    let fileUrl = str(formData, "file_url");
    if (file instanceof File && file.size > 0) {
      const { key } = await uploadGlobalTemplateFile(file);
      fileUrl = key;
    }
    if (!fileUrl) {
      return { fieldErrors: { file_url: ["URL frame atau file wajib diisi"] } };
    }
    await createGlobalTemplate({
      name: str(formData, "name"),
      category_id: str(formData, "category_id"),
      file_url: fileUrl,
      thumbnail_url: fileUrl,
      is_active: formData.has("is_active") ? formData.getAll("is_active").includes("true") : true,
      price: str(formData, "price") ? num(formData, "price") : null,
      is_premium: formData.getAll("is_premium").includes("true"),
    });
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function saveGlobalTemplateBuilderAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = str(formData, "id");
  const layoutRaw = str(formData, "layout");
  let layout: unknown;
  try {
    layout = layoutRaw ? JSON.parse(layoutRaw) : {};
  } catch {
    return { fieldErrors: { layout: ["Data layout tidak valid"] } };
  }
  const thumbnail = formData.get("thumbnail");
  const chromaFile = formData.get("chroma_file");
  try {
    await updateGlobalTemplateLayout(id, {
      layout,
      is_active: bool(formData, "is_active"),
    });
    if (thumbnail instanceof File && thumbnail.size > 0) {
      await uploadGlobalTemplateThumbnail(id, thumbnail);
    }
    if (chromaFile instanceof File && chromaFile.size > 0) {
      await replaceGlobalTemplateFrame(id, chromaFile);
    }
  } catch (error) {
    return toFormState(error);
  }
  refresh("/admin/templates", `/admin/templates/builder/${id}`);
  return { error: undefined };
}

export async function updateGlobalTemplateAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await updateGlobalTemplate(str(formData, "templateId"), {
      name: str(formData, "name") || undefined,
      price: str(formData, "price") ? num(formData, "price") : null,
      is_premium: formData.getAll("is_premium").includes("true"),
      is_active: formData.getAll("is_active").includes("true"),
    });
    refresh("/admin/templates");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Subscription promos (docs/10 §10.2, migration 0014)
// ---------------------------------------------------------------------------

function nullableNum(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** <input type=date> → ISO 8601 datetime start-of-day UTC, atau null. */
function nullableIsoDate(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  if (!v) return null;
  // Terima "YYYY-MM-DD" (dari <input type=date>) atau full ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00.000Z`;
  return v;
}

export async function createPromoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await createPromo({
      code: str(formData, "code"),
      type: str(formData, "type") === "fixed" ? "fixed" : "percentage",
      amount: num(formData, "amount"),
      min_transaction: str(formData, "min_transaction") ? num(formData, "min_transaction") : 0,
      max_discount: nullableNum(formData, "max_discount"),
      start_date: nullableIsoDate(formData, "start_date"),
      end_date: nullableIsoDate(formData, "end_date"),
      usage_limit: nullableNum(formData, "usage_limit"),
      is_active: formData.has("is_active") ? formData.getAll("is_active").includes("true") : true,
    });
    refresh("/admin/promos", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updatePromoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const patch: Record<string, unknown> = {
      is_active: formData.getAll("is_active").includes("true"),
    };
    const code = str(formData, "code");
    if (code) patch.code = code;
    const type = str(formData, "type");
    if (type) patch.type = type;
    if (str(formData, "amount")) patch.amount = num(formData, "amount");
    if (str(formData, "min_transaction")) patch.min_transaction = num(formData, "min_transaction");
    if (str(formData, "max_discount")) patch.max_discount = nullableNum(formData, "max_discount");
    if (str(formData, "start_date")) patch.start_date = nullableIsoDate(formData, "start_date");
    if (str(formData, "end_date")) patch.end_date = nullableIsoDate(formData, "end_date");
    if (str(formData, "usage_limit")) patch.usage_limit = nullableNum(formData, "usage_limit");
    await updatePromo(str(formData, "promoId"), patch);
    refresh("/admin/promos", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Subscription intent activation failures — /admin/subscriptions/pending-review
// (docs/02 §2.4b). Manual-review queue for paid invoices whose
// applyInvoiceIntent hit a silent early-return (owner cancel + cron race).
// ---------------------------------------------------------------------------

export async function activateIntentFailureAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await activateManually({
      failure_id: str(formData, "failureId"),
      note: str(formData, "note") || undefined,
    });
    refresh("/admin/subscriptions/pending-review", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function refundIntentFailureAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await markRefunded({
      failure_id: str(formData, "failureId"),
      note: str(formData, "note") || undefined,
    });
    refresh("/admin/subscriptions/pending-review", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function dismissIntentFailureAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await dismissFailure({
      failure_id: str(formData, "failureId"),
      note: str(formData, "note") || undefined,
    });
    refresh("/admin/subscriptions/pending-review", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Audit log — view + hapus riwayat (retensi).
// ---------------------------------------------------------------------------

export async function deleteAuditLogsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const ids = uuidList(formData, "ids");
    const before = str(formData, "before") || null;
    await deleteAuditLogs({ ids: ids.length > 0 ? ids : undefined, before });
    refresh("/admin/audit", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Payment gateway — toggle global per provider.
// ---------------------------------------------------------------------------

export async function toggleGatewayAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await setGatewayEnabled(str(formData, "provider"), bool(formData, "enabled"));
    refresh("/admin/gateways", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateSupportTicketStatusAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const status = str(formData, "status");
    await updateSupportTicketStatus(
      str(formData, "ticketId"),
      status as "open" | "needs_action" | "resolved"
    );
    refresh("/admin/support");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Broadcast email (marketing/pengumuman) — migration 0057.
// ---------------------------------------------------------------------------

export async function createBroadcastAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await createBroadcast({
      subject: str(formData, "subject"),
      body: str(formData, "body"),
      kind: (str(formData, "kind") || "announcement") as
        "announcement" | "promo" | "newsletter" | "event" | "system",
      template_key: (str(formData, "template_key") || "default") as
        "default" | "announcement" | "promo" | "newsletter" | "event" | "system",
      audience: (str(formData, "audience") || "all") as "all" | "users" | "owners",
      max_resend: str(formData, "max_resend") ? num(formData, "max_resend") : 3,
    });
    refresh("/admin/broadcasts", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function sendBroadcastAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await sendBroadcast(str(formData, "campaignId"));
    refresh("/admin/broadcasts", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function resendBroadcastAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await resendBroadcast(str(formData, "campaignId"));
    refresh("/admin/broadcasts", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

// ---------------------------------------------------------------------------
// Katalog aplikasi booth (tautan saja) — migration 0081.
// ---------------------------------------------------------------------------

/** Payload form rilis: field opsional kosong → null (bukan 0 / string kosong). */
function appReleasePayload(formData: FormData) {
  const size = intOrNull(formData, "file_size_bytes");
  return {
    version: str(formData, "version"),
    download_url: str(formData, "download_url"),
    file_name: str(formData, "file_name"),
    // NaN (bukan angka) dibiarkan lewat supaya Zod yang menolak dengan pesan field.
    file_size_bytes: size === null || size === undefined ? null : size,
    sha256: str(formData, "sha256") || null,
    release_notes: str(formData, "release_notes") || null,
  };
}

export async function createAppReleaseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await createAppRelease(appReleasePayload(formData));
    refresh("/admin/apps", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateAppReleaseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await updateAppRelease(str(formData, "releaseId"), {
      ...appReleasePayload(formData),
      is_active: bool(formData, "is_active"),
    });
    refresh("/admin/apps", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function toggleAppReleaseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await setAppReleaseActive(str(formData, "releaseId"), str(formData, "active") === "true");
    refresh("/admin/apps", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}

export async function deleteAppReleaseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await deleteAppRelease(str(formData, "releaseId"));
    refresh("/admin/apps", "/admin");
    return {};
  } catch (error) {
    return toFormState(error);
  }
}
