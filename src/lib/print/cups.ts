// Relatif (bukan `@/`) agar tes `node --experimental-strip-types` bisa impor modul ini.
import { bridgeHeaders } from "../bridge-token.ts";
import { resolveBridgeUrl } from "../bridge-url.ts";
import type { PrintSettingsInput } from "@/lib/print-layout";

export type CupsTestInput = { title: string; lines: string[] };

export type PrinterListItem = { name: string; default: boolean };

export type PrinterListResult =
  { ok: true; printers: PrinterListItem[] } | { ok: false; reason: string };

export type CupsPrintResult = {
  job_id: string | null;
  status: "queued" | "printing" | "submitted" | "done" | "failed";
  error?: string;
  deduplicated?: boolean;
};

export function cupsBridgeUrl(settings?: PrintSettingsInput | null): string {
  return resolveBridgeUrl(settings);
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Data foto tidak valid."));
      else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Foto tidak bisa disiapkan untuk printer."));
    reader.readAsDataURL(blob);
  });
}

async function postBridge(
  settings: PrintSettingsInput | null | undefined,
  pathname: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${cupsBridgeUrl(settings)}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bridgeHeaders() },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error("Bridge CUPS tidak menjawab. Periksa runtime lokal di komputer booth.");
    }
    throw new Error(
      "Bridge CUPS tidak aktif. Jalankan runtime lokal di komputer booth, lalu coba lagi."
    );
  }
  const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    if (response.status === 401) throw new Error("Token bridge belum diisi atau salah.");
    throw new Error(
      typeof result?.message === "string"
        ? result.message
        : "Bridge CUPS tidak bisa mengirim cetak."
    );
  }
  return result ?? {};
}

export async function submitCupsPrint(
  settings: PrintSettingsInput | null | undefined,
  sheets: Blob[][],
  options: {
    sessionId?: string;
    framed?: boolean;
    canvasAspect?: number | null;
    dedupeKey?: string;
    reprint?: boolean;
  } = {}
): Promise<CupsPrintResult> {
  const result = await postBridge(settings, "/print", {
    paper_size: settings?.paper_size,
    orientation: settings?.orientation,
    margins_mm: settings?.margins_mm,
    fit: settings?.fit,
    strip_2up: settings?.strip_2up,
    media_name: settings?.media_name,
    printer_name: settings?.printer_name,
    framed: options.framed,
    canvas_aspect: options.canvasAspect ?? undefined,
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    ...(options.dedupeKey ? { dedupe_key: options.dedupeKey } : {}),
    ...(options.reprint ? { reprint: true } : {}),
    sheets: await Promise.all(sheets.map((sheet) => Promise.all(sheet.map(blobBase64)))),
  });
  return {
    job_id: typeof result.job_id === "string" ? result.job_id : null,
    status:
      result.status === "queued" ||
      result.status === "printing" ||
      result.status === "submitted" ||
      result.status === "done" ||
      result.status === "failed"
        ? result.status
        : "submitted",
    error: typeof result.error === "string" ? result.error : undefined,
    deduplicated: result.deduplicated === true,
  };
}

export async function submitCupsTest(
  settings: PrintSettingsInput | null | undefined,
  sample: CupsTestInput
): Promise<void> {
  await postBridge(settings, "/printer/test", {
    paper_size: settings?.paper_size,
    orientation: settings?.orientation,
    margins_mm: settings?.margins_mm,
    printer_name: settings?.printer_name,
    title: sample.title,
    lines: sample.lines,
  });
}

/** Retry lewat antrean runtime (bukan kirim ulang buta). */
export async function retryCupsJob(
  settings: PrintSettingsInput | null | undefined,
  jobId: string
): Promise<CupsPrintResult> {
  const result = await postBridge(settings, `/print/jobs/${encodeURIComponent(jobId)}/retry`, {});
  const job = (result.job ?? {}) as Record<string, unknown>;
  return {
    job_id: typeof job.id === "string" ? job.id : jobId,
    status:
      job.status === "queued" ||
      job.status === "printing" ||
      job.status === "submitted" ||
      job.status === "done" ||
      job.status === "failed"
        ? job.status
        : "failed",
    error: typeof job.error === "string" ? job.error : undefined,
  };
}

/** Konfirmasi operator: kertas benar-benar keluar. */
export async function confirmCupsJob(
  settings: PrintSettingsInput | null | undefined,
  jobId: string
): Promise<void> {
  await postBridge(settings, `/print/jobs/${encodeURIComponent(jobId)}/confirm`, {});
}

/**
 * Deteksi printer lewat bridge. Bridge mati bukan error: pengaturan printer
 * harus tetap bisa dibuka saat runtime belum berjalan.
 */
export async function listCupsPrinters(
  settings: PrintSettingsInput | null | undefined
): Promise<PrinterListResult> {
  let response: Response;
  try {
    response = await fetch(`${cupsBridgeUrl(settings)}/printer/list`, {
      method: "GET",
      headers: bridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, reason: "Bridge printer tidak aktif. Jalankan runtime lokal." };
  }
  if (response.status === 401) {
    return { ok: false, reason: "Token bridge belum diisi atau salah." };
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: unknown;
    printers?: unknown;
    reason?: unknown;
  } | null;
  if (!response.ok || body?.ok !== true) {
    return {
      ok: false,
      reason: typeof body?.reason === "string" ? body.reason : "Bridge gagal mendeteksi printer.",
    };
  }
  const printers = Array.isArray(body.printers)
    ? body.printers
        .filter(
          (item): item is { name: string; default?: unknown } =>
            typeof (item as { name?: unknown } | null)?.name === "string"
        )
        .map((item) => ({ name: item.name, default: item.default === true }))
    : [];
  return { ok: true, printers };
}

export type PrinterState = "ok" | "busy" | "disabled" | "offline" | "unknown";

export type PrinterStatusResult = {
  ok: boolean;
  state: PrinterState;
  printer: string | null;
  media: string | null;
  queue: number;
  reason?: string;
};

export type CupsJobSnapshot = {
  id: string;
  status: CupsPrintResult["status"];
  attempts: number;
  next_retry_at: string | null;
  failure_kind: string | null;
  error: string | null;
};

function asPrinterState(value: unknown): PrinterState {
  return value === "ok" ||
    value === "busy" ||
    value === "disabled" ||
    value === "offline" ||
    value === "unknown"
    ? value
    : "unknown";
}

/**
 * Status printer lewat bridge. Bridge mati bukan error: pemanggil hanya perlu
 * tahu "tidak bisa dipastikan" dan tetap boleh menampilkan setelan.
 */
export async function fetchPrinterStatus(
  settings: PrintSettingsInput | null | undefined,
  printerName?: string
): Promise<PrinterStatusResult | null> {
  const query = printerName ? `?printer=${encodeURIComponent(printerName)}` : "";
  let response: Response;
  try {
    response = await fetch(`${cupsBridgeUrl(settings)}/v1/printer/status${query}`, {
      method: "GET",
      headers: bridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return null;
  return {
    ok: body.ok === true,
    state: asPrinterState(body.state),
    printer: typeof body.printer === "string" ? body.printer : null,
    media: typeof body.media === "string" ? body.media : null,
    queue: typeof body.queue === "number" ? body.queue : 0,
    reason:
      typeof body.reason === "string"
        ? body.reason
        : typeof body.message === "string"
          ? body.message
          : undefined,
  };
}

/** Aktifkan printer `disabled` (bukan `offline`/paper-out). */
export async function enableCupsPrinter(
  settings: PrintSettingsInput | null | undefined,
  printerName?: string
): Promise<PrinterStatusResult | null> {
  let response: Response;
  try {
    response = await fetch(`${cupsBridgeUrl(settings)}/v1/printer/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bridgeHeaders() },
      cache: "no-store",
      body: JSON.stringify(printerName ? { printer: printerName } : {}),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return null;
  return {
    ok: body.ok === true,
    state: asPrinterState(body.state),
    printer: typeof body.printer === "string" ? body.printer : null,
    media: null,
    queue: 0,
  };
}

/** Status job antrean runtime; `null` = bridge tidak menjawab. */
export async function fetchPrintJob(
  settings: PrintSettingsInput | null | undefined,
  jobId: string
): Promise<CupsJobSnapshot | null> {
  let response: Response;
  try {
    response = await fetch(
      `${cupsBridgeUrl(settings)}/print/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: bridgeHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { job?: Record<string, unknown> } | null;
  const job = body?.job;
  if (!job || typeof job.id !== "string") return null;
  return {
    id: job.id,
    status:
      job.status === "queued" ||
      job.status === "printing" ||
      job.status === "submitted" ||
      job.status === "done" ||
      job.status === "failed"
        ? job.status
        : "submitted",
    attempts: typeof job.attempts === "number" ? job.attempts : 0,
    next_retry_at: typeof job.next_retry_at === "string" ? job.next_retry_at : null,
    failure_kind: typeof job.failure_kind === "string" ? job.failure_kind : null,
    error: typeof job.error === "string" ? job.error : null,
  };
}

/**
 * Struk teks ke CUPS. Memakai rute `/printer/test` yang memang mencetak teks
 * ke printer (bridge belum punya rute struk khusus); `paper_width_mm` membuat
 * runtime memakai geometri gulungan 58/80mm, bukan preset kertas foto.
 */
export async function submitCupsReceipt(
  settings: PrintSettingsInput | null | undefined,
  input: { title: string; lines: string[]; paperWidthMm: 58 | 80 }
): Promise<void> {
  await postBridge(settings, "/printer/test", {
    printer_name: settings?.printer_name,
    paper_width_mm: input.paperWidthMm,
    title: input.title,
    lines: input.lines,
  });
}
