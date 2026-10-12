import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { deleteGlobalTemplate, setGlobalTemplateActive } from "@/server/admin";

/**
 * PATCH /api/v1/admin/templates/:id — toggle is_active template global.
 * Body: { is_active: boolean }
 */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = (await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  })) as { is_active?: unknown };
  if (typeof body.is_active !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", "Field `is_active` (boolean) wajib");
  }
  return NextResponse.json(dataEnvelope(await setGlobalTemplateActive(id, body.is_active)));
});

/**
 * DELETE /api/v1/admin/templates/:id — hapus template global + blob storage.
 * Cascade ke business_template_purchases; frame/thumbnail dibersihkan.
 */
export const DELETE = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await deleteGlobalTemplate(id)));
});
