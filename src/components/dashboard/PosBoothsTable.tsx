import { Camera } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection } from "@/components/ui/record-collection";
import { cn } from "@/lib/utils";
import type { PosBoothRow } from "@/server/pos-products";
import { PosBoothToggleForm } from "@/components/dashboard/PosBoothToggleForm";

/**
 * PosBoothsTable - toggle POS per booth (A13, docs/pos/03 §3.2).
 * Toggle = server action scoped `.eq(business_id)`; UI bukan pengaman.
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

  const statusChip = (enabled: boolean) => (
    <span
      className={cn(
        "inline-flex h-6 items-center border-2 border-ink px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
        enabled ? "bg-accent-3 text-ink" : "bg-muted text-muted-foreground"
      )}
    >
      {enabled ? "aktif" : "off"}
    </span>
  );

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse text-left lg:min-w-[720px]">
        <caption className="sr-only">Booth POS</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Booth
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Outlet
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Status booth
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
              <td className="px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                {booth.name}
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                {booth.outlet_name ?? "-"}
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs uppercase md:table-cell">
                {booth.status}
              </td>
              <td className="px-4 py-3">{statusChip(booth.pos_enabled)}</td>
              {canManage && (
                <td className="px-4 py-3">
                  <div className="flex flex-col items-end gap-1">
                    <PosBoothToggleForm
                      photoboxId={booth.id}
                      boothName={booth.name}
                      enabled={!booth.pos_enabled}
                      disabled={!booth.pos_enabled && hasActive}
                    />
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

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Booth POS (tampilan kotak)"
    >
      {booths.map((booth) => (
        <li key={booth.id} className="min-w-0">
          <RecordCard
            title={booth.name}
            subtitle={booth.outlet_name ?? undefined}
            badge={statusChip(booth.pos_enabled)}
            meta={[{ label: "Status booth", value: booth.status }]}
            actions={
              canManage ? (
                <div className="flex flex-col items-start gap-1">
                  <PosBoothToggleForm
                    photoboxId={booth.id}
                    boothName={booth.name}
                    enabled={!booth.pos_enabled}
                    disabled={!booth.pos_enabled && hasActive}
                  />
                  {!booth.pos_enabled && hasActive ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      1 booth saja
                    </span>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <RecordCollection
      storageKey="snapyos.view.pos-booths"
      label="Daftar booth POS"
      list={table}
      grid={grid}
    />
  );
}