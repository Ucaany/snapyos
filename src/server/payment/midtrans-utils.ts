/**
 * Midtrans webhook utilities (pure — no runtime deps).
 * Dipindah dari `src/lib/midtrans.ts` (Fase 5). Dipakai `webhook-handler.ts`
 * dan test suite; disimpan sebagai modul terpisah agar bisa dites tanpa
 * Next runtime dan tidak menabrak `providers/midtrans.ts` (impl adapter).
 */

import { createHash } from "node:crypto";
import { z } from "zod";

export const midtransWebhookSchema = z.object({
  order_id: z.string().trim().min(1).max(160),
  status_code: z.union([z.string(), z.number().int()]).transform(String),
  gross_amount: z.union([z.string(), z.number()]),
  signature_key: z.string().trim().regex(/^[a-fA-F0-9]{128}$/),
  transaction_status: z.string().trim().min(1).max(40),
  fraud_status: z.string().trim().max(40).nullable().optional(),
  transaction_id: z.string().trim().max(160).nullable().optional(),
}).passthrough();

export type MidtransWebhook = z.infer<typeof midtransWebhookSchema>;

export function parseMidtransAmount(value: string | number): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (!/^\d+(?:\.00)?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function midtransEventId(event: MidtransWebhook): string {
  return `midtrans:${event.order_id}:${event.transaction_id ?? ""}:${event.transaction_status.toLowerCase()}:${event.fraud_status?.toLowerCase() ?? ""}:${event.status_code}:${event.gross_amount}`;
}

export function invalidWebhookEventId(provider: string, eventId: string, signature: string): string {
  return `${provider}:invalid:${eventId}:${createHash("sha256").update(signature).digest("hex").slice(0, 24)}`;
}
