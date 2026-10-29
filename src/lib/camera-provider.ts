"use client";

/**
 * Facing mode kamera — kiosk PWA memakai kamera internal browser (getUserMedia).
 */

// Relatif (bukan `@/`) agar tes `node --experimental-strip-types` bisa impor modul ini.
import { bridgeHeaders } from "./bridge-token.ts";
import { DEFAULT_BRIDGE_URL, isLoopbackBridgeUrl } from "./bridge-url.ts";

export type FacingMode = "user" | "environment";

/** "browser" = getUserMedia; "bridge" = kamera fisik via runtime lokal. */
export type CameraProvider = "browser" | "bridge";

/**
 * Nilai `camera_settings.provider` yang dianggap memilih jalur bridge.
 * `gphoto2` dipertahankan agar setelan booth lama tetap berlaku; adapter
 * konkretnya (gphoto2 / libcamera / v4l2 / pyav) ditentukan env runtime, bukan
 * oleh nilai tersimpan ini.
 */
export const BRIDGE_PROVIDERS = [
  "bridge",
  "gphoto2",
  "digicamcontrol",
  "libcamera",
  "v4l2",
  "pyav",
] as const;

export type CameraProviderSettings = {
  provider?: CameraProvider | (typeof BRIDGE_PROVIDERS)[number];
  bridge_url?: string;
};

export function resolveCameraProvider(settings?: CameraProviderSettings | null): CameraProvider {
  const provider = settings?.provider;
  if (typeof provider === "string" && (BRIDGE_PROVIDERS as readonly string[]).includes(provider)) {
    return "bridge";
  }
  return "browser";
}

export function cameraBridgeUrl(settings?: CameraProviderSettings | null): string {
  const configured = settings?.bridge_url?.trim();
  // Hanya loopback: nilai ini datang dari settings yang bisa ditulis device
  // token, jadi ia tidak boleh menjadi tujuan fetch foto/token ke origin lain.
  if (configured && isLoopbackBridgeUrl(configured)) return configured;
  return DEFAULT_BRIDGE_URL;
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

export async function captureFromBridge(
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
      typeof body?.message === "string" ? body.message : "Kamera bridge gagal mengambil foto."
    );
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/"))
    throw new Error("Bridge mengembalikan data foto tidak valid.");
  return blob;
}

export async function fetchBridgePreview(
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
  if (!response.ok) throw new Error("Preview kamera bridge tidak tersedia.");
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
