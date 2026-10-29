// Relatif (bukan `@/`) agar tes `node --experimental-strip-types` bisa impor modul ini.
import { bridgeHeaders } from "../bridge-token.ts";
import { DEFAULT_BRIDGE_URL, isLoopbackBridgeUrl } from "../bridge-url.ts";
import type { PrintSettingsInput } from "@/lib/print-layout";

export type CupsTestInput = { title: string; lines: string[] };

/**
 * Tujuan bridge CUPS. Nilai dari settings hanya dipakai bila loopback — baris
 * lama (atau data yang lolos sebelum validasi) tidak boleh membelokkan foto
 * customer + token bridge ke origin lain.
 */
export function cupsBridgeUrl(settings?: PrintSettingsInput | null): string {
  const configured = settings?.bridge_url?.trim();
  const safe = configured && isLoopbackBridgeUrl(configured) ? configured : DEFAULT_BRIDGE_URL;
  return safe.replace(/\/$/, "");
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
  pathname: "/print" | "/printer/test",
  body: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${cupsBridgeUrl(settings)}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bridgeHeaders() },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Token bridge belum diisi atau salah.");
    const result = await response.json().catch(() => null);
    throw new Error(
      typeof result?.message === "string" ? result.message : "Bridge CUPS tidak bisa mengirim cetak."
    );
  }
}

export async function submitCupsPrint(
  settings: PrintSettingsInput | null | undefined,
  sheets: Blob[][]
): Promise<void> {
  await postBridge(settings, "/print", {
    paper_size: settings?.paper_size,
    orientation: settings?.orientation,
    margins_mm: settings?.margins_mm,
    printer_name: settings?.printer_name,
    sheets: await Promise.all(sheets.map((sheet) => Promise.all(sheet.map(blobBase64)))),
  });
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
