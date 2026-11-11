import { assertEnabledPaymentMethods } from "../lib/payment-credentials.ts";
import { encrypt } from "./payment/providers/encrypt.ts";
import type { GatewayProvider } from "./payment/providers/types.ts";

export function credentialMetadata(
  input: {
    provider: GatewayProvider;
    enabled_methods?: string[];
    private_key?: string;
    webhook_secret?: string;
  },
  current?: Record<string, unknown> | null
): Record<string, unknown> {
  const next = { ...(current ?? {}) };
  if (input.enabled_methods !== undefined) {
    next.enabled_methods = assertEnabledPaymentMethods(input.provider, input.enabled_methods);
  }
  if (input.provider === "tripay" && input.private_key !== undefined) {
    next.private_key_encrypted = encrypt(input.private_key);
  }
  if (input.provider === "pakasir" && input.webhook_secret !== undefined) {
    next.webhook_secret_encrypted = encrypt(input.webhook_secret);
  }
  delete next.private_key;
  delete next.webhook_secret;
  return next;
}
