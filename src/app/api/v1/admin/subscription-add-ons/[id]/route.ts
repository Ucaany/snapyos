import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { cancelSubscriptionAddOn } from "@/server/admin";

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
