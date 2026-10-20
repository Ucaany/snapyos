"use client";

import { Fragment, useActionState, useState } from "react";
import { ChevronDown, Pencil, Plus, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WilayahPicker } from "@/components/dashboard/WilayahPicker";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { OutletEditForm } from "@/components/dashboard/OutletEditForm";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import { cn } from "@/lib/utils";
import type { OutletRow } from "@/server/outlets";
import type { FormState } from "@/server/auth-actions";
import { createOutletAction, deleteOutletAction } from "@/server/booth-actions";

const initial: FormState = {};

type Props = {
  outlets: OutletRow[];
  canWrite: boolean;
  maxOutlets: number;
};

/**
 * OutletsTable — CRUD outlet (docs/04 §4.7, docs/12 Phase 3).
 * Create form di Collapsible; wilayah via data self-hosted emsifa dump.
 */
export function OutletsTable({ outlets, canWrite, maxOutlets }: Props) {
  const [createState, createAction, creating] = useActionState(createOutletAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const limitReached = outlets.length >= maxOutlets;

  return (
    <div className="flex flex-col gap-6">
      {canWrite && !limitReached ? (
        <Collapsible>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 items-center border-2 border-ink bg-ink px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
                Outlet
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                {String(outlets.length).padStart(2, "0")}
                <span className="text-muted-foreground">
                  /{String(maxOutlets).padStart(2, "0")}
                </span>
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
                Plan limit
              </span>
            </div>{" "}
            <CollapsibleTrigger className="min-h-11 px-4" aria-label="Buka form outlet baru">
              <Plus aria-hidden />
              Outlet baru
              <ChevronDown
                className="transition-transform duration-100 [[data-panel-open]_&]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <div className="flex items-center gap-3 border-b-2 border-ink pb-4">
                <Plus className="size-4" aria-hidden />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                  {"/// Outlet baru"}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="outlet-name" className={labelClass}>
                    Nama outlet *
                  </label>
                  <Input
                    id="outlet-name"
                    name="name"
                    required
                    placeholder="cth. Malioboro"
                    disabled={creating}
                    aria-invalid={Boolean(fieldError(createState, "name"))}
                  />
                  {fieldError(createState, "name") && (
                    <p role="alert" className="font-mono text-xs text-destructive">
                      {fieldError(createState, "name")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="outlet-address" className={labelClass}>
                    Alamat
                  </label>
                  <Input
                    id="outlet-address"
                    name="address"
                    placeholder="Jl. Malioboro No. 1"
                    disabled={creating}
                  />
                </div>
                <WilayahPicker idPrefix="outlet-create" disabled={creating} />
              </div>
              {createState.error && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
                >
                  {createState.error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 border-t-2 border-ink/10 pt-4">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? "Menyimpan…" : "Simpan outlet"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      ) : (
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 items-center border-2 border-ink bg-ink px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
            Outlet
          </span>
          <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
            {String(outlets.length).padStart(2, "0")}
            {canWrite && (
              <span className="text-muted-foreground">/{String(maxOutlets).padStart(2, "0")}</span>
            )}
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
            {canWrite ? "Plan limit" : "Akses Anda"}
          </span>
        </div>
      )}

      {limitReached && canWrite && (
        <p className="border-2 border-ink bg-accent px-4 py-3 font-mono text-xs uppercase tracking-[0.05em]">
          {"[ LIMIT ]"} Kuota outlet plan tercapai ({maxOutlets}). Upgrade subscription untuk
          menambah outlet.
        </p>
      )}

      {outlets.length === 0 ? (
        canWrite ? (
          <EmptyState
            icon={Store}
            eyebrow="Belum ada outlet"
            title="Outlet adalah lokasi fisik bisnis photobox Anda (mall, kafe, kampus)."
            body="Buat outlet pertama, lalu pasang photobox di dalamnya."
          />
        ) : (
          <EmptyState
            icon={Store}
            eyebrow="Belum ada outlet"
            title="Belum ada outlet yang bisa Anda akses."
            body="Minta owner memberi akses booth pada outlet ini lewat menu Staff, lalu muat ulang halaman."
          />
        )
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">Daftar outlet</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th scope="col" className="px-4 py-3.5 text-right">
                  No
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Outlet
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Wilayah / Alamat
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Photobox
                </th>
                {canWrite && (
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Aksi
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {outlets.map((outlet, index) => (
                <Fragment key={outlet.id}>
                  <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                    <td className="px-4 py-4 text-right font-mono text-xs font-bold text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-4 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                      {outlet.name}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      <span className="text-ink">
                        {[outlet.city, outlet.province].filter(Boolean).join(" · ") || "-"}
                      </span>
                      {outlet.address && <span className="mt-1 block">{outlet.address}</span>}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center border-2 border-ink px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
                          outlet.status === "active"
                            ? "bg-accent-3 text-ink"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {outlet.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-bold">
                      {outlet.photobox_count}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Ubah outlet ${outlet.name}`}
                            aria-expanded={editingId === outlet.id}
                            onClick={() => setEditingId(editingId === outlet.id ? null : outlet.id)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <DeleteConfirmForm
                            action={deleteOutletAction}
                            id={outlet.id}
                            title="Hapus outlet?"
                            description={
                              outlet.photobox_count > 0
                                ? "Outlet memiliki photobox aktif. Hapus atau pindahkan photobox terlebih dahulu."
                                : `Outlet ${outlet.name} akan dihapus permanen. Aksi ini tidak dapat dibatalkan.`
                            }
                            disabled={outlet.photobox_count > 0}
                            triggerLabel={`Hapus outlet ${outlet.name}`}
                            triggerTitle={
                              outlet.photobox_count > 0
                                ? "Hapus photobox di outlet ini dahulu"
                                : "Hapus outlet"
                            }
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                  {editingId === outlet.id && canWrite && (
                    <tr className="border-b-2 border-ink/10 bg-muted">
                      <td colSpan={6} className="px-4 py-4 md:px-6">
                        <OutletEditForm outlet={outlet} onDone={() => setEditingId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
