/**
 * Klien bridge lokal. Semua panggilan membawa header X-Bridge-Token yang
 * disuntik Shell saat dokumen dibuat (window.__SNAPY_BRIDGE__).
 */

export type BridgeHandle = {
  url: string;
  token: string;
};

declare global {
  interface Window {
    __SNAPY_BRIDGE__?: BridgeHandle;
  }
}

export class BridgeError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BridgeError";
    this.status = status;
    this.code = code;
  }
}

function handle(): BridgeHandle {
  const injected = window.__SNAPY_BRIDGE__;
  if (injected) {
    return injected;
  }
  // Mode `vite dev` di peramban: Shell tidak menyuntik handle, jadi pakai
  // bridge lokal default. Token opsional lewat VITE_BRIDGE_TOKEN.
  if (import.meta.env.DEV) {
    return {
      url: import.meta.env.VITE_BRIDGE_URL ?? "http://127.0.0.1:17777",
      token: import.meta.env.VITE_BRIDGE_TOKEN ?? "",
    };
  }
  throw new BridgeError("Bridge belum siap. Jalankan lewat aplikasi booth.", 0);
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageOf(body: unknown, fallback: string): { message: string; code?: string } {
  if (body && typeof body === "object" && "message" in body) {
    const record = body as { message?: string; error?: string };
    return { message: record.message ?? fallback, code: record.error };
  }
  return { message: fallback };
}

export async function bridgeGet<T>(path: string): Promise<T> {
  const { url, token } = handle();
  const response = await fetch(`${url}${path}`, { headers: { "X-Bridge-Token": token } });
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = messageOf(body, `Permintaan gagal (${response.status}).`);
    throw new BridgeError(message, response.status, code);
  }
  return body as T;
}

export async function bridgeSend<T>(path: string, method: "PUT" | "POST", payload?: unknown): Promise<T> {
  const { url, token } = handle();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = messageOf(body, `Permintaan gagal (${response.status}).`);
    throw new BridgeError(message, response.status, code);
  }
  return body as T;
}

export type SettingsResponse = {
  ok: boolean;
  photobox_slug: string | null;
  business_slug: string | null;
  settings: Record<string, Record<string, unknown>>;
};

export type StatusResponse = {
  ok: boolean;
  version: string;
  db_version: number;
  data_dir: string;
  business_slug: string | null;
  photobox_slug: string | null;
  camera: { adapter: string; connected: boolean; mock: boolean; last_error?: string };
  printer: { adapter: string; ok: boolean; mock: boolean; last_error?: string };
};

export const bridge = {
  status: () => bridgeGet<StatusResponse>("/v1/status"),
  readSettings: () => bridgeGet<SettingsResponse>("/v1/settings"),
  writeSettings: (payload: unknown) => bridgeSend<SettingsResponse>("/v1/settings", "PUT", payload),
  exportSettings: () => bridgeGet<Record<string, unknown>>("/v1/settings/export"),
  importSettings: (payload: unknown) => bridgeSend<SettingsResponse>("/v1/settings/import", "POST", payload),
};
