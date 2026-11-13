import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ImageOff } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  StaffMeta,
  StaffPageHeader,
  StaffPanel,
  StaffPanelHeader,
} from "@/components/staff/StaffPrimitives";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getTransactionDetail } from "@/server/transactions";

export const metadata: Metadata = {
  title: "Detail Transaksi: SnapyOS",
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

/** /staff/transactions/:id — detail read-only + URL foto hasil. */
export default async function StaffTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/welcome");
  if (can(active.role, "transaction:read")) redirect("/dashboard/transactions");

  const { id } = await params;
  let tx;
  try {
    tx = await getTransactionDetail(user.id, active.business.id, id);
  } catch {
    notFound();
  }

  const timeZone = active.business.timezone || "Asia/Jakarta";

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow={`TRANSAKSI · ${tx.status.toUpperCase()}`}
        title={tx.number}
        description="Detail transaksi booth Anda, termasuk tautan foto hasil pelanggan."
        aside={
          <Link
            href="/staff/transactions"
            className="inline-flex min-h-11 items-center gap-2 border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-[3px_3px_0_0_#111111] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Kembali
          </Link>
        }
      />

      <StaffPanel aria-label="Ringkasan transaksi">
        <StaffPanelHeader label="TRANSAKSI.DETAIL" meta={tx.status.toUpperCase()} />
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
          <dl className="grid gap-3 border-t-2 border-ink pt-4 md:grid-cols-3">
            <StaffMeta label="TANGGAL">
              {formatDate(tx.paid_at ?? tx.created_at, timeZone)}
            </StaffMeta>
            <StaffMeta label="PELANGGAN">{tx.customer_name ?? "-"}</StaffMeta>
            <StaffMeta label="PAKET">{tx.package_name ?? "-"}</StaffMeta>
            <StaffMeta label="OUTLET / BOOTH">
              {[tx.outlet_name, tx.photobox_name].filter(Boolean).join(" · ") || "-"}
            </StaffMeta>
            <StaffMeta label="METODE">
              {METHOD_LABEL[tx.payment_method] ?? tx.payment_method}
            </StaffMeta>
            <StaffMeta label="AKHIR">{formatIDR(tx.final_amount)}</StaffMeta>
            <StaffMeta label="KOTOR">{formatIDR(tx.gross_amount)}</StaffMeta>
            <StaffMeta label="DISKON">
              {tx.discount_amount > 0 ? formatIDR(tx.discount_amount) : "-"}
            </StaffMeta>
            <StaffMeta label="SUMBER">{tx.pos_order_id ? "POS" : "Kiosk"}</StaffMeta>
            <StaffMeta label="MASA SIMPAN HASIL">
              {tx.days_left === null
                ? "-"
                : tx.days_left === 0
                  ? "Kedaluwarsa"
                  : `Sisa ${tx.days_left} hari`}
            </StaffMeta>
          </dl>
        </div>
      </StaffPanel>

      <StaffPanel aria-label="Foto hasil">
        <StaffPanelHeader label="FOTO.HASIL" meta={`${tx.photos.length} FILE`} />
        <div className="p-4 sm:p-5">
          {tx.photos.length === 0 ? (
            <div className="flex items-center gap-3 border-2 border-ink bg-bg p-4">
              <ImageOff className="size-5 shrink-0" aria-hidden />
              <p className="font-mono text-xs text-muted-foreground">
                Transaksi ini tidak punya foto (POS/manual atau media sudah dibersihkan retensi).
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tx.photos.map((photo) => (
                <li key={photo.id} className="min-w-0">
                  <a
                    href={photo.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block border-2 border-ink bg-surface p-1 shadow-[3px_3px_0_0_#111111] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL dinamis, bukan aset statis
                      <img
                        src={photo.url}
                        alt={`Foto ${photo.order_index + 1}`}
                        className="aspect-[3/4] w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex aspect-[3/4] w-full items-center justify-center font-mono text-[11px] text-muted-foreground">
                        URL tidak tersedia
                      </span>
                    )}
                    <span className="mt-1 block px-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                      Foto {photo.order_index + 1}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {tx.gif_url && (
            <a
              href={tx.gif_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-fit min-h-9 items-center gap-1 border-2 border-ink bg-surface px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Buka GIF hasil
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </StaffPanel>
    </div>
  );
}
