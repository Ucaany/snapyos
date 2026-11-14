import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Camera,
  CircleAlert,
  CreditCard,
  MapPin,
  Monitor,
  Radio,
  Receipt,
  Store,
  WifiOff,
} from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminLiveRefresh } from "@/components/admin/AdminLiveRefresh";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagedTable } from "@/components/admin/AdminPagedBlocks";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Badge } from "@/components/admin/ui/badge";
import { buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Progress } from "@/components/admin/ui/progress";
import { TableCell, TableHead, TableRow } from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { DEVICE_ONLINE_WINDOW_MS } from "@/lib/device-online";
import { heartbeatLabel } from "@/lib/heartbeat-label";
import { getBusinessDetail } from "@/server/admin";
import {
  deleteBusinessAction,
  revokeBusinessDeviceAction,
  updateBusinessAction,
} from "@/server/admin-actions";

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

const METHOD_LABEL: Record<string, string> = {
  qris: "QRIS",
  cash: "Tunai",
  bank_transfer: "Transfer",
  other: "Lainnya",
  offline: "Offline",
  manual: "Manual",
  voucher: "Voucher",
};

export default async function AdminBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getBusinessDetail(id);
  } catch {
    notFound();
  }

  const { business, subscription, outlets, booths, devices, transactions, usage, storage, nowMs } =
    detail;
  const numberFormat = new Intl.NumberFormat("id-ID");
  const suspended = business.status === "suspended";

  const onlineBooths = booths.filter((b) => b.online).length;
  const maintenanceBooths = booths.filter((b) => b.status === "maintenance").length;
  const offlineBooths = booths.length - onlineBooths - maintenanceBooths;
  const staleBooths = booths.filter((b) => b.stale);
  const onlineDevices = devices.filter((d) => d.online).length;
  const printersReady = devices.filter((d) => d.printer?.ok).length;

  return (
    <div className="admin-grid-lines flex flex-col gap-10">
      <AdminPageHeader
        size="hero"
        icon={Building2}
        title={business.name}
        description={`${business.owner_email ?? "Tanpa owner"} · ${subscription.plan_name ?? "Tanpa paket"} · ${outlets.length} outlet · ${booths.length} booth.`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge status={suspended ? "inactive" : "active"} />
            <AdminActionButton
              action={updateBusinessAction}
              hidden={{ businessId: business.id, status: suspended ? "active" : "suspended" }}
              submitLabel={suspended ? "Aktifkan" : "Suspend"}
              icon={suspended ? "circleCheck" : "ban"}
              iconOnly
              variant={suspended ? "neutral" : "destructive"}
              confirm={
                suspended
                  ? undefined
                  : `Suspend ${business.name}? Semua kiosk langsung diblokir dari checkout & sesi baru.`
              }
            />
            <AdminActionButton
              action={deleteBusinessAction}
              hidden={{ businessId: business.id }}
              submitLabel="Hapus"
              icon="trash"
              iconOnly
              variant="destructive"
              confirm={`Hapus ${business.name} permanen? Seluruh data tenant ikut terhapus dan tidak bisa dikembalikan.`}
            />
            <Link
              href="/admin/businesses"
              aria-label="Kembali ke daftar bisnis"
              title="Kembali ke daftar bisnis"
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <section aria-labelledby="admin-biz-detail-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-biz-detail-metrics"
          title="Ikhtisar"
          description={`Booth online dihitung dari heartbeat device dalam ${Math.round(DEVICE_ONLINE_WINDOW_MS / 1000)} detik terakhir.`}
          action={<AdminLiveRefresh intervalMs={15_000} label="Heartbeat" />}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Camera}
            label="Booth online"
            value={`${numberFormat.format(onlineBooths)} / ${numberFormat.format(booths.length)}`}
            sub={`${numberFormat.format(offlineBooths)} offline · ${numberFormat.format(maintenanceBooths)} perawatan`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Monitor}
            label="Perangkat"
            value={`${numberFormat.format(onlineDevices)} / ${numberFormat.format(devices.length)}`}
            sub={`${numberFormat.format(printersReady)} printer siap`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Store}
            label="Outlet"
            value={numberFormat.format(outlets.length)}
            sub={`${outlets.filter((o) => o.status === "active").length} outlet aktif`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Receipt}
            label="Transaksi"
            value={numberFormat.format(usage.transactions)}
            sub={`${numberFormat.format(usage.sessions)} sesi foto`}
          />
          <AdminMetricCard
            tone={storage.isFull ? "amber" : "sky"}
            icon={CreditCard}
            label="Storage"
            value={`${numberFormat.format(storage.usedMb)} MB`}
            sub={
              storage.limitMb > 0
                ? `dari ${numberFormat.format(storage.limitMb)} MB · ${storage.percent}%`
                : "kuota tidak aktif"
            }
          />
        </div>

        {staleBooths.length > 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {staleBooths.length} booth tidak mengirim heartbeat lebih dari 10 menit:{" "}
              {staleBooths.map((b) => b.name).join(", ")}.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Building2
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Profil tenant
              </CardTitle>
              <CardDescription>Identitas bisnis dan kontak operasional.</CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  {outlets.length} outlet · {booths.length} booth
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Slug", value: `/p/${business.slug}` },
                  { label: "Zona waktu", value: business.timezone },
                  { label: "Owner", value: business.owner_name ?? business.owner_email ?? "-" },
                  { label: "Email", value: business.contact_email ?? business.owner_email ?? "-" },
                  { label: "WhatsApp", value: business.whatsapp ?? "-" },
                  { label: "Terdaftar", value: dateFmt.format(new Date(business.created_at)) },
                ]}
              />
              {business.address ? (
                <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{business.address}</span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                Langganan
              </CardTitle>
              <CardDescription>Paket dan masa aktif tenant.</CardDescription>
              <CardAction>
                <AdminStatusBadge status={subscription.status ?? "expired"} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Paket", value: subscription.plan_name ?? "-" },
                  {
                    label: "Status",
                    value: (subscription.status ?? "expired").toUpperCase(),
                  },
                  {
                    label: "Periode berakhir",
                    value: subscription.current_period_end
                      ? dateFmt.format(new Date(subscription.current_period_end))
                      : "-",
                  },
                  { label: "Storage", value: `${storage.percent}% terpakai` },
                ]}
              />
              {storage.limitMb > 0 ? (
                <div className="flex flex-col gap-1.5 border-t pt-4">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Pemakaian storage</span>
                    <span className="font-medium tabular-nums">
                      {numberFormat.format(storage.usedMb)} / {numberFormat.format(storage.limitMb)}{" "}
                      MB
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, storage.percent)}
                    className="h-1.5"
                    aria-label={`Pemakaian storage ${storage.percent}%`}
                  />
                  {storage.isFull ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                      Kuota penuh, unggahan baru ditolak.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="admin-biz-detail-booths" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-biz-detail-booths"
          title="Booth"
          description="Status live per booth dari heartbeat device."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Booth tenant
            </CardTitle>
            <CardDescription>
              {onlineBooths} online · {offlineBooths} offline · {maintenanceBooths} perawatan
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">{numberFormat.format(booths.length)} booth</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {booths.length === 0 ? (
              <AdminEmptyState
                heading="Belum ada booth"
                icon={Camera}
                action={
                  <Link
                    href="/admin/businesses"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Kembali ke daftar
                  </Link>
                }
              >
                Tenant ini belum mendaftarkan booth. Status heartbeat muncul setelah device
                di-pairing.
              </AdminEmptyState>
            ) : (
              <AdminPagedTable
                itemLabel="booth"
                pageSize={8}
                header={
                  <TableRow>
                    <TableHead>Booth</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Heartbeat</TableHead>
                    <TableHead className="hidden sm:table-cell">Device</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Sesi</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Transaksi</TableHead>
                    <TableHead>Kiosk</TableHead>
                  </TableRow>
                }
                rows={booths.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {b.name}
                      <span className="block text-xs text-muted-foreground">/p/{b.slug}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {b.outletName ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <AdminStatusBadge
                          status={
                            b.status === "maintenance"
                              ? "maintenance"
                              : b.online
                                ? "online"
                                : "offline"
                          }
                        />
                        {b.stale ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            &gt; 10 menit
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {heartbeatLabel(b.lastHeartbeatAt, nowMs)}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal sm:table-cell">
                      <span className="flex flex-col gap-0.5 text-xs tabular-nums">
                        <span>
                          {b.onlineDevices} / {b.deviceCount} device online
                        </span>
                        <span className="text-muted-foreground">
                          {devices.filter((d) => d.boothId === b.id && d.printer?.ok).length}{" "}
                          printer siap
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {numberFormat.format(b.sessions)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {numberFormat.format(b.transactions)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/p/${business.slug}/${b.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center text-xs underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                      >
                        Buka
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-biz-detail-devices" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-biz-detail-devices"
          title="Perangkat"
          description="Device terpairing, status kamera, dan printer dari laporan heartbeat."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Monitor className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Perangkat terhubung
            </CardTitle>
            <CardDescription>
              {devices.filter((d) => d.online).length} online dari {devices.length} device
              terpairing.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">{numberFormat.format(devices.length)} device</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <AdminEmptyState
                heading="Belum ada perangkat"
                icon={Monitor}
                action={
                  <Link
                    href={`/admin/businesses/${business.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Muat ulang
                  </Link>
                }
              >
                Belum ada device yang di-pairing ke booth tenant ini. Perangkat muncul setelah kiosk
                mengaktifkan kode pairing.
              </AdminEmptyState>
            ) : (
              <AdminPagedTable
                itemLabel="perangkat"
                pageSize={8}
                header={
                  <TableRow>
                    <TableHead>Perangkat</TableHead>
                    <TableHead>Booth</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Heartbeat</TableHead>
                    <TableHead className="hidden md:table-cell">Kamera</TableHead>
                    <TableHead className="hidden md:table-cell">Printer</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                }
                rows={devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {d.name ?? "Tanpa nama"}
                      <span className="block text-xs text-muted-foreground">
                        {d.runtimeVersion ? `runtime ${d.runtimeVersion}` : "runtime belum lapor"}
                        {d.kioskLocked ? " · kiosk terkunci" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {d.boothName}
                    </TableCell>
                    <TableCell>
                      <AdminStatusBadge status={d.online ? "online" : "offline"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {heartbeatLabel(d.lastHeartbeatAt, nowMs)}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal md:table-cell">
                      {d.camera ? (
                        <span className="flex flex-col gap-0.5 text-xs">
                          <span className="font-medium">
                            {d.camera.connected ? "Terhubung" : "Tidak terhubung"}
                          </span>
                          <span className="text-muted-foreground">
                            {d.camera.adapter ?? "adapter tidak dilaporkan"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum lapor</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal md:table-cell">
                      {d.printer ? (
                        <span className="flex flex-col gap-0.5 text-xs">
                          <span
                            className={
                              d.printer.ok
                                ? "font-medium text-emerald-700 dark:text-emerald-300"
                                : "font-medium text-amber-700 dark:text-amber-300"
                            }
                          >
                            {d.printer.ok ? "Siap" : "Bermasalah"}
                            {d.printer.state ? ` · ${d.printer.state}` : ""}
                          </span>
                          <span className="text-muted-foreground">
                            {d.printer.adapter ?? "adapter tidak dilaporkan"}
                            {d.printer.mode ? ` · ${d.printer.mode}` : ""}
                            {d.printer.queue !== null ? ` · antrean ${d.printer.queue}` : ""}
                          </span>
                          {d.printer.media ? (
                            <span className="text-muted-foreground">media {d.printer.media}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum lapor</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <AdminActionButton
                        action={revokeBusinessDeviceAction}
                        hidden={{ businessId: business.id, deviceId: d.id }}
                        submitLabel="Putuskan"
                        icon="unplug"
                        iconOnly
                        variant="destructive"
                        confirm={`Putuskan perangkat ${d.name ?? d.id} dari booth ${d.boothName}? Kiosk kehilangan token dan harus pairing ulang.`}
                        confirmTitle="Putuskan perangkat"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-biz-detail-outlets" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-biz-detail-outlets"
          title="Outlet"
          description="Lokasi fisik tempat booth dipasang."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Store className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Daftar outlet
            </CardTitle>
            <CardDescription>{outlets.length} outlet terdaftar.</CardDescription>
          </CardHeader>
          <CardContent>
            {outlets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada outlet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {outlets.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{o.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.city ?? "Tanpa kota"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary" className="tabular-nums">
                        {booths.filter((b) => b.outletId === o.id).length} booth
                      </Badge>
                      <AdminStatusBadge status={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-biz-detail-tx" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-biz-detail-tx"
          title="Transaksi"
          description="50 transaksi terakhir tenant ini."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Receipt
                className="size-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Riwayat transaksi
            </CardTitle>
            <CardDescription>Diurutkan dari yang terbaru.</CardDescription>
            <CardAction>
              <Badge variant="secondary">{numberFormat.format(transactions.length)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
            ) : (
              <AdminPagedTable
                itemLabel="transaksi"
                pageSize={10}
                header={
                  <TableRow>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Booth</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Dibuat</TableHead>
                  </TableRow>
                }
                rows={transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {t.number}
                      <span className="block text-xs text-muted-foreground">
                        {t.paidAt ? `Paid ${dateFmt.format(new Date(t.paidAt))}` : "Belum dibayar"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {t.boothName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {METHOD_LABEL[t.method] ?? t.method}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(t.amount)}</TableCell>
                    <TableCell>
                      <AdminStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFmt.format(new Date(t.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
