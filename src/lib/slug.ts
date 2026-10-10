/**
 * Slug utilitas untuk business (URL publik /p/[businessSlug]/...).
 * Pure module agar bisa di-unit-test.
 * Route reserved: docs/03-architecture.md §3.3.1.
 */

export const RESERVED_SLUGS = [
  "dashboard",
  "admin",
  "api",
  "p",
  "r",
  "login",
  "register",
  "welcome",
  "onboarding",
  "staff",
  "pos",
  "bantuan",
  "settings",
  "account",
] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "KLIK FOTO Yogya!" → "klik-foto-yogya" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 48 &&
    SLUG_PATTERN.test(slug) &&
    !RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number])
  );
}
