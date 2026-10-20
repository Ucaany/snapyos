/**
 * Halaman maintenance mode global — ditampilkan proxy bila
 * `platform_settings.maintenance_mode = true` untuk visitor non-admin.
 * Docs/10 §10.4. Pesan kustom (maintenance_message) dibaca dari
 * platform_settings — dynamic agar toggle admin langsung tercermin.
 */

import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getMaintenanceMessage(): Promise<string> {
  try {
    const { data } = await createServerClient()
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_message")
      .maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    return typeof v === "string" && v.length > 0
      ? v
      : "Platform sedang dalam masa perawatan. Silakan coba kembali beberapa saat lagi.";
  } catch {
    return "Platform sedang dalam masa perawatan. Silakan coba kembali beberapa saat lagi.";
  }
}

export default async function MaintenancePage() {
  const message = await getMaintenanceMessage();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-xl border-2 border-ink bg-surface p-8 shadow-[6px_6px_0_0_#111111]">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {"/// STATUS 503"}
        </p>
        <h1 className="mt-4 font-display text-4xl uppercase leading-tight tracking-tight md:text-5xl">
          Sedang Perawatan Sistem
        </h1>
        <p className="mt-6 max-w-[55ch] font-mono text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <div className="mt-8 border-t-2 border-ink/10 pt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Butuh info lebih lanjut?
          </p>
          <p className="mt-2 font-mono text-xs text-ink">
            Hubungi tim SnapyOS via kanal support Anda.
          </p>
        </div>
      </div>
    </main>
  );
}
