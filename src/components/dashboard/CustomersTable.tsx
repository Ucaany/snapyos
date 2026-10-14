"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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


/** CustomersTable — list + detail on-demand via API (docs/04 §4.12). */
export function CustomersTable({ customers, businessId, page, totalPages, prevHref, nextHref, timeZone }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Cache detail per-mount (bukan scope modul), ikut mati saat komponen
  // unmount, jadi tidak menumpuk lintas sesi/navigasi. Dibatasi 20 entri:
  // lebih dari itu buang yang paling lama diakses.
  const detailCache = useRef(new Map<string, CustomerDetail>());

  // Sinkron `openIdRef` dengan state supaya handler fetch bisa cek
  // nilai terbaru tanpa terkena stale closure.
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  // Cleanup: abort fetch in-flight saat unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function toggle(id: string) {
    // Abort request sebelumnya (racing rapid-click).
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
      // Guard: pastikan user masih membuka baris yang sama (bukan closure lama).
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
        <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <caption className="sr-only">Daftar pelanggan</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th scope="col" className="px-4 py-3.5">Pelanggan</th>
                <th scope="col" className="px-4 py-3.5">Kontak</th>
                <th scope="col" className="px-4 py-3.5">Sejak</th>
                <th scope="col" className="px-4 py-3.5 text-center">Transaksi</th>
                <th scope="col" className="px-4 py-3.5 text-right">Total Spending</th>
                <th scope="col" className="px-4 py-3.5 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                    <td className="px-4 py-4 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                      {c.name ?? "Tanpa nama"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" \u00b7 ") || "\u2014"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{formatDate(c.created_at, timeZone)}</td>
                    <td className="px-4 py-4 text-center font-mono text-sm">{c.transactionCount}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-bold">{formatIDR(c.totalSpending)}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void toggle(c.id)}
                        aria-expanded={openId === c.id}
                        className="border-2 border-ink bg-surface px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] shadow-[2px_2px_0_0_#111111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        {openId === c.id ? "Tutup" : "Buka"}
                      </button>
                    </td>
                  </tr>
                  {openId === c.id && (
                    <tr className="border-b-2 border-ink/10 bg-muted">
                      <td colSpan={6} className="px-4 py-4 md:px-6">
                        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                          {`/// Riwayat — ${(c.name ?? "PELANGGAN").toUpperCase()}`}
                        </p>
                        {loading && (
                          <div className="mt-4 flex gap-3" aria-label="Memuat detail">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        )}
                        {error && (
                          <p role="alert" className="mt-4 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
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
                                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs">
                                      <span className="font-bold">{t.number}</span>
                                      <span className="text-muted-foreground">{t.paidAt ? formatDate(t.paidAt, timeZone) : "\u2014"}</span>
                                      <span>{formatIDR(t.finalAmount)}</span>
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
                                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs">
                                      <span className="text-muted-foreground">{formatDate(s.createdAt, timeZone)}</span>
                                      <span>{s.photobox ?? "\u2014"}</span>
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Navigasi halaman pelanggan" className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            {`HALAMAN ${page}/${totalPages}`}
          </p>
          <div className="flex gap-2 font-mono text-xs">
            {prevHref && (
              <Link
                href={prevHref}
                className="border-2 border-ink px-3 py-2 font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#111111] hover:bg-accent"
              >
                {"\u2190 Sebelumnya"}
              </Link>
            )}
            {nextHref && (
              <Link
                href={nextHref}
                className="border-2 border-ink px-3 py-2 font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#111111] hover:bg-accent"
              >
                {"Berikutnya \u2192"}
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
