/**
 * Tripay webhook utilities (pure — no runtime deps).
 * Dipindah dari `src/lib/tripay.ts` (Fase 5). Dipakai `webhook-handler.ts`
 * dan test suite; disimpan sebagai modul terpisah agar bisa dites tanpa
 * Next runtime dan tidak menabrak `providers/tripay.ts` (impl adapter).
 */

import { z } from "zod";

export const tripayWebhookSchema = z.object({
  merchant_ref: z.string().trim().min(1).max(160),
  status: z.string().trim().min(1).max(40),
  amount: z.union([z.string(), z.number()]),
  reference: z.string().trim().max(160).nullable().optional(),
}).passthrough();

export type TripayWebhook = z.infer<typeof tripayWebhookSchema>;

export function parseTripayAmount(value: string | number): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function tripayEventId(event: TripayWebhook): string {
  return `tripay:${event.merchant_ref}:${event.reference ?? ""}:${event.status.toUpperCase()}:${event.amount}`;
}
