import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { getPaymentsSummary } from "@/server/admin";

/** GET /api/v1/admin/payments/summary?from=&to= — volume/status/provider/fee (docs/10 §10.3). */
export const GET = adminRawRoute(async ({ request }) => {
  const q = adminPaymentQuerySchema.parse(searchParamsToObject(request));
  return NextResponse.json(dataEnvelope(await getPaymentsSummary({ from: q.from, to: q.to })));
});
