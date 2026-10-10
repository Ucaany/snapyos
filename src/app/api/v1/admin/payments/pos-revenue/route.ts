import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { adminPosRevenueSummary } from "@/server/admin";

/**
 * GET /api/v1/admin/payments/pos-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
 * POS revenue per tenant (docs/pos/05 §4).
 */
export const GET = adminRawRoute(async ({ request }) => {
  const q = searchParamsToObject(request);
  return NextResponse.json(
    dataEnvelope(
      await adminPosRevenueSummary({
        from: typeof q.from === "string" ? q.from : undefined,
        to: typeof q.to === "string" ? q.to : undefined,
      })
    )
  );
});
