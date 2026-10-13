import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { cancelSubscriptionAddOn, updateSubscriptionAddOn } from "@/server/admin";

/**
 * PATCH /api/v1/admin/subscription-add-ons/:id — update quantity add-on aktif
 * (docs/10 §10.2). Body: { quantity: number (1–100) }.
 */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const linkId = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updateSubscriptionAddOn(linkId, body)));
});

/**
 * DELETE /api/v1/admin/subscription-add-ons/:id — cancel add-on
 * (docs/10 §10.2). Default deferred (parity owner): flag cancel_at_period_end,
 * add-on tetap aktif sampai cron transition at period end. Body opsional:
 * { mode?: "deferred" | "immediate", manual_cancel_reason?: string } —
 * immediate = darurat, fitur off seketika + reason wajib (audit).
 */
export const DELETE = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const linkId = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => ({}));
  const data = await cancelSubscriptionAddOn(linkId, {
    mode: (body as { mode?: string }).mode,
    manual_cancel_reason: (body as { manual_cancel_reason?: string }).manual_cancel_reason,
  });
  return NextResponse.json(dataEnvelope(data));
});
