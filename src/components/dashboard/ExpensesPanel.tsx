"use client";

import { Fragment, useActionState, useState } from "react";
import { Plus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection, RecordEditButton } from "@/components/ui/record-collection";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { ExpenseFields, type ExpenseRef } from "@/components/dashboard/ExpenseFields";
import { ExpenseEditForm } from "@/components/dashboard/ExpenseEditForm";
import { formatIDR } from "@/lib/dashboard-math";
import type { ExpenseRow } from "@/server/finance";
import type { FormState } from "@/server/auth-actions";
import { createExpenseAction, deleteExpenseAction } from "@/server/finance-actions";

const initial: FormState = {};

/** ExpensesPanel - CRUD pengeluaran manual (docs/04 §4.4). */
export function ExpensesPanel({
  expenses,
  outlets,
  canWrite,
}: {
  expenses: ExpenseRow[];
  outlets: ExpenseRef[];
  canWrite: boolean;
}) {
  const [createState, createAction, creating] = useActionState(createExpenseAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse text-left lg:min-w-[760px]">
        <caption className="sr-only">Daftar pengeluaran</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Tanggal
            </th>
            <th scope="col" className="px-4 py-3.5">
              Kategori
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Catatan
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Nominal
            </th>
            {canWrite && (
              <th scope="col" className="px-4 py-3.5 text-right">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp) => (
            <Fragment key={exp.id}>
              <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                <td className="px-4 py-3 font-mono text-xs">{exp.expense_date}</td>
                <td className="px-4 py-3 font-mono text-xs font-bold uppercase">{exp.category}</td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                  {exp.note ?? "-"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums">
                  {formatIDR(exp.amount)}
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <RecordEditButton
                        label={`Ubah pengeluaran ${exp.category}`}
                        onEdit={() => setEditingId(exp.id)}
                      />
                      <DeleteConfirmForm
                        action={deleteExpenseAction}
                        id={exp.id}
                        title="Hapus pengeluaran?"
                        description={`Catatan pengeluaran ${exp.category} tanggal ${exp.expense_date} akan dihapus permanen dari laporan keuangan.`}
                        triggerLabel={`Hapus pengeluaran ${exp.category}`}
                        compact
                      />
                    </div>
                  </td>
                )}
              </tr>
              {editingId === exp.id && canWrite && (
                <tr className="border-b-2 border-ink/10 bg-muted">
                  <td colSpan={5} className="px-4 py-3 md:px-6">
                    <ExpenseEditForm
                      expense={exp}
                      outlets={outlets}
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Pengeluaran (tampilan kotak)"
    >
      {expenses.map((exp) => (
        <li key={exp.id} className="min-w-0">
          <RecordCard
            title={exp.category}
            subtitle={exp.expense_date}
            meta={[
              { label: "Nominal", value: formatIDR(exp.amount) },
              { label: "Catatan", value: exp.note ?? "-" },
            ]}
            actions={
              canWrite ? (
                <>
                  <RecordEditButton
                    label={`Ubah pengeluaran ${exp.category}`}
                    onEdit={() => setEditingId(exp.id)}
                  />
                  <DeleteConfirmForm
                    action={deleteExpenseAction}
                    id={exp.id}
                    title="Hapus pengeluaran?"
                    description={`Catatan pengeluaran ${exp.category} tanggal ${exp.expense_date} akan dihapus permanen dari laporan keuangan.`}
                    triggerLabel={`Hapus pengeluaran ${exp.category}`}
                    compact
                  />
                </>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {`PENGELUARAN ${String(expenses.length).padStart(2, "0")} / PERIODE`}
            </p>
            <CollapsibleTrigger aria-label="Buka form pengeluaran baru" title="Pengeluaran baru">
              <Plus aria-hidden />
              <span className="sr-only">Pengeluaran baru</span>
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"Pengeluaran baru"}
              </p>
              <ExpenseFields outlets={outlets} state={createState} pending={creating} />
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
                  {creating ? "Menyimpan\u2026" : "Simpan pengeluaran"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          eyebrow="BELUM ADA PENGELUARAN"
          title="Catat biaya operasional untuk melihat estimasi laba di ringkasan keuangan."
          body="Sewa, listrik, kertas, tinta, gaji staff."
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.expenses"
          label="Daftar pengeluaran"
          list={table}
          grid={grid}
        />
      )}
    </div>
  );
}
