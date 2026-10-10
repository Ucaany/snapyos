import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { updateAddOn } from "@/server/admin";

/** PATCH /api/v1/admin/add-ons/:id — edit add-on / active-inactive (docs/10 §10.2). */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updateAddOn(id, body)));
});
