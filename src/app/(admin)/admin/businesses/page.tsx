import Link from "next/link";
import { Building2, Filter } from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Badge } from "@/components/admin/ui/badge";
import { Progress } from "@/components/admin/ui/progress";
import { Button, buttonVariants } from "@/components/admin/ui/button";
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
import { listBusinesses } from "@/server/admin";

type BusinessRow = Awaited<ReturnType<typeof listBusinesses>>["items"][number];

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
  const { items, total } = await listBusinesses({ search: q.search, status, page, limit: 20 });

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const filtered = Boolean(q.search || status);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Admin / Bisnis"
        title="Manajemen Bisnis"
        icon={Building2}
        meta={`${total} tenant · suspend memblokir sesi & checkout baru`}
      />

      <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
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
          <Link href="/admin/businesses" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Hapus filter
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
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
              Tidak ada bisnis yang cocok dengan filter saat ini. Hapus filter untuk melihat seluruh
              tenant.
            </>
          ) : (
            "Belum ada bisnis terdaftar di platform. Tenant muncul di sini setelah owner membuat bisnis pertama."
          )}
        </AdminEmptyState>
      ) : (
        <AdminRecordCollection
          storageKey="snapyos.view.admin.businesses"
          label="Daftar bisnis"
          list={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bisnis</TableHead>
                  <TableHead className="hidden lg:table-cell">Owner</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Pemakaian</TableHead>
                  <TableHead className="hidden lg:table-cell">Storage</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id} className="align-top">
                    <TableCell>
                      <span className="block text-sm font-medium">{b.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <Link
                          href={`/p/${b.slug}`}
                          target="_blank"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                        >
                          /p/{b.slug}
                        </Link>{" "}
                        · {dateFmt.format(new Date(b.created_at))}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{b.owner_email ?? "-"}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{b.plan_name ?? "-"}</span>
                      <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                    </TableCell>
                    <TableCell>
                      <AdminStatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {b.usage.outlets} outlet · {b.usage.photoboxes} booth
                      <br />
                      {b.usage.sessions} sesi · {b.usage.transactions} tx
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
                  title={b.name}
                  subtitle={b.owner_email ?? "Tanpa owner"}
                  badge={
                    <div className="flex flex-col items-end gap-1">
                      <AdminStatusBadge
                        status={b.status === "suspended" ? "inactive" : "active"}
                      />
                      <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                    </div>
                  }
                  meta={[
                    { label: "Paket", value: b.plan_name ?? "-" },
                    {
                      label: "Outlet / Booth",
                      value: `${b.usage.outlets} / ${b.usage.photoboxes}`,
                    },
                    { label: "Sesi / Tx", value: `${b.usage.sessions} / ${b.usage.transactions}` },
                    {
                      label: "Storage",
                      value:
                        b.storage.limitMb > 0 ? `${b.storage.usedMb}/${b.storage.limitMb} MB` : "-",
                    },
                  ]}
                  footer={
                    <Link
                      href={`/p/${b.slug}`}
                      target="_blank"
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
      )}

      <AdminPaginator
        basePath="/admin/businesses"
        page={page}
        totalPages={totalPages}
        searchParams={{ search: q.search, status }}
      />
    </div>
  );
}
