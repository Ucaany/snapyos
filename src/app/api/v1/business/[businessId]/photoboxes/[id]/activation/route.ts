import { authRoute, parseUuidParam } from "@/lib/api-route";
import { generateActivation } from "@/server/devices";

/** GET /api/v1/business/:businessId/photoboxes/:id/activation (docs/08 §8.5). */
export const GET = authRoute<
  Awaited<ReturnType<typeof generateActivation>>,
  { businessId: string; id: string }
>(async ({ user, params }) => {
  const businessId = parseUuidParam(params.businessId, "businessId");
  const id = parseUuidParam(params.id, "id");
  return generateActivation(user.id, businessId, id);
});
