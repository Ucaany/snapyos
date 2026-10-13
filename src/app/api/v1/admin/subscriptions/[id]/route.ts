import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { getSubscription, updateSubscription } from "@/server/admin";

/** GET /api/v1/admin/subscriptions/:id — detail subscription (docs/10 §10.2). */
export const GET = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await getSubscription(id)));
});

/** PATCH /api/v1/admin/subscriptions/:id — ubah status/perpanjang/cancel (docs/10 §10.2). */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updateSubscription(id, body)));
});
