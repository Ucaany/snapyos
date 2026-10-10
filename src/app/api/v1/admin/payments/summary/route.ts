import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { getPaymentsSummary } from "@/server/admin";

/** GET /api/v1/admin/payments/summary?from=&to= — volume/status/provider/fee (docs/10 §10.3). */
export const GET = adminRawRoute(async ({ request }) => {
  const q = searchParamsToObject(request);
  return NextResponse.json(dataEnvelope(await getPaymentsSummary({ from: q.from, to: q.to })));
});
