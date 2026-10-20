import { ApiError, authRoute } from "@/lib/api-route";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { cashConfirmSchema } from "@/lib/validators";
import { requireDevice } from "@/server/payment/checkout-shared";
import { confirmCashPayment } from "@/server/payment/checkout";

/** Operator action. Auth.js session + transaction-write membership; no public bypass. */
export const POST = authRoute<
  Awaited<ReturnType<typeof confirmCashPayment>>,
  { businessSlug: string }
>(async ({ user, request, params }) => {
  const { businessSlug } = params;
  const input = cashConfirmSchema.parse(await request.json());
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`cash-confirm:${ip}`, 30, 60_000);
  // Lapis kedua per device (booth) — banyak booth satu NAT tidak saling menstar.
  const deviceRl = await rateLimitByDevice("cash-confirm", input.device_token, 30, 60_000);
  if (!rl.ok || (deviceRl && !deviceRl.ok)) {
    const retryAfter = !rl.ok ? rl.retryAfterSec : (deviceRl?.retryAfterSec ?? 0);
    throw new ApiError("RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi nanti.", {
      retry_after: retryAfter,
    });
  }
  const device = await requireDevice(businessSlug, input.device_token);
  const membership = await getMembership(user.id, device.businessId);
  if (!membership || !can(membership.role, "transaction:write")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengonfirmasi tunai");
  }
  return confirmCashPayment(businessSlug, input.payment_reference, input.device_token);
});
