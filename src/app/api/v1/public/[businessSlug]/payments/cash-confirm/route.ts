import { ApiError, authRoute } from "@/lib/api-route";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { cashConfirmSchema } from "@/lib/validators";
import { requireDevice } from "@/server/payment/checkout-shared";
import { confirmCashPaymentByOperator } from "@/server/cash-payment";
import { requireEffectiveSubscription } from "@/server/require-subscription";

/** Operator action. Auth.js session + transaction-write membership; no public bypass. */
export const POST = authRoute<
  Awaited<ReturnType<typeof confirmCashPaymentByOperator>>,
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
  // Device token hanya dipakai untuk menemukan business; otorisasi tetap milik
  // user. Jalur operator menegakkan membership + payment:confirm + assign
  // member_photoboxes untuk staff + feature cash_payment — route ini dulu
  // memanggil jalur device sehingga staff bisa settle booth yang bukan tugasnya.
  const device = await requireDevice(businessSlug, input.device_token);
  await requireEffectiveSubscription(device.businessId, "write");
  return confirmCashPaymentByOperator(user.id, device.businessId, input.payment_reference);
});
