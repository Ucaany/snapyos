/**
 * Toggle global provider pembayaran (admin) — pure agar testable.
 * Default true bila key belum ada (backward compatible).
 */

export const GATEWAY_ENABLED_KEY = {
  midtrans: "gateway_midtrans_enabled",
  tripay: "gateway_tripay_enabled",
} as const;

export type GatewayProviderKey = keyof typeof GATEWAY_ENABLED_KEY;

export function gatewayEnabledFromSettings(
  settings: ReadonlyArray<{ key: string; value: unknown }>,
  provider: string
): boolean {
  const key = GATEWAY_ENABLED_KEY[provider as GatewayProviderKey];
  if (!key) return true;
  const row = settings.find((s) => s.key === key);
  return row === undefined ? true : row.value === true;
}
