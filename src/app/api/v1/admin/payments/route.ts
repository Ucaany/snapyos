import { NextResponse } from "next/server";
import { listEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { listPayments } from "@/server/admin";

/** GET /api/v1/admin/payments?status=&provider=&from=&to= — docs/10 §10.3. */
export const GET = adminRawRoute(async ({ request }) => {
  const q = adminPaymentQuerySchema.parse(searchParamsToObject(request));
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const { items, total } = await listPayments({
    status: q.status,
    provider: q.provider,
    from: q.from,
    to: q.to,
    page,
    limit,
  });
  return NextResponse.json(listEnvelope(items, page, limit, total));
});
