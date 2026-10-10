import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { updatePlan } from "@/server/admin";

/** PATCH /api/v1/admin/plans/:id — edit harga/cycle/limit/fee/flags/active (docs/10 §10.2). */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updatePlan(id, body)));
});
