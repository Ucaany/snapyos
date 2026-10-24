"use client";

/**
 * Setelan device dari runtime lokal (`GET /v1/settings`, Phase 3).
 *
 * Runtime mati adalah keadaan normal, bukan error: kiosk browser biasa tidak
 * punya runtime sama sekali, dan booth yang runtime-nya sedang restart tetap
 * harus bisa menjual. Karena itu semua kegagalan (tidak ada token, koneksi
 * ditolak, timeout) menghasilkan `null` tanpa pesan ke pelanggan.
 */

import { cameraBridgeUrl } from "@/lib/camera-provider";
import type { DeviceSettings } from "@/lib/settings-merge";

/**
 * Token bridge diisi saat setup. Dibaca langsung dari localStorage, bukan lewat
 * modul bersama: `src/lib/bridge-token.ts` lahir di Phase 3 dan kiosk ini harus
 * tetap jalan sebelum fase itu masuk.
 */
const BRIDGE_TOKEN_KEY = "snapyos_bridge_token";
/** Runtime ada di mesin yang sama; 1,5 detik sudah jauh lebih dari cukup. */
const TIMEOUT_MS = 1500;

type SettingsResponse = {
  ok?: boolean;
  settings?: DeviceSettings;
};

type StatusResponse = {
  ok?: boolean;
  business_slug?: string;
  photobox_slug?: string;
};

function readBridgeToken(): string {
  try {
    return window.localStorage.getItem(BRIDGE_TOKEN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** GET ke runtime lokal; `null` bila runtime tidak menjawab. */
async function bridgeGet<T>(path: string, bridgeUrl?: string | null): Promise<T | null> {
  if (typeof window === "undefined") return null;
  // Tanpa token runtime pasti menjawab 401, jadi jangan buang request: kiosk
  // browser biasa tidak punya runtime dan tidak boleh memicu error di konsol.
  const token = readBridgeToken();
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${cameraBridgeUrl({ bridge_url: bridgeUrl ?? undefined })}${path}`,
      {
        method: "GET",
        headers: { "X-Bridge-Token": token },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Setelan device aktif, atau `null` bila runtime tidak menjawab. */
export async function fetchDeviceSettings(
  bridgeUrl?: string | null
): Promise<DeviceSettings | null> {
  const body = await bridgeGet<SettingsResponse>("/v1/settings", bridgeUrl);
  return body?.settings ?? null;
}

/**
 * Identitas booth menurut runtime lokal (`GET /v1/status`). Dipakai saat boot
 * offline: runtime di port 17777 harus memastikan dirinya booth ini, kalau
 * tidak dua booth di jaringan yang sama bisa saling tertukar.
 */
export async function fetchRuntimeStatus(
  bridgeUrl?: string | null
): Promise<StatusResponse | null> {
  return bridgeGet<StatusResponse>("/v1/status", bridgeUrl);
}
