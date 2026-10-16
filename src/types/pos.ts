/**
 * Centralized POS type definitions — docs/pos/01 §1.
 * Single source of truth for POS category list used in:
 * - PosProductsTable.tsx (frontend)
 * - pos-actions.ts (server action)
 * - validators.ts (zod schema)
 */

export const POS_CATEGORIES = [
  "keychain",
  "gantungan",
  "additional_print",
  "merchandise",
  "lainnya",
] as const;

export type PosCategory = (typeof POS_CATEGORIES)[number];
