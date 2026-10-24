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

export type PrinterAdapter = {
  readonly kind: "cups" | "windows" | "mock";
  readonly mock: boolean;
  health(printerName?: string): Promise<PrinterHealth>;
  submit(pdf: Buffer, printerName: string, geometry: Geometry): Promise<SubmitResult>;
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

function createCupsPrinter(config: RuntimeConfig): PrinterAdapter {
  return {
    kind: "cups",
    mock: false,

    async health(printerName) {
      const args = ["-p"];
      if (printerName) args.push(printerName);
      const result = await runCommand(config.lpstatBin, args, 10_000);
      const output = result.stdout.toString("utf8").trim();
      if (/\bdisabled\b/i.test(output)) {
        throw new Error(`Printer ${printerName || "default"} sedang disabled di CUPS.`);
      }
      let defaultOutput = "";
      if (!printerName) {
        const fallback = await runCommand(config.lpstatBin, ["-d"], 10_000);
        defaultOutput = fallback.stdout.toString("utf8").trim();
        if (!/system default destination:\s*\S+/i.test(defaultOutput)) {
          throw new Error("Printer default CUPS belum diatur. Jalankan lpoptions -d <printer>.");
        }
      }
      return {
        ok: true,
        printer: printerName || null,
        output: [output, defaultOutput].filter(Boolean).join("\n"),
      };
    },

    submit(pdf, printerName, geometry) {
      return withTempPdf(pdf, async (file) => {
        const args: string[] = [];
        if (printerName) args.push("-d", printerName);
        args.push(
          "-n",
          "1",
          "-o",
          `media=Custom.${geometry.widthMm}x${geometry.heightMm}mm`,
          "-o",
          "fit-to-page",
          file
        );
        const result = await runCommand(config.cupsBin, args, config.timeoutMs);
        return { job_id: result.stdout.toString("utf8").trim() || null };
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
    runCommand(config.powershellBin, ["-NoProfile", "-NonInteractive", "-Command", script], timeoutMs);

  return {
    kind: "windows",
    mock: false,

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
