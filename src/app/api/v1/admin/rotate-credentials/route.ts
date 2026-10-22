import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { rotateCredentials, rotateAllCredentials } from "@/server/credential-rotation";
import { audit } from "@/server/admin/guard";

/**
 * POST /api/v1/admin/rotate-credentials — Bug #18 credential rotation.
 * Body: { business_id?: string }
 * - business_id dikirim → rotasi credential bisnis tersebut.
 * - tanpa business_id → rotasi SEMUA credential (batch).
 * Admin-only; hasil dicatat di audit_logs.
 */
export const POST = adminRawRoute(async ({ admin, request }) => {
  const body = await request.json().catch(() => ({})) as { business_id?: string };
  const businessId = typeof body.business_id === "string" ? body.business_id.trim() : null;

  if (businessId && !/^[0-9a-f-]{36}$/i.test(businessId)) {
    throw new ApiError("VALIDATION_ERROR", "business_id harus UUID valid");
  }

  if (businessId) {
    const result = await rotateCredentials(businessId);
    await audit(admin.id, "rotate_credentials", businessId, {
      total: result.total,
      rotated: result.rotated,
    });
    return NextResponse.json(dataEnvelope(result));
  }

  const result = await rotateAllCredentials();
  await audit(admin.id, "rotate_credentials_all", null, {
    businesses: result.businesses,
    totalCredentials: result.totalCredentials,
    rotated: result.rotated,
    errors: result.errors,
  });
  return NextResponse.json(dataEnvelope(result));
});
