/**
 * Adapter printer — satu antarmuka, dua OS.
 *
 * Aturan yang mengikat semua adapter: `submit()` berarti **spooler menerima**,
 * bukan kertas keluar. Status `completed` hanya boleh datang dari konfirmasi
 * operator atau bukti tambahan, tidak pernah dari exit code perintah cetak.
 */

import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "../config.ts";
import { runCommand } from "../http.ts";
import { printGeometry, type Geometry } from "./geometry.ts";

export type PrinterHealth = { ok: boolean; printer: string | null; output: string };
export type SubmitResult = { job_id: string | null; detail?: string };
export type PrinterInfo = { name: string; default: boolean };

export type PrinterAdapter = {
  readonly kind: "cups" | "windows" | "mock";
  readonly mock: boolean;
  /** Deteksi read-only; tidak mengubah antrean maupun setelan. */
  list(): Promise<PrinterInfo[]>;
  health(printerName?: string): Promise<PrinterHealth>;
  submit(
    pdf: Buffer,
    printerName: string,
    geometry: Geometry,
    mediaName?: string
  ): Promise<SubmitResult>;
};

async function withTempPdf(pdf: Buffer, task: (file: string) => Promise<SubmitResult>) {
  const file = join(tmpdir(), `snapyos-${randomUUID()}.pdf`);
  try {
    await writeFile(file, pdf);
    return await task(file);
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

/** `lpstat -p -d`: baris `printer X is ...` + `system default destination: X`. */
export function parseCupsPrinters(output: string): PrinterInfo[] {
  const names = new Set<string>();
  let fallback: string | null = null;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const printer = /^printer\s+(\S+)\s+is\b/i.exec(line);
    if (printer) names.add(printer[1]!);
    const def = /^system default destination:\s*(\S+)/i.exec(line);
    if (def) fallback = def[1]!;
  }
  if (fallback) names.add(fallback);
  return [...names].sort().map((name) => ({ name, default: name === fallback }));
}

/** Output PowerShell `"$($_.Name)|$($_.Default)"` per printer. */
export function parseWindowsPrinters(output: string): PrinterInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, def] = line.split("|");
      return { name: (name || "").trim(), default: /^true$/i.test((def || "").trim()) };
    })
    .filter((entry) => entry.name.length > 0);
}

function createCupsPrinter(config: RuntimeConfig): PrinterAdapter {
  return {
    kind: "cups",
    mock: false,

    async list() {
      const result = await runCommand(config.lpstatBin, ["-p", "-d"], 10_000);
      return parseCupsPrinters(result.stdout.toString("utf8"));
    },

    async health(printerName) {
      // `-l` wajib: CUPS hanya menulis "The printer is offline." di mode long.
      const args = ["-p", "-l"];
      if (printerName) args.push(printerName);
      const result = await runCommand(config.lpstatBin, args, 10_000);
      const output = result.stdout.toString("utf8").trim();
      if (/\bdisabled\b/i.test(output)) {
        throw new Error(`Printer ${printerName || "default"} sedang disabled di CUPS.`);
      }
      if (/\boffline\b/i.test(output)) {
        throw new Error(`Printer ${printerName || "default"} offline di CUPS.`);
      }
      let defaultOutput = "";
      if (!printerName) {
        const fallback = await runCommand(config.lpstatBin, ["-d"], 10_000);
        defaultOutput = fallback.stdout.toString("utf8").trim();
        if (!/system default destination:\s*\S+/i.test(defaultOutput)) {
          throw new Error("Printer default CUPS belum diatur. Jalankan lpoptions -d <printer>.");
        }
      }
      const defaultName = /system default destination:\s*(\S+)/i.exec(defaultOutput)?.[1] ?? null;
      return {
        ok: true,
        printer: printerName || defaultName,
        output: [output, defaultOutput].filter(Boolean).join("\n"),
      };
    },

    submit(pdf, printerName, geometry, mediaName) {
      return withTempPdf(pdf, async (file) => {
        const args: string[] = [];
        if (printerName) args.push("-d", printerName);
        // Nama media driver bisa berbeda per printer (DNP/Citizen/Selphy);
        // owner dapat mengisinya lewat `print_settings.media_name`.
        const media =
          (mediaName && mediaName.trim().slice(0, 120)) ||
          `Custom.${geometry.widthMm}x${geometry.heightMm}mm`;
        args.push("-n", "1", "-o", `media=${media}`, "-o", "fit-to-page", file);
        try {
          const result = await runCommand(config.cupsBin, args, config.timeoutMs);
          return { job_id: result.stdout.toString("utf8").trim() || null };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${message}. Periksa printer dengan \`lpstat -p\` dan printer default dengan \`lpoptions -d\`.`
          );
        }
      });
    },
  };
}

/** Kutip tunggal PowerShell: `'` di dalam nilai digandakan. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function createWindowsPrinter(config: RuntimeConfig): PrinterAdapter {
  const ps = (script: string, timeoutMs: number) =>
    runCommand(
      config.powershellBin,
      ["-NoProfile", "-NonInteractive", "-Command", script],
      timeoutMs
    );

  return {
    kind: "windows",
    mock: false,

    async list() {
      const result = await ps(
        `Get-Printer | ForEach-Object { "$($_.Name)|$($_.Default)" }`,
        15_000
      );
      return parseWindowsPrinters(result.stdout.toString("utf8"));
    },

    async health(printerName) {
      const script = printerName
        ? `$p = Get-Printer -Name ${psQuote(printerName)} -ErrorAction Stop; ` +
          `"$($p.Name)|$($p.PrinterStatus)|$($p.DriverName)"`
        : `$p = Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1; ` +
          `if (-not $p) { throw 'Tidak ada printer default di Windows.' }; ` +
          `"$($p.Name)|$($p.PrinterStatus)|$($p.DriverName)"`;
      const result = await ps(script, 15_000);
      const output = result.stdout.toString("utf8").trim();
      if (/\b(?:Offline|Error|NotAvailable)\b/i.test(output)) {
        throw new Error(`Printer Windows tidak siap: ${output}`);
      }
      return { ok: true, printer: printerName || output.split("|")[0] || null, output };
    },

    submit(pdf, printerName, _geometry) {
      return withTempPdf(pdf, async (file) => {
        const target = printerName || (await this.health()).printer;
        if (!target) throw new Error("Printer tujuan tidak diketahui.");
        await runCommand(
          config.sumatraBin,
          ["-print-to", target, "-exit-when-done", "-silent", file],
          config.timeoutMs
        );
        // SumatraPDF tidak mengembalikan ID job. ID harus dicari terpisah di
        // antrean spooler; tanpa itu status hanya `submitted`.
        return { job_id: null, detail: `Dikirim ke ${target}.` };
      });
    },
  };
}

function createMockPrinter(): PrinterAdapter {
  let counter = 0;
  return {
    kind: "mock",
    mock: true,
    async list() {
      return [];
    },
    async health(printerName) {
      return { ok: true, printer: printerName || "MOCK_PRINTER", output: "mock printer siap" };
    },
    async submit() {
      counter += 1;
      return { job_id: `MOCK-${counter}`, detail: "Mock: tidak ada kertas yang keluar." };
    },
  };
}

export function createPrinter(config: RuntimeConfig): PrinterAdapter {
  switch (config.printer) {
    case "mock":
      return createMockPrinter();
    case "windows":
      return createWindowsPrinter(config);
    case "cups":
      return createCupsPrinter(config);
  }
}

/** Dipakai `/print` dan `/printer/test` supaya keduanya tidak menduplikasi PDF. */
export { printGeometry };
