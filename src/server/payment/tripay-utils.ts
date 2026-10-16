/**
 * Tripay webhook utilities (pure — no runtime deps).
 * Dipindah dari `src/lib/tripay.ts` (Fase 5). Dipakai `webhook-handler.ts`
 * dan test suite; disimpan sebagai modul terpisah agar bisa dites tanpa
 * Next runtime dan tidak menabrak `providers/tripay.ts` (impl adapter).
 */

import { z } from "zod";
// Relative import (bukan alias `@/`): modul ini dites langsung oleh
// `node --experimental-strip-types`, yang tidak me-resolve alias tsconfig.
import { parseProviderAmount } from "../../lib/qris-helpers.ts";

const tripayAmount = z.union([z.string(), z.number()]);

/**
 * Callback Tripay (docs developer, transaction-create) mengirim `total_amount`
 * = nominal yang dibayar customer (sudah termasuk admin fee), BUKAN `amount`.
 * `amount` tetap diterima bila suatu saat dikirim; minimal salah satu wajib ada
 * supaya gate nominal tidak bisa dilewati dengan menghapus field.
 */
export const tripayWebhookSchema = z
  .object({
    merchant_ref: z.string().trim().min(1).max(160),
    status: z.string().trim().min(1).max(40),
    total_amount: tripayAmount.optional(),
    amount: tripayAmount.optional(),
    reference: z.string().trim().max(160).nullable().optional(),
  })
  .passthrough()
  .refine((v) => v.total_amount !== undefined || v.amount !== undefined, {
    message: "total_amount atau amount wajib ada",
  });

export type TripayWebhook = z.infer<typeof tripayWebhookSchema>;

/** Nominal provider (string desimal / ribuan / number) → integer IDR; invalid → null. */
export function parseTripayAmount(value: unknown): number | null {
  return parseProviderAmount(value);
}

/** Nominal callback Tripay: `total_amount` diutamakan, fallback `amount`. */
export function tripayWebhookAmount(event: TripayWebhook): number | null {
  return parseTripayAmount(event.total_amount ?? event.amount);
}

export function tripayEventId(event: TripayWebhook): string {
  const amount = tripayWebhookAmount(event);
  return `tripay:${event.merchant_ref}:${event.reference ?? ""}:${event.status.toUpperCase()}:${amount ?? ""}`;
}
