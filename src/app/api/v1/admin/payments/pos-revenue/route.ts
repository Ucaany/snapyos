import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { adminPosRevenueSummary } from "@/server/admin";

/**
 * GET /api/v1/admin/payments/pos-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
 * POS revenue per tenant (docs/pos/05 §4).
 */
export const GET = adminRawRoute(async ({ request }) => {
  const q = adminPaymentQuerySchema.parse(searchParamsToObject(request));
  return NextResponse.json(dataEnvelope(await adminPosRevenueSummary({ from: q.from, to: q.to })));
});
