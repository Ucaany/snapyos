import { authRoute, parseUuidParam, ApiError } from "@/lib/api-route";
import { getMembership } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { revokeDevice } from "@/server/devices";

/** DELETE /api/v1/business/:businessId/devices/:id (docs/08 §8.5). */
export const DELETE = authRoute<{ ok: true }, { businessId: string; id: string }>(
  async ({ user, params }) => {
    const businessId = parseUuidParam(params.businessId, "businessId");
    const id = parseUuidParam(params.id, "id");
    // M2 (security): membership dulu, entitlement belakangan. Kalau urutannya
    // dibalik, gate langganan dievaluasi dengan businessId pilihan penyerang
    // sehingga 410 vs 404 membocorkan keberadaan tenant + status billing.
    // Cross-tenant wajib 404 yang seragam (AGENTS.md).
    const membership = await getMembership(user.id, businessId);
    if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
    if (!can(membership.role, "photobox:write")) {
      throw new ApiError("FORBIDDEN", "Tidak punya akses");
    }
    await requireEffectiveSubscription(businessId, "write");
    await revokeDevice(user.id, businessId, id);
    return { ok: true };
  }
);
