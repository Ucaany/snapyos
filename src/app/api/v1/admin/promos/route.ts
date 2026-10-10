import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { createPromo, listPromos } from "@/server/admin";

/** GET /api/v1/admin/promos — docs/10 §10.2 (migration 0014). */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await listPromos()));
});

/** POST /api/v1/admin/promos — buat kode promo subscription. */
export const POST = adminRawRoute(async ({ request }) => {
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await createPromo(body)), { status: 201 });
});
