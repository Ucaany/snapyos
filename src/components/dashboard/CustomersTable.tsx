"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection } from "@/components/ui/record-collection";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import type { CustomerRow, CustomerDetail } from "@/server/customers";

type Props = {
  customers: CustomerRow[];
  businessId: string;
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
  timeZone?: string;
};

function DetailBlock({
  detail,
  loading,
  error,
  customerName,
  timeZone,
}: {
  detail: CustomerDetail | null;
  loading: boolean;
  error: string | null;
  customerName: string | null;
  timeZone?: string;
}) {
  return (
    <div className="mt-4">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`Riwayat: ${(customerName ?? "PELANGGAN").toUpperCase()}`}
      </p>
      {loading && (
        <div className="mt-4 flex gap-3" aria-label="Memuat detail">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {error}
        </p>
      )}
      {detail && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-label="Riwayat transaksi">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
              Transaksi ({detail.transactions.length})
            </h3>
            {detail.transactions.length === 0 ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">Belum ada transaksi.</p>
            ) : (
              <ul className="mt-2 divide-y-2 divide-ink/10 border-2 border-ink bg-surface">
                {detail.transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mono text-xs"
                  >
                    <span className="font-bold">{t.number}</span>
                    <span className="text-muted-foreground">
                      {t.paidAt ? formatDate(t.paidAt, timeZone) : "-"}
                    </span>
                    <span className="tabular-nums">{formatIDR(t.finalAmount)}</span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Riwayat sesi">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
              Sesi foto ({detail.sessions.length})
            </h3>
            {detail.sessions.length === 0 ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">Belum ada sesi.</p>
            ) : (
              <ul className="mt-2 divide-y-2 divide-ink/10 border-2 border-ink bg-surface">
                {detail.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mono text-xs"
                  >
                    <span className="text-muted-foreground">
                      {formatDate(s.createdAt, timeZone)}
                    </span>
                    <span>{s.photobox ?? "-"}</span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Riwayat sesi terbaru ditampilkan lebih dahulu.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

/** CustomersTable - list + detail on-demand via API (docs/04 §4.12). */
export function CustomersTable({
  customers,
  businessId,
  page,
  totalPages,
  prevHref,
  nextHref,
  timeZone,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailCache = useRef(new Map<string, CustomerDetail>());

  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function toggle(id: string) {
    abortRef.current?.abort();

    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setError(null);

    const cached = detailCache.current.get(id);
    if (cached) {
      setDetail(cached);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/business/${businessId}/customers/${id}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("gagal");
      const json = (await res.json()) as { data: CustomerDetail };
      const cache = detailCache.current;
      cache.set(id, json.data);
      if (cache.size > 20) cache.delete(cache.keys().next().value as string);
      if (openIdRef.current === id) setDetail(json.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (openIdRef.current === id) {
        setError("Gagal memuat detail pelanggan. Coba lagi.");
      }
    } finally {
      if (openIdRef.current === id) setLoading(false);
    }
  }

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse text-left lg:min-w-[860px]">
        <caption className="sr-only">Daftar pelanggan</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Pelanggan
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Kontak
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Sejak
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-center md:table-cell">
              Transaksi
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Total Belanja
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <Fragment key={c.id}>
              <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                <td className="px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                  {c.name ?? "Tanpa nama"}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                  {[c.phone, c.email].filter(Boolean).join(" \u00b7 ") || "-"}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs md:table-cell">
                  {formatDate(c.created_at, timeZone)}
                </td>
                <td className="hidden px-4 py-3 text-center font-mono text-sm md:table-cell">
                  {c.transactionCount}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums">
                  {formatIDR(c.totalSpending)}
                </td>
                <td className="px-4 py-3 text-right">
                  <IconButton
                    label={
                      openId === c.id
                        ? `Tutup detail ${c.name ?? "pelanggan"}`
                        : `Buka detail ${c.name ?? "pelanggan"}`
                    }
                    icon={openId === c.id ? ChevronUp : ChevronDown}
                    compact
                    aria-expanded={openId === c.id}
                    onClick={() => void toggle(c.id)}
                  />
                </td>
              </tr>
              {openId === c.id && (
                <tr className="border-b-2 border-ink/10 bg-muted">
                  <td colSpan={6} className="px-4 py-3 md:px-6">
                    <DetailBlock
                      detail={detail}
                      loading={loading}
                      error={error}
                      customerName={c.name}
                      timeZone={timeZone}
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
      aria-label="Pelanggan (tampilan kotak)"
    >
      {customers.map((c) => (
        <li key={c.id} className="min-w-0">
          <RecordCard
            title={c.name ?? "Tanpa nama"}
            subtitle={[c.phone, c.email].filter(Boolean).join(" · ") || undefined}
            meta={[
              { label: "Sejak", value: formatDate(c.created_at, timeZone) },
              { label: "Transaksi", value: c.transactionCount },
              { label: "Total belanja", value: formatIDR(c.totalSpending) },
            ]}
            actions={
              <IconButton
                label={
                  openId === c.id
                    ? `Tutup detail ${c.name ?? "pelanggan"}`
                    : `Buka detail ${c.name ?? "pelanggan"}`
                }
                icon={openId === c.id ? ChevronUp : ChevronDown}
                compact
                aria-expanded={openId === c.id}
                onClick={() => void toggle(c.id)}
              />
            }
          />
          {openId === c.id && (
            <div className="border-2 border-t-0 border-ink bg-muted p-3">
              <DetailBlock
                detail={detail}
                loading={loading}
                error={error}
                customerName={c.name}
                timeZone={timeZone}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          eyebrow="BELUM ADA PELANGGAN"
          title="Belum ada data pelanggan"
          body="Nama dan kontak yang diberikan saat checkout atau booking akan ditampilkan di sini."
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.customers"
          label="Daftar pelanggan"
          list={table}
          grid={grid}
        />
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Navigasi halaman pelanggan"
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
