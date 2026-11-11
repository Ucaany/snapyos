import { statfsSync } from "node:fs";
import os from "node:os";
import { redactSensitive } from "../src/lib/error-redaction.ts";
import { getMeta, readQueueDiagnostics, readVersion, type DatabaseSync } from "./db/index.ts";
const EXIT_PIN_HASH_KEY = "exit_pin_emergency_hash";
const EXIT_PIN_LOCKED_KEY = "exit_pin_locked_until";
import type { RuntimeConfig } from "./config.ts";
import type { CameraStatus } from "./camera/types.ts";
import type { PrinterHealth } from "./print/index.ts";
import type { PrintJobStats } from "./print/jobs.ts";

export type PrinterMode = "browser" | "bluetooth" | "cups";
export type PrinterDiagnostics = Pick<PrinterHealth, "ok" | "printer"> & {
  adapter: string;
  mock: boolean;
  output?: string;
  state?: PrinterHealth["state"];
  media?: string | null;
  queue?: number;
  last_error?: string;
  mode?: PrinterMode;
  job?: PrintJobStats | null;
};

export const DIAGNOSTICS_SCHEMA_VERSION = 1;
export const DIAGNOSTICS_ERROR_LIMIT = 5;
const ERROR_MAX = 200;

export type DiagnosticError = { source: string; at: string; message: string };
export type QueueDiagnostics = {
  pending: number;
  due: number;
  retrying: number;
  running: number;
  quarantined: number;
  latest_error: string | null;
};
export type DiskDiagnostics = {
  total_bytes: number;
  free_bytes: number;
  available_bytes: number;
  used_bytes: number;
  healthy: boolean;
};
export type LocalDiagnosticsReport = {
  schema_version: number;
  generated_at: string;
  runtime: { version: string; node: string; platform: string; arch: string };
  schema: { db: number; settings: number };
  hardware: {
    camera: CameraStatus;
    camera_stream: CameraStatus | null;
    printer: Pick<PrinterHealth, "ok" | "printer"> & {
      adapter: string;
      mock: boolean;
      state?: PrinterHealth["state"];
      media?: string | null;
      queue?: number;
      last_error?: string;
      mode?: PrinterMode;
      job?: PrintJobStats | null;
    };
  };
  disk: DiskDiagnostics | null;
  queue: QueueDiagnostics;
  pairing: {
    cloud_configured: boolean;
    device_token_configured: boolean;
    paired: boolean;
    business_slug: string | null;
    photobox_slug: string | null;
  };
  lockdown: {
    local_pin_configured: boolean;
    local_pin_locked: boolean;
    local_pin_locked_until: string | null;
    cloud_kiosk_locked: boolean | null;
  };
  last_errors: DiagnosticError[];
};

export type CloudHeartbeatSummary = {
  runtime_version: string;
  db_version: number;
  camera: { adapter: string; connected: boolean };
  printer: {
    adapter: string;
    ok: boolean;
    state?: PrinterHealth["state"];
    media?: string | null;
    queue?: number;
    mode?: PrinterMode;
    job?: PrintJobStats | null;
  };
  queue: { pending: number; retrying: number };
  lockdown: {
    local_pin_configured: boolean;
    local_pin_locked: boolean;
    cloud_kiosk_locked: boolean | null;
  };
};

type DiagnosticsInput = {
  config: RuntimeConfig;
  db: DatabaseSync;
  camera: CameraStatus;
  cameraStream: CameraStatus | null;
  printer: PrinterDiagnostics;
  now?: () => number;
  errors?: DiagnosticError[];
  disk?: DiskDiagnostics | null;
};

function bounded(value: unknown): string {
  const safe = redactSensitive(String(value)).replace(/\s+/g, " ").trim();
  return safe.length > ERROR_MAX ? `${safe.slice(0, ERROR_MAX)}…` : safe;
}

function diskStatus(dataDir: string): DiskDiagnostics | null {
  try {
    const stats = statfsSync(dataDir);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bfree) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return {
      total_bytes: total,
      free_bytes: free,
      available_bytes: available,
      used_bytes: Math.max(0, total - free),
      healthy: available > 256 * 1024 * 1024,
    };
  } catch {
    return null;
  }
}

function safeErrors(errors: DiagnosticError[]): DiagnosticError[] {
  return errors.slice(-DIAGNOSTICS_ERROR_LIMIT).map((error) => ({
    source: bounded(error.source),
    at: bounded(error.at),
    message: bounded(error.message),
  }));
}

export function buildLocalDiagnostics(input: DiagnosticsInput): LocalDiagnosticsReport {
  const now = input.now ?? Date.now;
  const generatedAt = new Date(now()).toISOString();
  const queue = readQueueDiagnostics(input.db, now());
  const businessSlug = getMeta(input.db, "business_slug");
  const photoboxSlug = getMeta(input.db, "photobox_slug");
  const tokenConfigured = Boolean(input.config.deviceToken);
  const lockedUntil = getMeta(input.db, EXIT_PIN_LOCKED_KEY);
  const lockedAt = lockedUntil ? new Date(lockedUntil).getTime() : 0;
  const localPinConfigured = Boolean(getMeta(input.db, EXIT_PIN_HASH_KEY));
  const cloudLockedRaw = getMeta(input.db, "cloud_kiosk_locked");
  const cloudLocked =
    cloudLockedRaw === null || cloudLockedRaw === "" ? null : cloudLockedRaw === "true";
  const errors = [...(input.errors ?? [])];
  if (input.camera.last_error)
    errors.push({ source: "camera", at: generatedAt, message: input.camera.last_error });
  if (input.cameraStream?.last_error)
    errors.push({
      source: "camera_stream",
      at: generatedAt,
      message: input.cameraStream.last_error,
    });
  if (input.printer.last_error)
    errors.push({ source: "printer", at: generatedAt, message: input.printer.last_error });
  if (queue.latest_error)
    errors.push({ source: "queue", at: generatedAt, message: queue.latest_error });

  return {
    schema_version: DIAGNOSTICS_SCHEMA_VERSION,
    generated_at: generatedAt,
    runtime: {
      version: input.config.runtimeVersion,
      node: process.version,
      platform: process.platform,
      arch: os.arch(),
    },
    schema: { db: readVersion(input.db), settings: 1 },
    hardware: {
      camera: input.camera,
      camera_stream: input.cameraStream,
      printer: input.printer,
    },
    disk: input.disk === undefined ? diskStatus(input.config.dataDir) : input.disk,
    queue,
    pairing: {
      cloud_configured: Boolean(input.config.cloudUrl),
      device_token_configured: tokenConfigured,
      paired:
        tokenConfigured &&
        Boolean(businessSlug && photoboxSlug) &&
        getMeta(input.db, "cloud_paired") !== "false",
      business_slug: businessSlug,
      photobox_slug: photoboxSlug,
    },
    lockdown: {
      local_pin_configured: localPinConfigured,
      local_pin_locked: lockedAt > now(),
      local_pin_locked_until: lockedUntil || null,
      cloud_kiosk_locked: cloudLocked,
    },
    last_errors: safeErrors(errors),
  };
}

export function buildCloudHeartbeat(report: LocalDiagnosticsReport): CloudHeartbeatSummary {
  return {
    runtime_version: report.runtime.version,
    db_version: report.schema.db,
    camera: {
      adapter: report.hardware.camera.adapter,
      connected: report.hardware.camera.connected,
    },
    printer: {
      adapter: report.hardware.printer.adapter,
      ok: report.hardware.printer.ok,
      ...(report.hardware.printer.state ? { state: report.hardware.printer.state } : {}),
      ...(report.hardware.printer.media !== undefined
        ? { media: report.hardware.printer.media }
        : {}),
      ...(report.hardware.printer.queue !== undefined
        ? { queue: report.hardware.printer.queue }
        : {}),
      ...(report.hardware.printer.mode ? { mode: report.hardware.printer.mode } : {}),
      ...(report.hardware.printer.job !== undefined ? { job: report.hardware.printer.job } : {}),
    },
    queue: { pending: report.queue.pending, retrying: report.queue.retrying },
    lockdown: {
      local_pin_configured: report.lockdown.local_pin_configured,
      local_pin_locked: report.lockdown.local_pin_locked,
      cloud_kiosk_locked: report.lockdown.cloud_kiosk_locked,
    },
  };
}

export function serializeDiagnostics(report: LocalDiagnosticsReport): string {
  return JSON.stringify(report);
}

export function serializeCloudHeartbeat(report: LocalDiagnosticsReport): string {
  return JSON.stringify(buildCloudHeartbeat(report));
}

export function buildManualDiagnosticsExport(report: LocalDiagnosticsReport): string {
  const safeReport = {
    ...report,
    hardware: {
      camera: {
        adapter: report.hardware.camera.adapter,
        connected: report.hardware.camera.connected,
        mock: report.hardware.camera.mock,
        model: report.hardware.camera.model,
        port: report.hardware.camera.port,
      },
      camera_stream: report.hardware.camera_stream
        ? {
            adapter: report.hardware.camera_stream.adapter,
            connected: report.hardware.camera_stream.connected,
            mock: report.hardware.camera_stream.mock,
            model: report.hardware.camera_stream.model,
            port: report.hardware.camera_stream.port,
          }
        : null,
      printer: {
        adapter: report.hardware.printer.adapter,
        ok: report.hardware.printer.ok,
        mock: report.hardware.printer.mock,
        state: report.hardware.printer.state,
        media: report.hardware.printer.media,
        queue: report.hardware.printer.queue,
      },
    },
    last_errors: safeErrors(report.last_errors),
  };
  return JSON.stringify({
    format: "snapyos.local-diagnostics",
    schema_version: DIAGNOSTICS_SCHEMA_VERSION,
    exported_at: report.generated_at,
    report: safeReport,
    excluded: [
      "photos",
      "videos",
      "pin",
      "tokens",
      "payment_secrets",
      "full_local_logs",
      "media_paths",
    ],
  });
}
