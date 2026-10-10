import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { createAddOn, listAddOns } from "@/server/admin";

/** GET /api/v1/admin/add-ons — docs/10 §10.2. */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await listAddOns()));
});

/** POST /api/v1/admin/add-ons — buat add-on (harga, unit). */
export const POST = adminRawRoute(async ({ request }) => {
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await createAddOn(body)), { status: 201 });
});
