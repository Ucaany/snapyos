import Link from "next/link";
import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
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
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="ADMIN - BUSINESSES"
        title="Manajemen Bisnis"
        meta={`${total} tenant · suspend memblokir sesi & checkout baru`}
        right={
          <form method="GET" className="flex w-full flex-wrap items-end gap-2 sm:w-auto" role="search">
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
            <Button type="submit" size="sm" variant="secondary">
              Terapkan
            </Button>
          </form>
        }
      />

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA BISNIS"
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
                  {b.storage.limitMb > 0 ? (
                    <>
                      <span className={b.storage.isFull ? "font-bold text-destructive" : ""}>
                        {b.storage.usedMb} / {b.storage.limitMb} MB
                      </span>
                      <br />
                      <span
                        className={
                          "mt-1 inline-flex h-6 items-center border-2 border-ink px-2 text-[11px] font-bold uppercase tracking-[0.1em] " +
                          (b.storage.isFull ? "bg-accent-2" : "bg-accent-3")
                        }
                      >
                        {b.storage.isFull ? "PENUH - UPGRADE" : `AKTIF · ${b.storage.percent}%`}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex h-6 items-center border-2 border-ink/40 bg-muted px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      TIDAK AKTIF
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-start gap-2">
                    <AdminActionButton
                      action={updateBusinessAction}
                      hidden={{
                        businessId: b.id,
                        status: b.status === "suspended" ? "active" : "suspended",
                      }}
                      submitLabel={b.status === "suspended" ? "Aktifkan" : "Suspend"}
                      variant={b.status === "suspended" ? "secondary" : "destructive"}
                      confirm={
                        b.status === "suspended"
                          ? undefined
                          : `Suspend ${b.name}? Semua kiosk langsung diblokir dari checkout & sesi baru.`
                      }
                      confirmTitle={`Suspend ${b.name}`}
                    />
                    <AdminActionButton
                      action={deleteBusinessAction}
                      hidden={{ businessId: b.id }}
                      submitLabel="Hapus"
                      variant="destructive"
                      confirm={`Hapus ${b.name} permanen? Seluruh data tenant (outlet, photobox, sesi, transaksi, storage) ikut terhapus dan tidak bisa dikembalikan.`}
                      confirmTitle={`Hapus ${b.name}`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
