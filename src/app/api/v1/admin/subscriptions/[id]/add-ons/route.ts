import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { attachSubscriptionAddOn } from "@/server/admin";

/**
 * POST /api/v1/admin/subscriptions/:id/add-ons — attach add-on ke subscription
 * (docs/10 §10.2). Idempotent via unique (subscription_id, add_on_id).
 * Body: { add_on_id: uuid, quantity: 1..100 }
 */
export const POST = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const subscriptionId = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  const data = await attachSubscriptionAddOn({
    subscription_id: subscriptionId,
    add_on_id: (body as { add_on_id?: string }).add_on_id ?? "",
    quantity: (body as { quantity?: number }).quantity ?? 0,
  });
  return NextResponse.json(dataEnvelope(data), { status: 201 });
});
