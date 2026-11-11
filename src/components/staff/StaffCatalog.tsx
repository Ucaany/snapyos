import Image from "next/image";
import { Camera, ImageIcon, Package, Store } from "lucide-react";

import {
  StaffMeta,
  StaffPanel,
  StaffPanelHeader,
  STAFF_CARD_SURFACE,
} from "@/components/staff/StaffPrimitives";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import type { OutletRow } from "@/server/outlets";
import type { PackageRow } from "@/server/packages";
import type { PhotoboxRow } from "@/server/photoboxes";
import type { TemplateRow } from "@/server/templates";
import { cn } from "@/lib/utils";

const BOOTH_STATUS_LABEL: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  maintenance: "Perawatan",
};

export function StaffBoothsBoard({
  photoboxes,
  businessSlug,
  timeZone,
}: {
  photoboxes: PhotoboxRow[];
  businessSlug: string;
  timeZone: string;
}) {
  if (photoboxes.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Camera}
        eyebrow="BELUM ADA BOOTH"
        title="Belum ada booth yang di-assign ke Anda."
        body="Minta owner memberi akses booth lewat menu Tim, lalu muat ulang halaman ini."
      />
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2" aria-label="Daftar booth">
      {photoboxes.map((booth) => {
        const devices = [booth.camera, booth.printer, booth.display].filter(Boolean);
        return (
          <li key={booth.id} className={cn("flex flex-col", STAFF_CARD_SURFACE)}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-ink bg-bg px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {booth.outlet_name ?? "TANPA OUTLET"}
                </p>
                <h3 className="truncate font-display text-lg uppercase leading-tight tracking-tight">
                  {booth.name}
                </h3>
              </div>
              <StatusBadge
                status={booth.status}
                label={BOOTH_STATUS_LABEL[booth.status] ?? booth.status}
              />
            </div>

            <dl className="grid gap-3 px-4 py-3 md:grid-cols-2">
              <StaffMeta label="URL PERANGKAT">
                <span className="break-all">
                  /p/{businessSlug}/{booth.slug}
                </span>
              </StaffMeta>
              <StaffMeta label="OUTLET">{booth.outlet_name ?? "-"}</StaffMeta>
              <StaffMeta label="TERDAFTAR">{formatDate(booth.created_at, timeZone)}</StaffMeta>
              <StaffMeta label="MODE BAYAR">
                {booth.payment_mode === "voucher"
                  ? "Voucher"
                  : booth.payment_mode === "gateway"
                    ? "Gateway"
                    : "Gateway + voucher"}
              </StaffMeta>
            </dl>

            <div className="mt-auto border-t-2 border-ink/20 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                PERANGKAT TERDETEKSI
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {devices.length > 0 ? (
                  devices.map((device) => (
                    <span
                      key={device}
                      className="border-2 border-ink bg-bg px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em]"
                    >
                      {device}
                    </span>
                  ))
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    Belum ada perangkat terdeteksi
                  </span>
                )}
              </div>
              {!booth.has_exit_pin ? (
                <p className="mt-2 border-2 border-destructive bg-destructive/10 px-2 py-1.5 font-mono text-[11px] font-bold uppercase leading-snug tracking-[0.06em]">
                  PIN keluar kiosk belum diset. Minta owner mengaturnya sebelum booth dipakai.
                </p>
              ) : booth.has_legacy_exit_pin ? (
                <p className="mt-2 border-2 border-ink bg-accent px-2 py-1.5 font-mono text-[11px] font-bold uppercase leading-snug tracking-[0.06em]">
                  PIN legacy terdeteksi. Minta owner menyetel ulang PIN.
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StaffOutletsBoard({ outlets }: { outlets: OutletRow[] }) {
  if (outlets.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Store}
        eyebrow="BELUM ADA OUTLET"
        title="Belum ada outlet yang bisa Anda akses."
        body="Outlet muncul setelah owner memberi akses booth pada lokasi tersebut."
      />
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2" aria-label="Daftar outlet">
      {outlets.map((outlet, index) => (
        <li key={outlet.id} className={cn("flex flex-col", STAFF_CARD_SURFACE)}>
          <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-ink bg-bg px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center border-2 border-ink bg-accent font-mono text-[11px] font-bold">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  OUTLET
                </p>
                <h3 className="truncate font-display text-lg uppercase leading-tight tracking-tight">
                  {outlet.name}
                </h3>
              </div>
            </div>
            <StatusBadge
              status={outlet.status}
              label={outlet.status === "active" ? "Aktif" : "Nonaktif"}
            />
          </div>
          <dl className="grid gap-3 px-4 py-3 md:grid-cols-2">
            <StaffMeta label="WILAYAH">
              {[outlet.city, outlet.province].filter(Boolean).join(" · ") || "-"}
            </StaffMeta>
            <StaffMeta label="PHOTOBOX">{String(outlet.photobox_count).padStart(2, "0")}</StaffMeta>
            <StaffMeta label="ALAMAT" className="md:col-span-2">
              {outlet.address ?? "-"}
            </StaffMeta>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function StaffPackagesBoard({
  packages,
  timeZone,
}: {
  packages: PackageRow[];
  timeZone: string;
}) {
  if (packages.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Package}
        eyebrow="BELUM ADA PACKAGE"
        title="Belum ada paket untuk booth yang Anda akses."
        body="Minta owner menetapkan paket pada booth Anda lewat dashboard, lalu muat ulang halaman."
      />
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2" aria-label="Daftar package">
      {packages.map((pkg) => (
        <li key={pkg.id} className={cn("flex flex-col", STAFF_CARD_SURFACE)}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink bg-bg px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                PACKAGE · {pkg.capture_mode.toUpperCase()}
              </p>
              <h3 className="truncate font-display text-lg uppercase leading-tight tracking-tight">
                {pkg.name}
              </h3>
              {pkg.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {pkg.description}
                </p>
              ) : null}
            </div>
            <StatusBadge
              status={pkg.is_active ? "active" : "inactive"}
              label={pkg.is_active ? "Aktif" : "Nonaktif"}
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                HARGA
              </p>
              <p className="font-mono text-2xl font-bold leading-none">{formatIDR(pkg.price)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <PackageCount label="FOTO" value={pkg.photo_count} />
              <PackageCount label="CETAK" value={pkg.print_count} />
              <PackageCount label="DIGITAL" value={pkg.digital_output ? "YA" : "-"} />
            </div>
          </div>

          <dl className="mt-auto grid gap-3 border-t-2 border-ink/20 px-4 py-3 md:grid-cols-2">
            <StaffMeta label="ASSIGN">
              {`${pkg.template_count} template · ${pkg.outlet_count} outlet · ${pkg.photobox_count} booth`}
            </StaffMeta>
            <StaffMeta label="DIBUAT">{formatDate(pkg.created_at, timeZone)}</StaffMeta>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function StaffTemplatesBoard({ templates }: { templates: TemplateRow[] }) {
  if (templates.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ImageIcon}
        eyebrow="BELUM ADA TEMPLATE"
        title="Belum ada frame yang tersedia untuk Anda."
        body="Minta owner mengunggah frame dan meng-assign-nya ke paket booth Anda, lalu muat ulang halaman."
      />
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Daftar template">
      {templates.map((template) => {
        const previewSrc = template.thumbnail_preview_url ?? template.preview_url;
        return (
          <li key={template.id} className={cn("flex flex-col", STAFF_CARD_SURFACE)}>
            <div
              className={cn(
                "relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b-2 border-ink",
                previewSrc
                  ? "bg-muted"
                  : "bg-[repeating-linear-gradient(45deg,#FFFDF5_0_10px,#F4F4F0_10px_20px)]"
              )}
            >
              {previewSrc ? (
                <Image
                  src={previewSrc}
                  alt={`Preview template ${template.name}`}
                  width={480}
                  height={360}
                  className="max-h-full max-w-full object-contain p-3"
                  loading="lazy"
                  unoptimized
                />
              ) : (
                <span className="px-3 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  PREVIEW TIDAK TERSEDIA
                </span>
              )}
              <span className="absolute left-2 top-2 border-2 border-ink bg-bg px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                {template.category}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 font-display text-base uppercase leading-tight tracking-tight">
                  {template.name}
                </h3>
                <StatusBadge
                  status={template.is_active ? "active" : "inactive"}
                  label={template.is_active ? "Aktif" : "Nonaktif"}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {template.is_global ? (
                  <span className="border-2 border-ink bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg">
                    TEMPLATE PLATFORM
                  </span>
                ) : null}
                {template.is_global && !template.is_active ? (
                  <span className="border-2 border-ink bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                    NONAKTIF
                  </span>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <StaffMeta label="SLOT">
                  {template.slot_count > 0 ? `${template.slot_count} foto` : "Frame penuh"}
                </StaffMeta>
                <StaffMeta label="FORMAT">
                  {template.file_url.endsWith(".png") ? "PNG" : "FRAME"}
                </StaffMeta>
              </dl>
              {template.is_active && template.assigned === false ? (
                <p className="border-2 border-destructive bg-destructive/10 px-2 py-1.5 font-mono text-[11px] font-bold uppercase leading-snug tracking-[0.06em]">
                  Belum di-assign ke paket mana pun — tampil sebagai fallback untuk paket yang belum
                  punya assignment.
                </p>
              ) : (
                <p className="border-2 border-ink/20 bg-muted px-2 py-1.5 font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-muted-foreground">
                  {template.assigned_packages && template.assigned_packages.length > 0
                    ? `Dipakai: ${template.assigned_packages.map((p) => p.name).join(", ")}`
                    : "Tampil di semua paket booth Anda."}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StaffCatalogShell({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <StaffPanel aria-label={title}>
      <StaffPanelHeader label={title} meta={meta} />
      <div className="p-4 sm:p-5">{children}</div>
    </StaffPanel>
  );
}

function PackageCount({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-[3.5rem] border-2 border-ink bg-bg px-2 py-1 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-bold leading-none">{value}</p>
    </div>
  );
}
