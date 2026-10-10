import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, ScanBarcode } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPosBooths } from "@/server/pos-products";

export const metadata: Metadata = {
  title: "Terminal POS — SnapyOS",
};

/** /pos — gate: pilih booth aktif (docs/pos/03 §5.2). Booth off tidak tampil;
 *  server memvalidasi ulang saat submit (POS_BOOTH_DISABLED). */
export default async function PosGatePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const booths = (await listPosBooths(user.id, active.business.id)).filter(
    (b) => b.pos_enabled
  );

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1100px] flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// TERMINAL POS — " + active.business.name.toUpperCase()}
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-tight md:text-5xl">
          Pilih booth
        </h1>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Buka terminal kasir di booth yang aktif. Anda masuk sebagai{" "}
          <span className="font-mono uppercase">{active.role}</span>.
        </p>
      </header>

      {booths.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-2 border-dashed border-ink/40 bg-muted p-8">
          <ScanBarcode className="size-8" aria-hidden />
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"/// Belum ada booth POS aktif"}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Owner/manager mengaktifkan POS per booth di halaman manajemen POS.
          </p>
          <Link href="/dashboard/pos" className={cn(buttonVariants({ variant: "outline" }))}>
            Ke manajemen POS
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111] sm:grid-cols-2 lg:grid-cols-3">
          {booths.map((booth) => (
            <li key={booth.id} className="flex bg-surface">
              <Link
                href={`/pos/terminal?photobox=${booth.id}`}
                className="flex w-full flex-col gap-3 border-2 border-transparent p-5 transition-colors hover:border-ink hover:bg-accent active:translate-x-[2px] active:translate-y-[2px]"
              >
                <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  <Camera className="size-4" aria-hidden />
                  {booth.outlet_name ?? "—"}
                </span>
                <span className="font-display text-xl uppercase tracking-tight">
                  {booth.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {">>> BUKA TERMINAL"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
