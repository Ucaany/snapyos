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
import { getBridgeToken } from "@/lib/bridge-token";
import { KioskError } from "@/components/kiosk/api";
import type { DeviceSettings } from "@/lib/settings-merge";

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

/** POST ke runtime lokal; melempar `KioskError` supaya UI bisa membedakan sebab. */
async function bridgePost<T>(path: string, body: unknown, bridgeUrl?: string | null): Promise<T> {
  const token = getBridgeToken();
  if (!token)
    throw new KioskError(
      "NO_BRIDGE",
      "Token bridge belum diisi. Buka Setup Perangkat dan simpan token bridge."
    );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${cameraBridgeUrl({ bridge_url: bridgeUrl ?? undefined })}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: string;
      [key: string]: unknown;
    } | null;
    if (!response.ok) {
      if (response.status === 401) {
        throw new KioskError("NO_BRIDGE", "Token bridge belum diisi atau salah.");
      }
      throw new KioskError(
        response.status === 429 ? "PIN_LOCKED" : (payload?.error ?? "PIN_EMERGENCY_REJECTED"),
        payload?.message ?? "Runtime lokal menolak permintaan."
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof KioskError) throw error;
    throw new KioskError("NO_BRIDGE", "Runtime lokal booth tidak menjawab.");
  } finally {
    clearTimeout(timer);
  }
}

/** GET ke runtime lokal; `null` bila runtime tidak menjawab. */
async function bridgeGet<T>(path: string, bridgeUrl?: string | null): Promise<T | null> {
  if (typeof window === "undefined") return null;
  // Tanpa token runtime pasti menjawab 401, jadi jangan buang request: kiosk
  // browser biasa tidak punya runtime dan tidak boleh memicu error di konsol.
  const token = getBridgeToken();
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
 * Simpan setelan booth ke runtime lokal (`PUT /v1/settings`).
 *
 * Ini satu-satunya jalur tulis setelan mesin. Dashboard sengaja menolak field
 * mesin (`src/lib/photobox-form-fields.ts`), jadi tanpa fungsi ini tidak ada
 * cara sah mengubah kamera/printer/sesi/tampilan dari dalam booth.
 *
 * Berbeda dari `bridgeGet`, kegagalan dilempar: panel setelan harus bisa
 * membedakan "runtime mati" dari "nilai ditolak" dan menampilkan sebabnya.
 */
export async function saveDeviceSettings(
  settings: DeviceSettings,
  bridgeUrl?: string | null
): Promise<DeviceSettings> {
  const token = getBridgeToken();
  if (!token) {
    throw new KioskError(
      "NO_BRIDGE",
      "Token bridge belum diisi. Buka Setup Perangkat dan simpan token bridge."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${cameraBridgeUrl({ bridge_url: bridgeUrl ?? undefined })}/v1/settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
        body: JSON.stringify(settings),
        signal: controller.signal,
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: string;
      settings?: DeviceSettings;
    } | null;
    if (!response.ok) {
      // 403 FIELD_NOT_DEVICE_OWNED = panel mencoba menulis field milik cloud
      // (copies, layout, harga). Itu bug panel, bukan salah operator — pesannya
      // menyebut field agar langsung terlihat.
      throw new KioskError(
        payload?.error ?? "SETTINGS_REJECTED",
        payload?.message ?? "Runtime lokal menolak setelan."
      );
    }
    return payload?.settings ?? {};
  } catch (error) {
    if (error instanceof KioskError) throw error;
    throw new KioskError(
      "NO_BRIDGE",
      "Runtime lokal booth tidak menjawab. Setelan tidak disimpan."
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Catat printer Bluetooth yang berhasil tersambung ke `print_settings.thermal`.
 *
 * Nama device + lebar kertas tidak bisa diketahui dari cloud (hanya ada di
 * mesin booth), jadi setelah koneksi sukses nilainya ditulis balik ke store
 * lokal. Best-effort: runtime mati / field ditolak tidak boleh menggagalkan
 * cetak yang sudah terkirim.
 */
export async function rememberThermalPrinter(
  input: { name?: string | null; paperWidthMm?: 58 | 80 | null },
  bridgeUrl?: string | null
): Promise<void> {
  const name = input.name?.trim();
  const width = input.paperWidthMm;
  if (!name && !width) return;
  try {
    const current = await fetchDeviceSettings(bridgeUrl);
    const print = current?.print_settings ?? {};
    const thermal = {
      ...(typeof print.thermal === "object" && print.thermal ? print.thermal : {}),
      ...(name ? { bluetooth_device_name: name.slice(0, 60) } : {}),
      ...(width ? { paper_width_mm: width } : {}),
    };
    // Field datar ikut ditulis: pembaca lama (`bluetoothWidthDots`,
    // `printDefaults` runtime) hanya mengenal `bluetooth_paper_width_mm`.
    await saveDeviceSettings(
      {
        print_settings: {
          ...print,
          ...(width ? { bluetooth_paper_width_mm: width } : {}),
          thermal,
        },
      },
      bridgeUrl
    );
  } catch {
    // Runtime tidak ada = keadaan normal kiosk browser; jangan berisik.
  }
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

/**
 * PIN darurat (`POST /v1/exit`, Phase 2). Dipakai HANYA saat cloud tidak bisa
 * dijangkau — tanpa ini petugas terkurung di dalam booth ketika internet mati.
 *
 * Berbeda dari `bridgeGet`, kegagalan di sini dilempar: dialog harus bisa
 * membedakan "PIN salah" dari "runtime tidak menjawab" untuk pesan ke petugas.
 */
export async function submitLocalExit(
  pin: string,
  bridgeUrl?: string | null
): Promise<{ ok: boolean; emergency?: boolean }> {
  const body = await bridgePost<{ ok?: boolean; emergency?: boolean }>(
    "/v1/exit",
    { pin },
    bridgeUrl
  );
  // `ok !== false` terlalu longgar: respons tanpa `ok` (mis. 200 dari proxy
  // lain) akan membuka booth. Runtime yang benar mengirim `{ok:true}`.
  return { ok: body?.ok === true, emergency: body?.emergency };
}

// ---------------------------------------------------------------- sesi lokal

/** Bentuk respons `POST /v1/sessions` yang dipakai kiosk (subset `present()`). */
export type LocalSession = {
  id: string;
  expires_at: string;
  package_id: string;
  state: string;
};

/**
 * Buka sesi tanpa cloud (`POST /v1/sessions`, Phase 2).
 *
 * `package_snapshot` membekukan harga saat sesi mulai — sync worker memakainya
 * saat mengirim sesi ke cloud, jadi pelanggan tidak tertagih harga baru hanya
 * karena internet pulih setelah paket naik.
 */
export async function createLocalSession(input: {
  packageSnapshot: unknown;
  packageId: string;
  templateId?: string | null;
  timerSeconds?: number;
  bridgeUrl?: string | null;
}): Promise<LocalSession> {
  const body = await bridgePost<LocalSession>(
    "/v1/sessions",
    {
      package_snapshot: input.packageSnapshot,
      package_id: input.packageId,
      template_id: input.templateId ?? null,
      timer_seconds: input.timerSeconds ?? 0,
      client_created_at: new Date().toISOString(),
    },
    input.bridgeUrl
  );
  if (!body?.id) throw new KioskError("NO_BRIDGE", "Runtime lokal tidak membuat sesi.");
  return body;
}

/**
 * Finalize ke runtime lokal. Foto disimpan di disk booth dan dikirim ke cloud
 * oleh sync worker (Phase 7) begitu internet pulih.
 */
export async function finalizeLocalSession(
  sessionId: string,
  form: FormData,
  bridgeUrl?: string | null
): Promise<void> {
  const token = getBridgeToken();
  if (!token)
    throw new KioskError(
      "NO_BRIDGE",
      "Token bridge belum diisi. Buka Setup Perangkat dan simpan token bridge."
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${cameraBridgeUrl({ bridge_url: bridgeUrl ?? undefined })}/v1/sessions/${encodeURIComponent(sessionId)}/finalize`,
      {
        method: "POST",
        headers: { "X-Bridge-Token": token },
        body: form,
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new KioskError("NO_BRIDGE", body?.message ?? "Runtime lokal gagal menyimpan hasil.");
    }
  } catch (error) {
    if (error instanceof KioskError) throw error;
    throw new KioskError("NO_BRIDGE", "Runtime lokal booth tidak menjawab.");
  } finally {
    clearTimeout(timer);
  }
}

/** Batalkan sesi lokal yang tidak jadi dipakai (timer habis tanpa foto). */
export async function abortLocalSession(
  sessionId: string,
  bridgeUrl?: string | null
): Promise<void> {
  await bridgePost(`/v1/sessions/${encodeURIComponent(sessionId)}/abort`, {}, bridgeUrl);
}
