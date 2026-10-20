"use client";

/** Klien API kiosk — envelope { data } / { error } (docs/08 §8.2). */

export class KioskError extends Error {
  code: string;
  /** Detik tunggu untuk RATE_LIMITED (dari details.retry_after). */
  retryAfter: number;
  constructor(code: string, message: string, retryAfter = 0) {
    super(message);
    this.name = "KioskError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const retryAfter = Number(json?.error?.details?.retry_after);
    throw new KioskError(
      json?.error?.code ?? "INTERNAL",
      json?.error?.message ?? "Terjadi kesalahan",
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0
    );
  }
  return json.data as T;
}

/**
 * Timeout semua request kiosk — koneksi macet (tunnel/wifi booth) TIDAK
 * boleh menggantung UI selamanya (pending deadlock di layar aktivasi).
 * ponytail: 15 detik cukup untuk foto finalize di jaringan normal; naikkan
 * bila upload foto besar terpotong di lapangan.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function timeoutSignal(existing?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || !("timeout" in AbortSignal)) {
    return existing; // browser kiosk lama tanpa AbortSignal.timeout: tanpa timeout
  }
  if (!existing) return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  existing.addEventListener("abort", () => {
    clearTimeout(t);
    controller.abort(existing.reason);
  });
  return controller.signal;
}

/** Timeout/abort → KioskError dengan pesan jelas (bukan diam). */
async function request<T>(url: string, init: RequestInit): Promise<T> {
  try {
    return parse<T>(await fetch(url, { ...init, signal: timeoutSignal(init.signal ?? undefined) }));
  } catch (e) {
    if (e instanceof KioskError) throw e;
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new KioskError(
        "TIMEOUT",
        "Koneksi ke server terputus atau terlalu lambat. Periksa internet booth, lalu coba lagi."
      );
    }
    if (e instanceof TypeError) {
      // fetch gagal DNS/offline — buat pesan eksplisit, bukan error generik.
      throw new KioskError(
        "NETWORK",
        "Tidak dapat terhubung ke server. Periksa koneksi internet booth."
      );
    }
    throw e;
  }
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  return request<T>(url, { signal });
}

export async function apiForm<T>(url: string, form: FormData): Promise<T> {
  return request<T>(url, { method: "POST", body: form });
}
