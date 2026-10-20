import { Camera, Power, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { PosBoothRow } from "@/server/pos-products";
import { posToggleBoothAction } from "@/server/pos-actions";

/**
 * PosBoothsTable — toggle POS per booth (A13, docs/pos/03 §3.2).
 * Toggle = server action scoped `.eq(business_id)` — UI bukan pengaman.
 */
export function PosBoothsTable({
  booths,
  canManage,
}: {
  booths: PosBoothRow[];
  canManage: boolean;
}) {
  if (booths.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        eyebrow="Belum ada booth"
        title="Booth photobox milik business akan muncul di sini."
        body="Aktifkan POS di 1 booth untuk membuka terminal kasir di booth tersebut."
      />
    );
  }

  const hasActive = booths.some((b) => b.pos_enabled);

  return (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">Booth POS</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Booth
            </th>
            <th scope="col" className="px-4 py-3.5">
              Outlet
            </th>
            <th scope="col" className="px-4 py-3.5">
              Status device
            </th>
            <th scope="col" className="px-4 py-3.5">
              POS
            </th>
            {canManage && (
              <th scope="col" className="px-4 py-3.5 text-right">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {booths.map((booth) => (
            <tr
              key={booth.id}
              className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60"
            >
              <td className="px-4 py-4 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                {booth.name}
              </td>
              <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                {booth.outlet_name ?? "-"}
              </td>
              <td className="px-4 py-4 font-mono text-xs uppercase">{booth.status}</td>
              <td className="px-4 py-4">
                <span
                  className={cn(
                    "inline-flex h-6 items-center border-2 border-ink px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
                    booth.pos_enabled ? "bg-accent-3 text-ink" : "bg-muted text-muted-foreground"
                  )}
                >
                  {booth.pos_enabled ? "aktif" : "off"}
                </span>
              </td>
              {canManage && (
                <td className="px-4 py-4">
                  <div className="flex flex-col items-end gap-1">
                    <form action={posToggleBoothAction}>
                      <input type="hidden" name="photoboxId" value={booth.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={booth.pos_enabled ? "false" : "true"}
                      />
                      <Button
                        type="submit"
                        variant={booth.pos_enabled ? "outline" : "default"}
                        size="sm"
                        disabled={!booth.pos_enabled && hasActive}
                        title={
                          !booth.pos_enabled && hasActive
                            ? "Nonaktifkan booth aktif dulu untuk memindahkan POS"
                            : undefined
                        }
                        aria-label={
                          booth.pos_enabled
                            ? `Nonaktifkan POS di booth ${booth.name}`
                            : `Aktifkan POS di booth ${booth.name}`
                        }
                      >
                        {booth.pos_enabled ? (
                          <>
                            <PowerOff aria-hidden /> Nonaktifkan
                          </>
                        ) : (
                          <>
                            <Power aria-hidden /> Aktifkan POS
                          </>
                        )}
                      </Button>
                    </form>
                    {!booth.pos_enabled && hasActive ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        1 booth saja
                      </span>
                    ) : null}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
