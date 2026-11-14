import Link from "next/link";
import { Activity, Building2, Filter, Radio, Receipt, Store } from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminLiveRefresh } from "@/components/admin/AdminLiveRefresh";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Badge } from "@/components/admin/ui/badge";
import { Progress } from "@/components/admin/ui/progress";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
import { deleteBusinessAction, updateBusinessAction } from "@/server/admin-actions";
import { heartbeatLabel } from "@/lib/heartbeat-label";
import { DEVICE_ONLINE_WINDOW_MS } from "@/lib/device-online";
import { cn } from "@/lib/utils";
import { getBusinessStats, listBusinesses } from "@/server/admin";

type BusinessRow = Awaited<ReturnType<typeof listBusinesses>>["items"][number];

/** Ringkasan booth online/offline per tenant + heartbeat terakhir. */
function BoothStatusCell({
  booths,
  lastHeartbeatAt,
  nowMs,
}: {
  booths: BusinessRow["booths"];
  lastHeartbeatAt: string | null;
  nowMs: number;
}) {
  if (booths.total === 0) {
    return <span className="text-xs text-muted-foreground">Belum ada booth</span>;
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-sm tabular-nums">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            booths.online > 0 ? "bg-emerald-500" : "bg-neutral-400"
          )}
          aria-hidden="true"
        />
        {booths.online} online
        <span className="text-muted-foreground">/ {booths.total}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {heartbeatLabel(lastHeartbeatAt, nowMs)}
      </span>
    </span>
  );
}

function StorageBadge({
  storage,
}: {
  storage: { limitMb: number; usedMb: number; isFull: boolean; percent: number };
}) {
  if (storage.limitMb <= 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        TIDAK AKTIF
      </Badge>
    );
  }
  return (
    <>
      <span className={storage.isFull ? "font-medium text-destructive" : ""}>
        {storage.usedMb} / {storage.limitMb} MB
      </span>
      <Progress
        value={Math.min(100, storage.percent)}
        className="mt-1.5 h-1.5 w-24"
        aria-label={`Pemakaian storage ${storage.percent}%`}
      />
      <Badge variant={storage.isFull ? "destructive" : "secondary"} className="mt-1">
        {storage.isFull ? "PENUH - UPGRADE" : `AKTIF · ${storage.percent}%`}
      </Badge>
    </>
  );
}

function BusinessRowActions({ b }: { b: BusinessRow }) {
  const suspended = b.status === "suspended";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminActionButton
        action={updateBusinessAction}
        hidden={{ businessId: b.id, status: suspended ? "active" : "suspended" }}
        submitLabel={suspended ? "Aktifkan" : "Suspend"}
        icon={suspended ? "circleCheck" : "ban"}
        iconOnly
        variant={suspended ? "neutral" : "destructive"}
        confirm={
          suspended
            ? undefined
            : `Suspend ${b.name}? Semua kiosk langsung diblokir dari checkout & sesi baru.`
        }
        confirmTitle={`Suspend ${b.name}`}
      />
      <AdminActionButton
        action={deleteBusinessAction}
        hidden={{ businessId: b.id }}
        submitLabel="Hapus"
        icon="trash"
        iconOnly
        variant="destructive"
        confirm={`Hapus ${b.name} permanen? Seluruh data tenant (outlet, photobox, sesi, transaksi, storage) ikut terhapus dan tidak bisa dikembalikan.`}
        confirmTitle={`Hapus ${b.name}`}
      />
    </div>
  );
}

/** Bar skala: nilai + porsi, satu hue per baris (pola Ringkasan). */
function ScaleList({
  rows,
  unitLabel,
}: {
  rows: { key: string; label: string; value: number; share: number; color: string }[];
  unitLabel: string;
}) {
  const numberFormat = new Intl.NumberFormat("id-ID");
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              <span className="truncate text-sm">{row.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="text-sm font-medium">{numberFormat.format(row.value)}</span>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {row.share.toFixed(row.share >= 10 ? 0 : 1).replace(".", ",")}%
              </span>
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${row.label}: ${row.value} ${unitLabel} (${Math.round(row.share)}%)`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(row.share > 0 ? 2 : 0, row.share))}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin businesses - list + filter status + suspend/reactivate + hapus
 * (docs/10 §10.2). Business suspended → kiosk tidak bisa checkout/sesi baru
 * (server-side, dicek di resolveActiveDevice - docs/10 §10.5). Hapus menyapu
 * storage lebih dulu lalu baris DB (CASCADE seluruh data tenant).
 */
export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const status = q.status === "active" || q.status === "suspended" ? q.status : undefined;
  const [{ items, total, nowMs }, stats] = await Promise.all([
    listBusinesses({ search: q.search, status, page, limit: 20 }),
    getBusinessStats(),
  ]);

  const numberFormat = new Intl.NumberFormat("id-ID");
  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const filtered = Boolean(q.search || status);

  const tenantScale = [
    {
      key: "active",
      label: "Aktif",
      value: stats.active,
      share: stats.total ? (stats.active / stats.total) * 100 : 0,
      color: "var(--chart-2)",
    },
    {
      key: "suspended",
      label: "Suspend",
      value: stats.suspended,
      share: stats.total ? (stats.suspended / stats.total) * 100 : 0,
      color: "var(--chart-1)",
    },
  ];
  const usageMax = Math.max(1, stats.outlets, stats.photoboxes, stats.sessions, stats.transactions);
  const usageScale = [
    {
      key: "outlets",
      label: "Outlet",
      value: stats.outlets,
      share: (stats.outlets / usageMax) * 100,
      color: "var(--chart-2)",
    },
    {
      key: "photoboxes",
      label: "Booth",
      value: stats.photoboxes,
      share: (stats.photoboxes / usageMax) * 100,
      color: "var(--chart-3)",
    },
    {
      key: "sessions",
      label: "Sesi foto",
      value: stats.sessions,
      share: (stats.sessions / usageMax) * 100,
      color: "var(--chart-4)",
    },
    {
      key: "transactions",
      label: "Transaksi",
      value: stats.transactions,
      share: (stats.transactions / usageMax) * 100,
      color: "var(--chart-1)",
    },
  ];
  const boothPerTenant = stats.total ? stats.photoboxes / stats.total : 0;

  return (
    <div className="admin-grid-lines flex flex-col gap-10">
      <AdminPageHeader
        size="hero"
        icon={Building2}
        title="Manajemen Bisnis"
        description={`${numberFormat.format(total)} tenant terdaftar. Suspend memblokir sesi & checkout baru di seluruh booth tenant.`}
      />

      <section aria-labelledby="admin-businesses-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-businesses-metrics"
          title="Ikhtisar"
          description={`Booth online dihitung dari heartbeat device dalam ${Math.round(DEVICE_ONLINE_WINDOW_MS / 1000)} detik terakhir.`}
          action={<AdminLiveRefresh intervalMs={15_000} label="Heartbeat" />}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Building2}
            label="Total bisnis"
            value={numberFormat.format(stats.total)}
            sub={`${numberFormat.format(stats.active)} aktif · ${numberFormat.format(stats.suspended)} suspend`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Radio}
            label="Booth online"
            value={`${numberFormat.format(stats.boothsOnline)} / ${numberFormat.format(stats.photoboxes)}`}
            sub={`${numberFormat.format(stats.photoboxes - stats.boothsOnline - stats.boothsMaintenance)} offline · ${numberFormat.format(stats.boothsMaintenance)} perawatan`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Receipt}
            label="Total transaksi"
            value={numberFormat.format(stats.transactions)}
            sub={`${numberFormat.format(stats.sessions)} sesi foto`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Store}
            label="Total outlet"
            value={numberFormat.format(stats.outlets)}
            sub={`${numberFormat.format(stats.photoboxes)} booth terdaftar`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Building2
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Skala status tenant
              </CardTitle>
              <CardDescription>
                Komposisi tenant aktif dan suspend dari {numberFormat.format(stats.total)} bisnis.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{numberFormat.format(stats.total)} tenant</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-medium text-muted-foreground">Status tenant</h3>
                <ScaleList rows={tenantScale} unitLabel="tenant" />
                <p className="text-xs text-muted-foreground">
                  Suspend mencabut sesi member dan memblokir checkout baru.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <h3 className="text-xs font-medium text-muted-foreground">Ringkasan</h3>
                <AdminStatGrid
                  columns={2}
                  items={[
                    { label: "Total tenant", value: numberFormat.format(stats.total) },
                    { label: "Aktif", value: numberFormat.format(stats.active) },
                    { label: "Suspend", value: numberFormat.format(stats.suspended) },
                    {
                      label: "Booth / tenant",
                      value: boothPerTenant.toFixed(1).replace(".", ","),
                    },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {numberFormat.format(stats.outlets)} outlet tersebar di seluruh tenant.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                Pemakaian platform
              </CardTitle>
              <CardDescription>Volume operasional seluruh tenant.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ScaleList rows={usageScale} unitLabel="unit" />
              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Booth online", value: numberFormat.format(stats.boothsOnline) },
                  { label: "Perawatan", value: numberFormat.format(stats.boothsMaintenance) },
                  { label: "Sesi foto", value: numberFormat.format(stats.sessions) },
                  { label: "Transaksi", value: numberFormat.format(stats.transactions) },
                ]}
              />
              <p className="border-t pt-4 text-xs text-muted-foreground">
                {numberFormat.format(stats.sessions)} sesi foto dan{" "}
                {numberFormat.format(stats.transactions)} transaksi tercatat dari{" "}
                {numberFormat.format(stats.photoboxes)} booth.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <AdminRecordCollection
          storageKey="snapyos.view.admin.businesses"
          label="Daftar bisnis"
          title="Tenant terdaftar"
          description={`${numberFormat.format(total)} bisnis cocok filter saat ini.`}
          toolbar={
            <AdminFilterForm action="/admin/businesses" className="flex flex-wrap items-end gap-3">
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <Label htmlFor="biz-search" className="text-xs text-muted-foreground">
                  Cari nama / slug
                </Label>
                <Input
                  id="biz-search"
                  name="search"
                  defaultValue={q.search ?? ""}
                  className="w-full sm:w-56"
                  placeholder="cth. klik-foto"
                />
              </div>
              <AdminSelect
                id="biz-status"
                name="status"
                label="Status"
                defaultValue={status ?? ""}
                options={[
                  { value: "", label: "SEMUA" },
                  { value: "active", label: "AKTIF" },
                  { value: "suspended", label: "SUSPEND" },
                ]}
              />
              <Button type="submit" size="sm" variant="outline">
                <Filter className="size-4" aria-hidden="true" />
                Terapkan
              </Button>
              {filtered ? (
                <Link
                  href="/admin/businesses"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Hapus filter
                </Link>
              ) : null}
            </AdminFilterForm>
          }
          empty={
            items.length === 0 ? (
              <AdminEmptyState
                heading="Tidak ada bisnis"
                icon={Building2}
                action={
                  filtered ? (
                    <Link
                      href="/admin/businesses"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Hapus filter
                    </Link>
                  ) : null
                }
              >
                {filtered ? (
                  <>
                    Tidak ada bisnis yang cocok dengan filter saat ini. Hapus filter untuk melihat
                    seluruh tenant.
                  </>
                ) : (
                  "Belum ada bisnis terdaftar di platform. Tenant muncul di sini setelah owner membuat bisnis pertama."
                )}
              </AdminEmptyState>
            ) : undefined
          }
          list={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bisnis</TableHead>
                  <TableHead className="hidden lg:table-cell">Owner</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Booth</TableHead>
                  <TableHead className="hidden xl:table-cell">Pemakaian</TableHead>
                  <TableHead className="hidden lg:table-cell">Storage</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="block text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        <Link
                          href={`/p/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                        >
                          /p/{b.slug}
                        </Link>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {dateFmt.format(new Date(b.created_at))}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal lg:table-cell">
                      {b.owner_email ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium">{b.plan_name ?? "-"}</span>
                      <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                    </TableCell>
                    <TableCell>
                      <AdminStatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                    </TableCell>
                    <TableCell>
                      <BoothStatusCell
                        booths={b.booths}
                        lastHeartbeatAt={b.lastHeartbeatAt}
                        nowMs={nowMs}
                      />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-muted-foreground">Outlet</dt>
                          <dd className="font-medium tabular-nums">{b.usage.outlets}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-muted-foreground">Booth</dt>
                          <dd className="font-medium tabular-nums">{b.usage.photoboxes}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-muted-foreground">Sesi</dt>
                          <dd className="font-medium tabular-nums">{b.usage.sessions}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-muted-foreground">Tx</dt>
                          <dd className="font-medium tabular-nums">{b.usage.transactions}</dd>
                        </div>
                      </dl>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <StorageBadge storage={b.storage} />
                    </TableCell>
                    <TableCell>
                      <BusinessRowActions b={b} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          grid={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((b) => (
                <AdminRecordCard
                  key={b.id}
                  title={
                    <Link
                      href={`/admin/businesses/${b.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {b.name}
                    </Link>
                  }
                  subtitle={b.owner_email ?? "Tanpa owner"}
                  badge={
                    <div className="flex flex-col items-end gap-1">
                      <AdminStatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                      <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                    </div>
                  }
                  meta={[
                    { label: "Paket", value: b.plan_name ?? "-" },
                    {
                      label: "Booth online",
                      value: `${b.booths.online} / ${b.booths.total}`,
                    },
                    {
                      label: "Outlet",
                      value: `${b.usage.outlets} outlet`,
                    },
                    { label: "Sesi / Tx", value: `${b.usage.sessions} / ${b.usage.transactions}` },
                    {
                      label: "Storage",
                      value:
                        b.storage.limitMb > 0 ? `${b.storage.usedMb}/${b.storage.limitMb} MB` : "-",
                    },
                    {
                      label: "Heartbeat",
                      value: heartbeatLabel(b.lastHeartbeatAt, nowMs),
                    },
                  ]}
                  footer={
                    <Link
                      href={`/p/${b.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center text-xs underline decoration-muted-foreground/40 underline-offset-2 hover:bg-muted"
                    >
                      /p/{b.slug}
                    </Link>
                  }
                  actions={<BusinessRowActions b={b} />}
                />
              ))}
            </div>
          }
        />

        <AdminPaginator
          basePath="/admin/businesses"
          page={page}
          totalPages={totalPages}
          searchParams={{ search: q.search, status }}
        />
      </div>
    </div>
  );
}
