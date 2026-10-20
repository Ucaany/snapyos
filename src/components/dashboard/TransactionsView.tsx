"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Receipt, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import type { TransactionRow } from "@/server/transactions";
import type { FormState } from "@/server/auth-actions";
import { createManualTxAction } from "@/server/finance-actions";

const initial: FormState = {};

type Ref = { id: string; name: string };

type Props = {
  transactions: TransactionRow[];
  outlets: Ref[];
  photoboxes: { id: string; name: string; outlet_id: string }[];
  packages: Ref[];
  canWrite: boolean;
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
  timeZone?: string;
};

// 'gateway' dihapus (migrasi 0036) — direct-merchant QRIS sekarang tercatat
// sebagai 'qris' juga; bedanya tercermin di `payments.credential_id`, bukan
// di kolom payment_method transaksi.
const METHOD_LABEL: Record<string, string> = {
  qris: "QRIS",
  cash: "CASH",
  bank_transfer: "TRANSFER",
  other: "LAINNYA",
  offline: "OFFLINE",
  manual: "MANUAL",
  voucher: "VOUCHER",
};

/** TransactionsView — tabel + form catat manual (docs/04 §4.5). */
export function TransactionsView({
  transactions,
  outlets,
  photoboxes,
  packages,
  canWrite,
  page,
  totalPages,
  prevHref,
  nextHref,
  timeZone,
}: Props) {
  const [state, action, pending] = useActionState(createManualTxAction, initial);

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              CATAT MANUAL
            </p>
            <CollapsibleTrigger className="min-h-11 px-4" aria-label="Buka form transaksi manual">
              <Wallet aria-hidden />
              Catat manual
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={action}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"Transaksi manual (langsung paid)"}
              </p>
              <div className="border-2 border-ink bg-accent-2 p-3 font-mono text-xs uppercase tracking-[0.05em]">
                {"TRANSAKSI MANUAL TIDAK MASUK SALDO WITHDRAWABLE"}
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label htmlFor="mtx-outlet" className={labelClass}>
                    Outlet *
                  </label>
                  <Select
                    id="mtx-outlet"
                    name="outlet_id"
                    required
                    defaultValue=""
                    disabled={pending}
                    aria-invalid={Boolean(fieldError(state, "outlet_id"))}
                  >
                    <option value="" disabled>
                      Pilih outlet
                    </option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                  {fieldError(state, "outlet_id") && (
                    <p role="alert" className="font-mono text-xs text-destructive">
                      {fieldError(state, "outlet_id")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="mtx-box" className={labelClass}>
                    Photobox *
                  </label>
                  <Select
                    id="mtx-box"
                    name="photobox_id"
                    required
                    defaultValue=""
                    disabled={pending}
                    aria-invalid={Boolean(fieldError(state, "photobox_id"))}
                  >
                    <option value="" disabled>
                      Pilih photobox
                    </option>
                    {photoboxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  {fieldError(state, "photobox_id") && (
                    <p role="alert" className="font-mono text-xs text-destructive">
                      {fieldError(state, "photobox_id")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="mtx-package" className={labelClass}>
                    Package
                  </label>
                  <Select id="mtx-package" name="package_id" defaultValue="" disabled={pending}>
                    <option value="">Tanpa package</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <span className={labelClass}>Metode</span>
                  <p className="border-2 border-ink bg-muted px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
                    MANUAL
                  </p>
                  <input type="hidden" name="payment_method" value="manual" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="mtx-gross" className={labelClass}>
                    Gross (IDR) *
                  </label>
                  <Input
                    id="mtx-gross"
                    name="gross_amount"
                    type="number"
                    min={1}
                    step={1}
                    required
                    placeholder="50000"
                    disabled={pending}
                    aria-invalid={Boolean(fieldError(state, "gross_amount"))}
                  />
                  {fieldError(state, "gross_amount") && (
                    <p role="alert" className="font-mono text-xs text-destructive">
                      {fieldError(state, "gross_amount")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="mtx-discount" className={labelClass}>
                    Diskon (IDR)
                  </label>
                  <Input
                    id="mtx-discount"
                    name="discount_amount"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={0}
                    disabled={pending}
                  />
                </div>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                Nilai akhir dihitung server (kotor dikurangi diskon). Browser tidak dipercaya.
              </p>
              {state.error && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
                >
                  {state.error}
                </p>
              )}
              <div className="flex justify-end border-t-2 border-ink/10 pt-4">
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Menyimpan…" : "Catat transaksi"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          eyebrow="BELUM ADA TRANSAKSI"
          title="Transaksi otomatis tercatat saat customer membayar QRIS."
          body="Untuk transaksi non-QRIS, gunakan tombol Catat Manual pada bagian transaksi manual."
        />
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[1240px] border-collapse text-left">
            <caption className="sr-only">Daftar transaksi</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th scope="col" className="px-4 py-3.5">
                  Nomor
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Tanggal
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Package
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Outlet / Booth
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Metode
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Saldo
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Gross
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Diskon
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Final
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Sumber
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60"
                >
                  <td className="px-4 py-4 font-mono text-xs font-bold">{tx.number}</td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {formatDate(tx.paid_at ?? tx.created_at, timeZone)}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">{tx.customer_name ?? "-"}</td>
                  <td className="px-4 py-4 font-mono text-xs">{tx.package_name ?? "-"}</td>
                  <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                    {[tx.outlet_name, tx.photobox_name].filter(Boolean).join(" · ") || "-"}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs uppercase">
                    {METHOD_LABEL[tx.payment_method] ?? tx.payment_method}
                  </td>
                  <td className="px-4 py-4">
                    {tx.payment_method === "manual" || tx.withdrawable === false ? (
                      <span className="inline-block border-2 border-ink bg-accent-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
                        Non-Withdrawable
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs">
                    {formatIDR(tx.gross_amount)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">
                    {tx.discount_amount > 0 ? `- ${formatIDR(tx.discount_amount)}` : "-"}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm font-bold">
                    {formatIDR(tx.final_amount)}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className="px-4 py-4">
                    {tx.pos_order_id ? (
                      <span className="inline-block border-2 border-ink bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
                        POS
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Navigasi halaman transaksi"
          className="flex items-center justify-between gap-3"
        >
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            {`HALAMAN ${page}/${totalPages}`}
          </p>
          <div className="flex gap-2">
            {prevHref && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={prevHref} />}
              >
                ← Sebelumnya
              </Button>
            )}
            {nextHref && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={nextHref} />}
              >
                Berikutnya →
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
