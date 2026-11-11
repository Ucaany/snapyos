"use client";

/**
 * Facing mode kamera — kiosk PWA memakai kamera internal browser (getUserMedia).
 */

// Relatif (bukan `@/`) agar tes `node --experimental-strip-types` bisa impor modul ini.
import { bridgeHeaders } from "./bridge-token.ts";
import { resolveBridgeUrl } from "./bridge-url.ts";

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
  return resolveBridgeUrl(settings);
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
  let response: Response;
  try {
    response = await fetchBridge(
      `${cameraBridgeUrl(settings)}/health`,
      {
        method: "GET",
        signal,
        cache: "no-store",
      },
      10_000
    );
  } catch {
    throw new Error("Bridge kamera tidak aktif. Jalankan runtime lokal di komputer booth.");
  }
  if (!response.ok) {
    // 401 = token bridge belum diisi/salah; pesannya harus spesifik karena
    // operator yang memperbaikinya ada di depan layar kiosk.
    if (response.status === 401) throw new Error("Token bridge belum diisi atau salah.");
    if (response.status === 403) {
      throw new Error(
        "Bridge menolak origin kiosk ini. Tambahkan domain booth ke PHOTOBOOTH_BRIDGE_ORIGINS."
      );
    }
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

export type BridgeCamera = { id: string; label: string };

export type BridgeCameraList =
  { ok: true; cameras: BridgeCamera[] } | { ok: false; reason: string };

/**
 * Deteksi kamera fisik lewat bridge. Bridge mati bukan error: pemilihan
 * perangkat tetap bisa dibuka, dan kiosk boleh jatuh ke kamera browser.
 */
export async function listBridgeCameras(
  settings?: CameraProviderSettings | null,
  signal?: AbortSignal
): Promise<BridgeCameraList> {
  let response: Response;
  try {
    response = await fetchBridge(
      `${cameraBridgeUrl(settings)}/camera/list`,
      { method: "GET", signal, cache: "no-store", headers: bridgeHeaders() },
      8_000
    );
  } catch {
    return { ok: false, reason: "Bridge kamera tidak aktif. Jalankan runtime lokal." };
  }
  if (response.status === 401) {
    return { ok: false, reason: "Token bridge belum diisi atau salah." };
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: unknown;
    cameras?: unknown;
    reason?: unknown;
  } | null;
  if (!response.ok || body?.ok !== true) {
    return {
      ok: false,
      reason: typeof body?.reason === "string" ? body.reason : "Bridge gagal mendeteksi kamera.",
    };
  }
  const cameras = Array.isArray(body.cameras)
    ? body.cameras
        .filter(
          (item): item is { id: string; label?: unknown } =>
            typeof (item as { id?: unknown } | null)?.id === "string"
        )
        .map((item) => ({
          id: item.id,
          label: typeof item.label === "string" && item.label.trim() ? item.label : item.id,
        }))
    : [];
  return { ok: true, cameras };
}
