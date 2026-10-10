import { authRoute, parseUuidParam } from "@/lib/api-route";
import { listDevices } from "@/server/devices";

/** GET /api/v1/business/:businessId/devices (docs/08 §8.5). */
export const GET = authRoute<
  Awaited<ReturnType<typeof listDevices>>,
  { businessId: string }
>(async ({ user, params }) => {
  const businessId = parseUuidParam(params.businessId, "businessId");
  return listDevices(user.id, businessId);
});
