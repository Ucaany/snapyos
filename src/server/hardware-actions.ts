"use server";

/**
 * Setelan hardware per-booth dari dashboard — printer (foto/thermal/struk),
 * kamera, dan template default (docs/04 §4.6, docs/05 §5.15).
 *
 * Panel PIN booth (`PUT /v1/settings` → `updateDeviceSettings`) tetap jalur tulis
 * mesin yang sah; aksi di sini adalah override owner/manager dari cloud. Keduanya
 * menulis kolom yang sama, jadi tidak ada dua sumber kebenaran berbeda.
 */

import { revalidatePath } from "next/cache";

import { toFormState } from "@/lib/form-state";
import { invalidTemplateIds, type AssignableTemplateRow } from "@/lib/template-assignment";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  photoboxHardwareSchema,
  printTestReportSchema,
  type PhotoboxHardwareInput,
  type PrintTestReportInput,
} from "@/lib/validators";
import type { FormState } from "@/server/auth-actions";
import { insertAudit } from "@/server/audit";
import { invalidatePublicConfig } from "@/server/public-config";
import { requireEffectiveSubscription } from "@/server/require-subscription";

type Ctx = { userId: string; businessId: string; role: "owner" | "manager" | "staff" };

async function requireHardwareWriter(): Promise<Ctx | null> {
  const user = await requireUser();
  if (!user) return null;
  const active = await getActiveBusiness(user.id);
  if (!active) return null;
  return {
    userId: user.id,
    businessId: active.business.id,
    role: active.role as Ctx["role"],
  };
}

function assertCanWrite(ctx: Ctx) {
  if (!can(ctx.role, "photobox:write")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengubah hardware booth");
  }
}

/**
 * Template default harus assignable untuk business ini: milik sendiri, atau
 * global aktif & (gratis / sudah dibeli). Keputusan memakai `invalidTemplateIds`
 * (aturan murni bersama dengan assignment paket) supaya booth tidak bisa
 * menunjuk template yang tidak akan pernah tampil di kiosk.
 */
async function assertTemplateAssignable(businessId: string, templateId: string) {
  const supabase = createServerClient();
  const [{ data: rows }, { data: purchases }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, business_id, is_active, is_premium, price")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("business_template_purchases")
      .select("template_id")
      .eq("business_id", businessId),
  ]);
  const purchased = new Set(
    ((purchases ?? []) as { template_id: string }[]).map((row) => row.template_id)
  );
  const invalid = invalidTemplateIds(
    (rows ? [rows] : []) as AssignableTemplateRow[],
    businessId,
    purchased,
    [templateId]
  );
  if (invalid.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Template default tidak tersedia untuk business ini (nonaktif/belum dibeli)",
      { default_template_id: ["Template tidak tersedia untuk business ini"] }
    );
  }
}

/**
 * `bridge_url` divalidasi sebagai URL, jadi string kosong dari input harus
 * dibuang (bukan "URL invalid"): kosong berarti tetap memakai default runtime.
 */
function withoutBlankBridgeUrl<T extends Record<string, unknown>>(value: T): T {
  if (typeof value.bridge_url !== "string" || value.bridge_url.trim() !== "") return value;
  const { bridge_url: _blank, ...rest } = value;
  return rest as T;
}

/**
 * Simpan setelan hardware satu booth. Merge per-key: grup yang tidak dikirim
 * tidak berubah, dan `photo`/`thermal`/`receipt` digabung sedalam satu level
 * supaya form struk tidak menghapus setelan printer foto.
 */
export async function savePhotoboxHardwareAction(input: PhotoboxHardwareInput): Promise<FormState> {
  const ctx = await requireHardwareWriter();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };

  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    assertCanWrite(ctx);
    const parsed = photoboxHardwareSchema.parse({
      ...input,
      print_settings: input.print_settings
        ? {
            ...(input.print_settings.photo
              ? { photo: withoutBlankBridgeUrl(input.print_settings.photo) }
              : {}),
            ...(input.print_settings.thermal ? { thermal: input.print_settings.thermal } : {}),
            ...(input.print_settings.receipt ? { receipt: input.print_settings.receipt } : {}),
          }
        : undefined,
      camera_settings: input.camera_settings
        ? (withoutBlankBridgeUrl(input.camera_settings) as typeof input.camera_settings)
        : undefined,
    });

    const supabase = createServerClient();
    const { data: current, error: readError } = await supabase
      .from("photoboxes")
      .select("id, camera_settings, print_settings, session_settings")
      .eq("id", parsed.photobox_id)
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (readError) throw new ApiError("INTERNAL", "Gagal memuat setelan booth");
    if (!current) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
    if (parsed.default_template_id) {
      await assertTemplateAssignable(ctx.businessId, parsed.default_template_id);
    }

    const row = current as {
      camera_settings: Record<string, unknown> | null;
      print_settings: Record<string, unknown> | null;
      session_settings: Record<string, unknown> | null;
    };
    const patch: Record<string, unknown> = {};

    if (parsed.print_settings) {
      const prior = (row.print_settings ?? {}) as Record<string, unknown>;
      const print = { ...prior };
      for (const group of ["photo", "thermal", "receipt"] as const) {
        const incoming = parsed.print_settings[group];
        if (!incoming) continue;
        const base =
          prior[group] && typeof prior[group] === "object"
            ? (prior[group] as Record<string, unknown>)
            : {};
        print[group] = { ...base, ...incoming };
      }
      // Mirror ke field datar: kiosk (`resolvePrintMode`, PrintTestPanel,
      // print-layout) membaca `print_settings.mode`/`printer_name`/
      // `paper_size`, bukan sub-objek. Tanpa mirror, setelan di halaman ini
      // tersimpan tapi tidak pernah dipakai booth.
      const photo = print.photo as Record<string, unknown> | undefined;
      const thermal = print.thermal as Record<string, unknown> | undefined;
      if (photo) {
        for (const key of [
          "mode",
          "printer_name",
          "paper_size",
          "orientation",
          "fit",
          "margins_mm",
          "media_name",
          "strip_2up",
          "auto_print",
          "enabled",
        ]) {
          if (photo[key] !== undefined) print[key] = photo[key];
        }
      }
      if (thermal) {
        if (thermal.paper_width_mm !== undefined) {
          print.bluetooth_paper_width_mm = thermal.paper_width_mm;
        }
        if (thermal.bluetooth_device_name !== undefined) {
          print.bluetooth_device_name = thermal.bluetooth_device_name;
        }
      }
      patch.print_settings = print;
    }
    if (parsed.camera_settings) {
      patch.camera_settings = {
        ...((row.camera_settings ?? {}) as Record<string, unknown>),
        ...parsed.camera_settings,
      };
    }
    if (parsed.session_settings) {
      patch.session_settings = {
        ...((row.session_settings ?? {}) as Record<string, unknown>),
        ...parsed.session_settings,
      };
    }
    if (parsed.default_template_id !== undefined) {
      patch.default_template_id = parsed.default_template_id;
    }

    if (Object.keys(patch).length === 0) return { error: undefined };

    const { error } = await supabase
      .from("photoboxes")
      .update(patch)
      .eq("id", parsed.photobox_id)
      .eq("business_id", ctx.businessId);
    if (error) throw new ApiError("INTERNAL", "Gagal menyimpan setelan hardware");

    invalidatePublicConfig(ctx.businessId);
    await insertAudit({
      actorId: ctx.userId,
      businessId: ctx.businessId,
      action: "photobox.hardware.update",
      target: parsed.photobox_id,
      meta: { fields: Object.keys(patch) },
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/photoboxes");
  return { error: undefined };
}

/**
 * Simpan hasil uji cetak fisik dari dashboard ke
 * `photoboxes.device_status.printer`. Browser tidak bisa membaca hasil kertas,
 * jadi `confirmed` selalu berasal dari konfirmasi petugas.
 */
export async function reportPrintTestAction(input: PrintTestReportInput): Promise<FormState> {
  const ctx = await requireHardwareWriter();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };

  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    assertCanWrite(ctx);
    const parsed = printTestReportSchema.parse(input);

    const supabase = createServerClient();
    const { data: current, error: readError } = await supabase
      .from("photoboxes")
      .select("id, device_status")
      .eq("id", parsed.photobox_id)
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (readError) throw new ApiError("INTERNAL", "Gagal memuat status booth");
    if (!current) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");

    const status = ((current as { device_status: Record<string, unknown> | null }).device_status ??
      {}) as Record<string, unknown>;
    const printer = {
      ...((status.printer as Record<string, unknown> | undefined) ?? {}),
      confirmed: parsed.confirmed,
      last_test_at: new Date().toISOString(),
      mode: parsed.mode,
      ...(parsed.device_name ? { device_name: parsed.device_name } : {}),
      reported_by: "dashboard",
    };

    const { error } = await supabase
      .from("photoboxes")
      .update({ device_status: { ...status, printer } })
      .eq("id", parsed.photobox_id)
      .eq("business_id", ctx.businessId);
    if (error) throw new ApiError("INTERNAL", "Gagal menyimpan hasil uji cetak");

    invalidatePublicConfig(ctx.businessId);
    await insertAudit({
      actorId: ctx.userId,
      businessId: ctx.businessId,
      action: "photobox.print_test.report",
      target: parsed.photobox_id,
      meta: { confirmed: parsed.confirmed, mode: parsed.mode },
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/photoboxes");
  return { error: undefined };
}
