import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { getAdminOverviewGuarded } from "@/server/admin";

/** GET /api/v1/admin/overview — metrics platform (docs/08 §8.15, docs/10 §10.1). */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await getAdminOverviewGuarded()));
});
