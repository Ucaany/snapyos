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
  let body: { business_id?: string; confirm_all?: boolean };
  try {
    body = (await request.json()) as { business_id?: string; confirm_all?: boolean };
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Body JSON tidak valid");
  }
  const businessId = typeof body.business_id === "string" ? body.business_id.trim() : null;

  if (businessId && !/^[0-9a-f-]{36}$/i.test(businessId)) {
    throw new ApiError("VALIDATION_ERROR", "business_id harus UUID valid");
  }

  if (businessId) {
    const result = await rotateCredentials(businessId);
    await audit(admin.id, "rotate_credentials", businessId, {
      total: result.total,
      rotated: result.rotated,
      errors: result.errors,
    });
    // Ada credential yang tidak terbaca → jangan balas 200 "sukses": admin
    // harus tahu rotasi tidak selesai dan tenant itu belum bisa bayar.
    return NextResponse.json(dataEnvelope(result), { status: result.errors > 0 ? 409 : 200 });
  }

  if (body.confirm_all !== true) {
    throw new ApiError("VALIDATION_ERROR", "Rotasi semua credential membutuhkan confirm_all=true");
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
