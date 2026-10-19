/**
 * Health / readiness check — dipakai Nginx, systemd, dan uptime monitor.
 *
 * Kontrak: docs/08-api-spec.md §8.20. Bentuk lama (`status`/`service`/`time`)
 * dipertahankan; `checks` bersifat aditif. Status HTTP: 200 bila semua probe
 * lulus, 503 bila ada yang gagal — supaya `curl -f` / `systemctl` bisa
 * membedakan app hidup tapi tidak siap dari app yang benar-benar mati.
 *
 * Path ini ada di allowlist `src/proxy.ts`, jadi route TIDAK BOLEH melempar:
 * semua kegagalan ditangkap `probe()` dan dikembalikan sebagai `checks.*.ok`.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getWriteStorage } from "@/server/storage";
import { buildHealthReport, probe, type HealthReport } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Round-trip DB termurah yang membuktikan kredensial + jaringan hidup. */
async function probeDatabase(): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("platform_settings").select("key").limit(1);
  if (error) throw new Error(error.message);
}

/**
 * Probe storage: `head()` pada key yang pasti tidak ada. Balasan tegas
 * `false`/`true` = provider terjangkau dan kredensial sah; `null` = provider
 * error/tidak terkonfigurasi (lihat `StorageProvider.head`).
 */
async function probeStorage(): Promise<void> {
  const storage = getWriteStorage();
  const result = await storage.head("generated-photos", "__healthcheck__/probe");
  if (result === null) {
    throw new Error(`storage ${storage.name} tidak terjangkau`);
  }
}

export async function GET() {
  const [database, storage] = await Promise.all([
    probe(probeDatabase),
    probe(probeStorage),
  ]);
  const report: HealthReport = buildHealthReport({ database, storage });
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
