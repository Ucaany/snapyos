"use client";

import { Fragment, useActionState, useState } from "react";
import { Plus, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection, RecordEditButton } from "@/components/ui/record-collection";
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

function discountLabel(vcr: VoucherRow): string {
  const base = vcr.type === "percentage" ? `${vcr.amount}%` : formatIDR(vcr.amount);
  return vcr.max_discount ? `${base} (maks ${formatIDR(vcr.max_discount)})` : base;
}

function requirementLabel(vcr: VoucherRow): string {
  return [
    vcr.min_transaction > 0 ? `min ${formatIDR(vcr.min_transaction)}` : null,
    `${vcr.usage_per_customer}x / pelanggan`,
    vcr.usage_limit !== null ? `limit ${vcr.usage_limit}` : "tanpa limit",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** VouchersTable - CRUD voucher + ringkasan analytics inline (docs/04 §4.11). */
export function VouchersTable({ vouchers, analytics, packages, outlets, canWrite }: Props) {
  const [createState, createAction, creating] = useActionState(createVoucherAction, initial);
  const [created, setCreated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-hard">
      <table className="w-full border-collapse text-left lg:min-w-[920px]">
        <caption className="sr-only">Daftar voucher</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Kode
            </th>
            <th scope="col" className="px-4 py-3.5">
              Diskon
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Syarat
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right md:table-cell">
              Pemakaian
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right lg:table-cell">
              Total Diskon
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right lg:table-cell">
              Pendapatan
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
                  <td className="px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                    {vcr.code}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm tabular-nums">{discountLabel(vcr)}</td>
                  <td className="hidden px-4 py-3 font-mono text-[11px] text-muted-foreground md:table-cell">
                    {requirementLabel(vcr)}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-sm font-bold tabular-nums md:table-cell">
                    {vcr.usage}
                    {vcr.usage_limit !== null ? `/${vcr.usage_limit}` : ""}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-sm tabular-nums lg:table-cell">
                    {formatIDR(stats?.totalDiscount ?? 0)}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-sm tabular-nums lg:table-cell">
                    {formatIDR(stats?.revenueGenerated ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={vcr.status} />
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <RecordEditButton
                          label={`Ubah voucher ${vcr.code}`}
                          onEdit={() => setEditingId(vcr.id)}
                        />
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
                            vcr.usage > 0 ? "Sudah terpakai, nonaktifkan saja" : "Hapus voucher"
                          }
                          compact
                        />
                      </div>
                    </td>
                  )}
                </tr>
                {editingId === vcr.id && canWrite && (
                  <tr className="border-b-2 border-ink/10 bg-muted">
                    <td colSpan={8} className="px-4 py-3 md:px-6">
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
  );

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Voucher (tampilan kotak)"
    >
      {vouchers.map((vcr) => {
        const stats = analytics[vcr.id];
        return (
          <li key={vcr.id} className="min-w-0">
            <RecordCard
              title={vcr.code}
              subtitle={requirementLabel(vcr)}
              badge={<StatusBadge status={vcr.status} />}
              meta={[
                { label: "Diskon", value: discountLabel(vcr) },
                {
                  label: "Pemakaian",
                  value: `${vcr.usage}${vcr.usage_limit !== null ? `/${vcr.usage_limit}` : ""}`,
                },
                { label: "Total diskon", value: formatIDR(stats?.totalDiscount ?? 0) },
                { label: "Pendapatan", value: formatIDR(stats?.revenueGenerated ?? 0) },
              ]}
              actions={
                canWrite ? (
                  <>
                    <RecordEditButton
                      label={`Ubah voucher ${vcr.code}`}
                      onEdit={() => setEditingId(vcr.id)}
                    />
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
                        vcr.usage > 0 ? "Sudah terpakai, nonaktifkan saja" : "Hapus voucher"
                      }
                      compact
                    />
                  </>
                ) : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {`VOUCHER ${String(vouchers.length).padStart(2, "0")}`}
            </p>
            <CollapsibleTrigger aria-label="Buka form voucher baru" title="Voucher baru">
              <Plus aria-hidden />
              <span className="sr-only">Voucher baru</span>
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
              noValidate
              onSubmit={() => setCreated(true)}
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"Voucher baru"}
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

      {created && !creating && !createState.error && (
        <p
          role="status"
          className="border-2 border-ink bg-accent-3 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] shadow-hard"
        >
          {"[ OK ]"} Voucher tersimpan.
        </p>
      )}

      {vouchers.length === 0 ? (
        <EmptyState
          icon={Ticket}
          eyebrow="BELUM ADA VOUCHER"
          title="Voucher divalidasi server-side saat dipakai customer."
          body="Contoh: GRANDOPENING untuk 20%, min. transaksi Rp50.000, maks. diskon Rp10.000."
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.vouchers"
          label="Daftar voucher"
          list={table}
          grid={grid}
        />
      )}
    </div>
  );
}
