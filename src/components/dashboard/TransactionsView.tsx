"use client";

import { useActionState, useState } from "react";
import { ChevronLeft, ChevronRight, Receipt, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconLink } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection } from "@/components/ui/record-collection";
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

const METHOD_LABEL: Record<string, string> = {
  qris: "QRIS",
  cash: "CASH",
  bank_transfer: "TRANSFER",
  other: "LAINNYA",
  offline: "OFFLINE",
  manual: "MANUAL",
  voucher: "VOUCHER",
};

/** TransactionsView - tabel + form catat manual (docs/04 §4.5). */
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
  const [outletId, setOutletId] = useState("");
  const [photoboxId, setPhotoboxId] = useState("");
  const boothOptions = outletId ? photoboxes.filter((b) => b.outlet_id === outletId) : photoboxes;

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse text-left xl:min-w-[1240px]">
        <caption className="sr-only">Daftar transaksi</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Nomor
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Tanggal
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Pelanggan
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Paket
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
              Outlet / Booth
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Metode
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
              Saldo
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right md:table-cell">
              Kotor
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right lg:table-cell">
              Diskon
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Akhir
            </th>
            <th scope="col" className="px-4 py-3.5">
              Status
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
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
              <td className="px-4 py-3.5 font-mono text-xs font-bold">{tx.number}</td>
              <td className="hidden px-4 py-3.5 font-mono text-xs md:table-cell">
                {formatDate(tx.paid_at ?? tx.created_at, timeZone)}
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs md:table-cell">
                {tx.customer_name ?? "-"}
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs md:table-cell">
                {tx.package_name ?? "-"}
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs text-muted-foreground lg:table-cell">
                {[tx.outlet_name, tx.photobox_name].filter(Boolean).join(" · ") || "-"}
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs uppercase md:table-cell">
                {METHOD_LABEL[tx.payment_method] ?? tx.payment_method}
              </td>
              <td className="hidden px-4 py-3.5 lg:table-cell">
                {tx.payment_method === "manual" || tx.withdrawable === false ? (
                  <span className="inline-block border-2 border-ink bg-accent-2 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                    Tidak Dapat Ditarik
                  </span>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">-</span>
                )}
              </td>
              <td className="hidden px-4 py-3.5 text-right font-mono text-xs tabular-nums md:table-cell">
                {formatIDR(tx.gross_amount)}
              </td>
              <td className="hidden px-4 py-3.5 text-right font-mono text-xs text-muted-foreground tabular-nums lg:table-cell">
                {tx.discount_amount > 0 ? `- ${formatIDR(tx.discount_amount)}` : "-"}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-sm font-bold tabular-nums">
                {formatIDR(tx.final_amount)}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={tx.status} />
              </td>
              <td className="hidden px-4 py-3.5 lg:table-cell">
                {tx.pos_order_id ? (
                  <span className="inline-block border-2 border-ink bg-accent px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
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
  );

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Transaksi (tampilan kotak)"
    >
      {transactions.map((tx) => (
        <li key={tx.id} className="min-w-0">
          <RecordCard
            title={tx.number}
            subtitle={`${formatDate(tx.paid_at ?? tx.created_at, timeZone)}${
              tx.customer_name ? ` · ${tx.customer_name}` : ""
            }`}
            badge={<StatusBadge status={tx.status} />}
            meta={[
              { label: "Paket", value: tx.package_name ?? "-" },
              {
                label: "Outlet / Booth",
                value: [tx.outlet_name, tx.photobox_name].filter(Boolean).join(" · ") || "-",
              },
              { label: "Metode", value: METHOD_LABEL[tx.payment_method] ?? tx.payment_method },
              { label: "Kotor", value: formatIDR(tx.gross_amount) },
              {
                label: "Diskon",
                value: tx.discount_amount > 0 ? formatIDR(tx.discount_amount) : "-",
              },
              { label: "Akhir", value: formatIDR(tx.final_amount) },
              {
                label: "Saldo",
                value:
                  tx.payment_method === "manual" || tx.withdrawable === false
                    ? "Tidak dapat ditarik"
                    : "Dapat ditarik",
              },
              { label: "Sumber", value: tx.pos_order_id ? "POS" : "Kiosk" },
            ]}
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
              CATAT MANUAL
            </p>
            <CollapsibleTrigger
              aria-label="Buka form transaksi manual"
              title="Catat transaksi manual"
            >
              <Wallet aria-hidden />
              <span className="sr-only">Catat transaksi manual</span>
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
                    value={outletId}
                    onChange={(e) => {
                      setOutletId(e.currentTarget.value);
                      setPhotoboxId("");
                    }}
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
                    value={photoboxId}
                    onChange={(e) => setPhotoboxId(e.currentTarget.value)}
                    disabled={pending || !outletId}
                    aria-invalid={Boolean(fieldError(state, "photobox_id"))}
                  >
                    <option value="" disabled>
                      {outletId ? "Pilih photobox" : "Pilih outlet dulu"}
                    </option>
                    {boothOptions.map((b) => (
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
                    Paket
                  </label>
                  <Select id="mtx-package" name="package_id" defaultValue="" disabled={pending}>
                    <option value="">Tanpa paket</option>
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
                    Kotor (IDR) *
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
              <p className="text-xs leading-relaxed text-muted-foreground">
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
                  {pending ? "Menyimpan..." : "Catat transaksi"}
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
        <RecordCollection
          storageKey="snapyos.view.transactions"
          label="Daftar transaksi"
          list={table}
          grid={grid}
        />
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
              <IconLink href={prevHref} label="Halaman sebelumnya" icon={ChevronLeft} compact />
            )}
            {nextHref && (
              <IconLink href={nextHref} label="Halaman berikutnya" icon={ChevronRight} compact />
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
