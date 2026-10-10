import { authRoute, parseUuidParam } from "@/lib/api-route";
import { listPendingCashPayments, type PendingCashPayment } from "@/server/cash-payment";

/** GET /api/v1/business/:businessId/cash-payments — permintaan tunai pending (bayar di kasir). */
export const GET = authRoute<PendingCashPayment[], { businessId: string }>(
  async ({ user, params }) => {
    const businessId = parseUuidParam(params.businessId, "businessId");
    return listPendingCashPayments(user.id, businessId);
  }
);
