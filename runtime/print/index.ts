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

export type PrinterState = "ok" | "busy" | "disabled" | "offline" | "unknown";

export type PrinterHealth = {
  ok: boolean;
  printer: string | null;
  state: PrinterState;
  output: string;
  media?: string | null;
  queue?: number;
};

export type PrinterJob = { id: string; printer: string; state: string; size?: number };
export type SubmitResult = { job_id: string | null; detail?: string };
export type PrinterInfo = { name: string; default: boolean };

export type PrinterAdapter = {
  readonly kind: "cups" | "windows" | "mock";
  readonly mock: boolean;
  /** Deteksi read-only; tidak mengubah antrean maupun setelan. */
  list(): Promise<PrinterInfo[]>;
  health(printerName?: string): Promise<PrinterHealth>;
  jobs(printerName?: string): Promise<PrinterJob[]>;
  enable(printerName?: string): Promise<PrinterHealth>;
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

/**
 * CUPS menyebut keadaan dalam prosa (`printer X is idle`, `... disabled since`).
 * Urutan penting: printer yang disabled biasanya juga melaporkan `idle`.
 */
export function classifyCupsState(output: string): PrinterState {
  if (/\bdisabled\b/i.test(output)) return "disabled";
  if (/\boffline\b/i.test(output)) return "offline";
  if (/\b(?:printing|processing)\b/i.test(output)) return "busy";
  if (/\b(?:idle|enabled)\b/i.test(output)) return "ok";
  return "unknown";
}

/** `PrinterStatus` PowerShell → state internal. */
export function classifyWindowsStatus(status: string): PrinterState {
  const value = status.trim().toLowerCase();
  if (!value) return "unknown";
  if (/normal|idle/.test(value)) return "ok";
  if (/printing|processing/.test(value)) return "busy";
  if (/paused|error/.test(value)) return "disabled";
  if (/offline|notavailable/.test(value)) return "offline";
  return "unknown";
}

/** `lpstat -o [-W not-completed]`: `printer-id user size date...`. */
export function parseCupsJobs(output: string, printerName?: string): PrinterJob[] {
  const jobs: PrinterJob[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(\S+)\s+(\S+)\s+(\d+)\b/.exec(line);
    if (!match) continue;
    const id = match[1]!;
    const printer = printerName || id.replace(/-\d+$/, "") || "unknown";
    jobs.push({ id, printer, state: "queued", size: Number(match[3]) });
  }
  return jobs;
}

/** Output PowerShell `"$($_.Id)|$($_.DocumentName)|$($_.JobStatus)|$($_.Size)"`. */
export function parseWindowsJobs(output: string, printerName?: string): PrinterJob[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, , state, size] = line.split("|");
      return {
        id: (id || "").trim(),
        printer: printerName || "unknown",
        state: (state || "unknown").trim().toLowerCase(),
        ...(Number(size) > 0 ? { size: Number(size) } : {}),
      };
    })
    .filter((job) => job.id.length > 0);
}

/** Baris media CUPS (`media:` / `Form mounted:`) bila driver melaporkannya. */
export function parseCupsMedia(output: string): string | null {
  for (const raw of output.split(/\r?\n/)) {
    const match = /^\s*(?:media|form mounted)\s*[:=]\s*(.+)$/i.exec(raw.trim());
    if (match?.[1]) return match[1].trim().slice(0, 120);
  }
  return null;
}

function createCupsPrinter(config: RuntimeConfig): PrinterAdapter {
  const localized = (args: string[], timeoutMs: number) =>
    runCommand(config.lpstatBin, args, timeoutMs, { LANG: "C", LC_ALL: "C" });

  async function resolveDefault(): Promise<string | null> {
    const fallback = await localized(["-d"], 10_000);
    return /system default destination:\s*(\S+)/i.exec(fallback.stdout.toString("utf8"))?.[1] ?? null;
  }

  async function queueSize(printerName: string | null): Promise<number | undefined> {
    try {
      const args = ["-o", "-W", "not-completed"];
      if (printerName) args.splice(1, 0, printerName);
      const result = await localized(args, 10_000);
      return parseCupsJobs(result.stdout.toString("utf8"), printerName ?? undefined).length;
    } catch {
      return undefined;
    }
  }

  function adapterHealth(
    printerName: string | null,
    state: PrinterState,
    output: string,
    media: string | null,
    queue: number | undefined
  ): PrinterHealth {
    return {
      ok: state === "ok" || state === "busy",
      printer: printerName,
      state,
      output,
      ...(media ? { media } : { media: null }),
      ...(queue !== undefined ? { queue } : {}),
    };
  }

  return {
    kind: "cups",
    mock: false,

    async list() {
      const result = await localized(["-p", "-d"], 10_000);
      return parseCupsPrinters(result.stdout.toString("utf8"));
    },

    async health(printerName) {
      // `-l` wajib: CUPS hanya menulis "The printer is offline." di mode long.
      const args = ["-p", "-l"];
      if (printerName) args.push(printerName);
      let output = "";
      try {
        const result = await localized(args, 10_000);
        output = result.stdout.toString("utf8").trim();
      } catch (error) {
        // Printer tidak ada / nama salah tetap harus terbaca sebagai status,
        // bukan membuat kiosk kehilangan seluruh halaman setelan.
        output = error instanceof Error ? error.message : String(error);
      }
      const resolved = printerName || (await resolveDefault());
      const state = resolved ? classifyCupsState(output) : "unknown";
      const media = parseCupsMedia(output);
      const queue = await queueSize(resolved);
      return adapterHealth(resolved, state, output, media, queue);
    },

    async jobs(printerName) {
      const resolved = printerName || (await resolveDefault());
      const args = ["-o", "-W", "not-completed"];
      if (resolved) args.splice(1, 0, resolved);
      const result = await localized(args, 10_000);
      return parseCupsJobs(result.stdout.toString("utf8"), resolved ?? undefined);
    },

    async enable(printerName) {
      const resolved = printerName || (await resolveDefault());
      if (!resolved) throw new Error("Printer default CUPS belum diatur. Jalankan lpoptions -d <printer>.");
      await runCommand(config.cupsenableBin, [resolved], 10_000, { LANG: "C", LC_ALL: "C" });
      return this.health(resolved);
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
        // `-n 1` tetap: `copies` sudah digandakan `printSheets` (hindari cetak ganda).
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

  async function resolveDefault(): Promise<string | null> {
    const result = await ps(
      `$p = Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1; ` +
        `if ($p) { $p.Name }`,
      15_000
    );
    return result.stdout.toString("utf8").trim() || null;
  }

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
      let output = "";
      try {
        const result = await ps(script, 15_000);
        output = result.stdout.toString("utf8").trim();
      } catch (error) {
        output = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          printer: printerName || null,
          state: "unknown",
          output,
          media: null,
        };
      }
      const [name = "", status = "", driver = ""] = output.split("|");
      const state = classifyWindowsStatus(status);
      let queue: number | undefined;
      try {
        queue = (await this.jobs(printerName || name || undefined)).length;
      } catch {
        queue = undefined;
      }
      return {
        ok: state === "ok" || state === "busy",
        printer: printerName || name || null,
        state,
        output: [output, driver].filter(Boolean).join("|"),
        media: null,
        ...(queue !== undefined ? { queue } : {}),
      };
    },

    async jobs(printerName) {
      const resolved = printerName || (await resolveDefault());
      if (!resolved) return [];
      const result = await ps(
        `Get-PrintJob -PrinterName ${psQuote(resolved)} | ` +
          `ForEach-Object { "$($_.Id)|$($_.DocumentName)|$($_.JobStatus)|$($_.Size)" }`,
        15_000
      );
      return parseWindowsJobs(result.stdout.toString("utf8"), resolved);
    },

    async enable(printerName) {
      const resolved = printerName || (await resolveDefault());
      if (!resolved) throw new Error("Tidak ada printer default di Windows.");
      await ps(`Resume-Printer -Name ${psQuote(resolved)} -ErrorAction Stop`, 15_000);
      return this.health(resolved);
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
  const health = (printerName?: string): PrinterHealth => ({
    ok: true,
    printer: printerName || "MOCK_PRINTER",
    state: "ok",
    output: "mock printer siap",
    media: null,
    queue: 0,
  });
  return {
    kind: "mock",
    mock: true,
    async list() {
      return [];
    },
    async health(printerName) {
      return health(printerName);
    },
    async jobs() {
      return [];
    },
    async enable(printerName) {
      return health(printerName);
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
