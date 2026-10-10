"use client";

/**
 * Facing mode kamera — kiosk PWA memakai kamera internal browser (getUserMedia).
 */

export type FacingMode = "user" | "environment";

/**
 * Totapkan facing mode runtime: setting owner (`camera_settings.facingMode`)
 * menang bila valid; selain itu fallback device-profile (tablet kiosk =
 * belakang, phone selfie = depan). Murni agar bisa di-unit-test.
 */
export function resolveFacingMode(
  setting: string | null | undefined,
  fallback: FacingMode
): FacingMode {
  return setting === "user" || setting === "environment" ? setting : fallback;
}
