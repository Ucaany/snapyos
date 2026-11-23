import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ImageOff } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusinessForRoles, requireUser } from "@/lib/tenant";
import { getTransactionDetail } from "@/server/transactions";

export const metadata: Metadata = {
  title: "Detail Transaksi | SnapyOS",
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

/** /dashboard/transactions/:id — jejak transaksi + URL foto hasil. */
export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/dashboard");

  const { id } = await params;
  let tx;
  try {
    tx = await getTransactionDetail(user.id, active.business.id, id);
  } catch {
    notFound();
  }

  const timeZone = active.business.timezone || "Asia/Jakarta";
  const meta: Array<{ label: string; value: string }> = [
    { label: "Tanggal", value: formatDate(tx.paid_at ?? tx.created_at, timeZone) },
    { label: "Pelanggan", value: tx.customer_name ?? "-" },
    { label: "Paket", value: tx.package_name ?? "-" },
    {
      label: "Outlet / Booth",
      value: [tx.outlet_name, tx.photobox_name].filter(Boolean).join(" · ") || "-",
    },
    { label: "Metode", value: METHOD_LABEL[tx.payment_method] ?? tx.payment_method },
    { label: "Kotor", value: formatIDR(tx.gross_amount) },
    { label: "Diskon", value: tx.discount_amount > 0 ? formatIDR(tx.discount_amount) : "-" },
    { label: "Akhir", value: formatIDR(tx.final_amount) },
    {
      label: "Saldo",
      value:
        tx.payment_method === "manual" || tx.withdrawable === false
          ? "Tidak dapat ditarik"
          : "Dapat ditarik",
    },
    { label: "Sumber", value: tx.pos_order_id ? "POS" : "Kiosk" },
    { label: "Session ID", value: tx.session_id ?? "-" },
    {
      label: "Masa simpan hasil",
      value:
        tx.days_left === null
          ? "-"
          : tx.days_left === 0
            ? "Kedaluwarsa"
            : `Sisa ${tx.days_left} hari`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow={`TRANSAKSI · ${tx.status.toUpperCase()}`}
        title={tx.number}
        description="Jejak transaksi lengkap dengan tautan hasil foto pelanggan."
        right={
          <Link
            href="/dashboard/transactions"
            className="inline-flex min-h-11 items-center gap-2 border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-hard-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Kembali
          </Link>
        }
      />

      <section className="border-2 border-ink bg-surface p-4 shadow-hard sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={tx.status} />
            {tx.days_left !== null && (
              <span
                className={`inline-block border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${
                  tx.days_left === 0 ? "bg-destructive text-bg" : "bg-accent"
                }`}
              >
                {tx.days_left === 0 ? "Hasil kedaluwarsa" : `Sisa ${tx.days_left} hari`}
              </span>
            )}
          </div>
          {tx.result_token ? (
            <a
              href={`/r/${tx.result_token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 border-2 border-ink bg-accent px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-ink hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Buka halaman hasil
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Tanpa hasil foto
            </span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-[2px] border-2 border-ink/20 bg-ink/20 sm:grid-cols-2 lg:grid-cols-3">
          {meta.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-0.5 bg-surface p-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="min-w-0 break-words font-mono text-xs font-bold leading-tight">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Foto hasil" className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          FOTO HASIL · {tx.photos.length}
        </h2>
        {tx.photos.length === 0 ? (
          <div className="flex items-center gap-3 border-2 border-ink bg-surface p-4 shadow-hard-sm">
            <ImageOff className="size-5 shrink-0" aria-hidden />
            <p className="font-mono text-xs text-muted-foreground">
              Transaksi ini tidak punya foto (POS/manual atau media sudah dibersihkan retensi).
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tx.photos.map((photo) => (
              <li key={photo.id} className="min-w-0">
                {photo.url ? (
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border-2 border-ink bg-surface p-1 shadow-hard-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL dinamis, bukan aset statis */}
                    <img
                      src={photo.url}
                      alt={`Foto ${photo.order_index + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      loading="lazy"
                    />
                  <span className="mt-1 block px-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                    Foto {photo.order_index + 1}
                  </span>
                  </a>
                ) : (
                  <div className="border-2 border-ink bg-surface p-1 shadow-hard-sm">
                    <span className="flex aspect-[3/4] w-full items-center justify-center font-mono text-[11px] text-muted-foreground">
                      URL tidak tersedia
                    </span>
                    <span className="mt-1 block px-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                      Foto {photo.order_index + 1}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {tx.gif_url && (
          <a
            href={tx.gif_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit min-h-9 items-center gap-1 border-2 border-ink bg-surface px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Buka GIF hasil
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </section>
    </PageShell>
  );
}
