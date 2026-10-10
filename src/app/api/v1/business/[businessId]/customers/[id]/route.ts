import { authRoute, parseUuidParam } from "@/lib/api-route";
import { getCustomer } from "@/server/customers";

/** GET /api/v1/business/:businessId/customers/:id (docs/08 §8.10). */
export const GET = authRoute<
  Awaited<ReturnType<typeof getCustomer>>,
  { businessId: string; id: string }
>(async ({ user, params }) => {
  const businessId = parseUuidParam(params.businessId, "businessId");
  const id = parseUuidParam(params.id, "id");
  return getCustomer(user.id, businessId, id);
});
