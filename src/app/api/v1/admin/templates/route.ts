import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { createGlobalTemplate, listGlobalTemplates } from "@/server/admin";

/**
 * GET /api/v1/admin/templates — list template global (docs/10 §10.2).
 * Hanya template dengan business_id NULL.
 */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await listGlobalTemplates()));
});

/**
 * POST /api/v1/admin/templates — create template global.
 * Body: { name, category_id, file_url, thumbnail_url?, is_active? }
 */
export const POST = adminRawRoute(async ({ request }) => {
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await createGlobalTemplate(body)), { status: 201 });
});
