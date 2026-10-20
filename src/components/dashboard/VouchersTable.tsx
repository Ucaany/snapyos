"use client";

import { Fragment, useActionState, useState } from "react";
import { Pencil, Plus, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { VoucherFields, type VoucherRef } from "@/components/dashboard/VoucherFields";
import { VoucherEditForm } from "@/components/dashboard/VoucherEditForm";
import { formatIDR } from "@/lib/dashboard-math";
import type { VoucherRow } from "@/server/vouchers";
import type { FormState } from "@/server/auth-actions";
import { createVoucherAction, deleteVoucherAction } from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  vouchers: VoucherRow[];
  analytics: Record<string, { totalDiscount: number; revenueGenerated: number }>;
  packages: VoucherRef[];
  outlets: VoucherRef[];
  canWrite: boolean;
};

/** VouchersTable — CRUD voucher + ringkasan analytics inline (docs/04 §4.11). */
export function VouchersTable({ vouchers, analytics, packages, outlets, canWrite }: Props) {
  const [createState, createAction, creating] = useActionState(createVoucherAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {`VOUCHER ${String(vouchers.length).padStart(2, "0")}`}
            </p>
            <CollapsibleTrigger className="min-h-11 px-4" aria-label="Buka form voucher baru">
              <Plus aria-hidden />
              Voucher baru
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"/// Voucher baru"}
              </p>
              <VoucherFields
                packages={packages}
                outlets={outlets}
                state={createState}
                pending={creating}
              />
              {createState.error && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
                >
                  {createState.error}
                </p>
              )}
              <div className="flex justify-end border-t-2 border-ink/10 pt-4">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? "Menyimpan\u2026" : "Simpan voucher"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {vouchers.length === 0 ? (
        <EmptyState
          icon={Ticket}
          eyebrow="BELUM ADA VOUCHER"
          title="Voucher divalidasi server-side saat dipakai customer."
          body="Contoh: GRANDOPENING untuk 20%, min. transaksi Rp50.000, maks. diskon Rp10.000."
        />
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <caption className="sr-only">Daftar voucher</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th scope="col" className="px-4 py-3.5">
                  Kode
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Diskon
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Syarat
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Usage
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Total Diskon
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Revenue
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                {canWrite && (
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Aksi
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {vouchers.map((vcr) => {
                const stats = analytics[vcr.id];
                return (
                  <Fragment key={vcr.id}>
                    <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                      <td className="px-4 py-4 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                        {vcr.code}
                      </td>
                      <td className="px-4 py-4 font-mono text-sm">
                        {vcr.type === "percentage" ? `${vcr.amount}%` : formatIDR(vcr.amount)}
                        {vcr.max_discount ? (
                          <span className="block text-[11px] text-muted-foreground">
                            maks {formatIDR(vcr.max_discount)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 font-mono text-[11px] text-muted-foreground">
                        {[
                          vcr.min_transaction > 0 ? `min ${formatIDR(vcr.min_transaction)}` : null,
                          `${vcr.usage_per_customer}x / customer`,
                          vcr.usage_limit !== null ? `limit ${vcr.usage_limit}` : "tanpa limit",
                        ]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm font-bold">
                        {vcr.usage}
                        {vcr.usage_limit !== null ? `/${vcr.usage_limit}` : ""}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm">
                        {formatIDR(stats?.totalDiscount ?? 0)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm">
                        {formatIDR(stats?.revenueGenerated ?? 0)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={vcr.status} />
                      </td>
                      {canWrite && (
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Ubah voucher ${vcr.code}`}
                              aria-expanded={editingId === vcr.id}
                              onClick={() => setEditingId(editingId === vcr.id ? null : vcr.id)}
                            >
                              <Pencil aria-hidden />
                            </Button>
                            <DeleteConfirmForm
                              action={deleteVoucherAction}
                              id={vcr.id}
                              title="Hapus voucher?"
                              description={
                                vcr.usage > 0
                                  ? "Voucher sudah pernah digunakan dan tidak dapat dihapus. Nonaktifkan saja."
                                  : `Voucher ${vcr.code} akan dihapus permanen. Aksi ini tidak dapat dibatalkan.`
                              }
                              disabled={vcr.usage > 0}
                              triggerLabel={`Hapus voucher ${vcr.code}`}
                              triggerTitle={
                                vcr.usage > 0
                                  ? "Sudah terpakai \u2014 nonaktifkan saja"
                                  : "Hapus voucher"
                              }
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                    {editingId === vcr.id && canWrite && (
                      <tr className="border-b-2 border-ink/10 bg-muted">
                        <td colSpan={8} className="px-4 py-4 md:px-6">
                          <VoucherEditForm
                            voucher={vcr}
                            packages={packages}
                            outlets={outlets}
                            onDone={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
