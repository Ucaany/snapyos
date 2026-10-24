"use client";

/**
 * Facing mode kamera — kiosk PWA memakai kamera internal browser (getUserMedia).
 */

// Relatif (bukan `@/`) agar tes `node --experimental-strip-types` bisa impor modul ini.
import { bridgeHeaders } from "./bridge-token.ts";

export type FacingMode = "user" | "environment";

export type CameraProvider = "browser" | "gphoto2";

export type CameraProviderSettings = {
  provider?: CameraProvider;
  bridge_url?: string;
};

export function resolveCameraProvider(settings?: CameraProviderSettings | null): CameraProvider {
  return settings?.provider === "gphoto2" ? "gphoto2" : "browser";
}

export function cameraBridgeUrl(settings?: CameraProviderSettings | null): string {
  const configured = settings?.bridge_url?.trim();
  return configured || "http://127.0.0.1:17777";
}

async function fetchBridge(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function checkCameraBridge(
  settings?: CameraProviderSettings | null,
  signal?: AbortSignal
): Promise<{ ok: boolean; camera: boolean; message?: string }> {
  const response = await fetchBridge(
    `${cameraBridgeUrl(settings)}/health`,
    {
      method: "GET",
      signal,
      cache: "no-store",
      headers: bridgeHeaders(),
    },
    10_000
  );
  if (!response.ok) {
    // 401 = token bridge belum diisi/salah; pesannya harus spesifik karena
    // operator yang memperbaikinya ada di depan layar kiosk.
    if (response.status === 401) throw new Error("Token bridge belum diisi atau salah.");
    throw new Error("Bridge kamera tidak merespons.");
  }
  return (await response.json()) as { ok: boolean; camera: boolean; message?: string };
}

export async function captureGphoto2(
  settings?: CameraProviderSettings | null,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetchBridge(
    `${cameraBridgeUrl(settings)}/camera/capture`,
    {
      method: "POST",
      signal,
      cache: "no-store",
      headers: bridgeHeaders(),
    },
    120_000
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.message === "string" ? body.message : "GPhoto2 gagal mengambil foto."
    );
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/"))
    throw new Error("Bridge mengembalikan data foto tidak valid.");
  return blob;
}

export async function fetchGphoto2Preview(
  settings?: CameraProviderSettings | null,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetchBridge(
    `${cameraBridgeUrl(settings)}/camera/preview`,
    {
      method: "GET",
      signal,
      cache: "no-store",
      headers: bridgeHeaders(),
    },
    10_000
  );
  if (!response.ok) throw new Error("Preview GPhoto2 tidak tersedia.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("Preview kamera tidak valid.");
  return blob;
}

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
