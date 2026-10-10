import { NextResponse } from "next/server";
import { listEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { listSubscriptions } from "@/server/admin";

/** GET /api/v1/admin/subscriptions?status= — docs/08 §8.15, docs/10 §10.2. */
export const GET = adminRawRoute(async ({ request }) => {
  const q = searchParamsToObject(request);
  const page = Number.parseInt(q.page ?? "1", 10);
  const limit = Number.parseInt(q.limit ?? "20", 10);
  const { items, total } = await listSubscriptions({
    status: q.status,
    page: Number.isFinite(page) ? page : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return NextResponse.json(listEnvelope(items, page || 1, limit || 20, total));
});
