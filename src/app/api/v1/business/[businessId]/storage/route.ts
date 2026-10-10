import { authRoute, parseUuidParam, ApiError } from "@/lib/api-route";
import { getMembership } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getStorageUsage } from "@/server/storage-usage";

/** GET /api/v1/business/:businessId/storage — kuota & pemakaian storage (indikator topbar). */
export const GET = authRoute<Awaited<ReturnType<typeof getStorageUsage>>, { businessId: string }>(
  async ({ user, params }) => {
    const businessId = parseUuidParam(params.businessId, "businessId");
    // M1 (security): tenant-scope — user tenant mana pun sebelumnya bisa baca
    // kuota tenant lain. Cross-tenant → 404 (bukan 403, AGENTS.md).
    const membership = await getMembership(user.id, businessId);
    if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
    if (!can(membership.role, "business:read")) {
      throw new ApiError("FORBIDDEN", "Tidak punya akses");
    }
    return getStorageUsage(businessId);
  }
);
