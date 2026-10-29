import Link from "next/link";
import { Building2 } from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { RecordCollection } from "@/components/admin/RecordCollection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <span className="inline-flex h-6 items-center border-2 border-ink/40 bg-muted px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        TIDAK AKTIF
      </span>
    );
  }
  return (
    <>
      <span className={storage.isFull ? "font-bold text-destructive" : ""}>
        {storage.usedMb} / {storage.limitMb} MB
      </span>
      <br />
      <span
        className={
          "mt-1 inline-flex h-6 items-center border-2 border-ink px-2 text-[11px] font-bold uppercase tracking-[0.1em] " +
          (storage.isFull ? "bg-accent-2" : "bg-accent-3")
        }
      >
        {storage.isFull ? "PENUH - UPGRADE" : `AKTIF · ${storage.percent}%`}
      </span>
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
        variant={suspended ? "secondary" : "destructive"}
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
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN - BUSINESSES"
        title="Manajemen Bisnis"
        icon={Building2}
        meta={`${total} tenant · suspend memblokir sesi & checkout baru`}
        right={
          <form
            method="GET"
            className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
            role="search"
          >
            <div className="flex w-full flex-col gap-1 sm:w-auto">
              <label
                htmlFor="biz-search"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Cari nama / slug
              </label>
              <Input
                id="biz-search"
                name="search"
                defaultValue={q.search ?? ""}
                className="w-full sm:w-56"
                placeholder="cth. klik-foto"
              />
            </div>
            <BrutalistSelect
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
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              aria-label="Terapkan filter"
              title="Terapkan filter"
            >
              Terapkan
            </Button>
          </form>
        }
      />

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA BISNIS"
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
        <RecordCollection
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
                      <span className="block text-sm font-bold">{b.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        <Link
                          href={`/p/${b.slug}`}
                          target="_blank"
                          className="inline-flex min-h-11 items-center underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                        >
                          /p/{b.slug}
                        </Link>{" "}
                        · {dateFmt.format(new Date(b.created_at))}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{b.owner_email ?? "-"}</TableCell>
                    <TableCell>
                      <span className="block font-bold uppercase">{b.plan_name ?? "-"}</span>
                      <StatusBadge status={b.subscription_status ?? "expired"} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
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
                      <StatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                      <StatusBadge status={b.subscription_status ?? "expired"} />
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
                      className="inline-flex min-h-11 items-center font-mono text-[11px] underline decoration-ink/40 underline-offset-2 hover:bg-muted"
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
