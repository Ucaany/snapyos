import { authRoute, parseUuidParam } from "@/lib/api-route";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { revokeDevice } from "@/server/devices";

/** DELETE /api/v1/business/:businessId/devices/:id (docs/08 §8.5). */
export const DELETE = authRoute<{ ok: true }, { businessId: string; id: string }>(
  async ({ user, params }) => {
    const businessId = parseUuidParam(params.businessId, "businessId");
    const id = parseUuidParam(params.id, "id");
    await requireEffectiveSubscription(businessId, "write");
    await revokeDevice(user.id, businessId, id);
    return { ok: true };
  }
);
