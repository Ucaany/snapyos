import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { createPlan, listPlans } from "@/server/admin";

/** GET /api/v1/admin/plans — docs/08 §8.15, docs/10 §10.2. */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await listPlans()));
});

/** POST /api/v1/admin/plans — buat plan (harga/limit/fee/flags). */
export const POST = adminRawRoute(async ({ request }) => {
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await createPlan(body)), { status: 201 });
});
