import Link from "next/link";
import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"ADMIN - BUSINESSES"}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
            Manajemen Bisnis
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {total} tenant · suspend memblokir sesi & checkout baru
          </p>
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2" role="search">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="biz-search"
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
            >
              Cari nama / slug
            </label>
            <Input
              id="biz-search"
              name="search"
              defaultValue={q.search ?? ""}
              className="w-56"
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
      </header>

      {items.length === 0 ? (
        <AdminEmptyState heading="TIDAK ADA BISNIS">
          {q.search || status ? (
            <>
              Tidak ada bisnis yang cocok dengan{" "}
              {q.search ? (
                <>
                  pencarian <span className="font-mono">{q.search}</span>
                </>
              ) : null}
              {q.search && status ? " dan " : null}
              {status ? (
                <>
                  filter status <span className="font-mono">{status}</span>
                </>
              ) : null}
              .
            </>
          ) : (
            "Belum ada bisnis terdaftar di platform."
          )}
        </AdminEmptyState>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[1000px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Owner</th>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Usage</th>
                <th className="px-4 py-3 font-bold">Storage</th>
                <th className="px-4 py-3 font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t-2 border-ink/10 align-top">
                  <td className="px-4 py-3">
                    <span className="block text-sm font-bold">{b.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      <Link
                        href={`/p/${b.slug}`}
                        target="_blank"
                        className="inline-flex min-h-11 items-center underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                      >
                        /p/{b.slug}
                      </Link>{" "}
                      · {dateFmt.format(new Date(b.created_at))}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{b.owner_email ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="block font-mono text-xs font-bold uppercase">
                      {b.plan_name ?? "-"}
                    </span>
                    <StatusBadge status={b.subscription_status ?? "expired"} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {b.usage.outlets} outlet · {b.usage.photoboxes} booth
                    <br />
                    {b.usage.sessions} sesi · {b.usage.transactions} tx
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {b.storage.limitMb > 0 ? (
                      <>
                        <span className={b.storage.isFull ? "font-bold text-destructive" : ""}>
                          {b.storage.usedMb} / {b.storage.limitMb} MB
                        </span>
                        <br />
                        <span
                          className={
                            "mt-1 inline-flex h-6 items-center border-2 border-ink px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] " +
                            (b.storage.isFull ? "bg-accent-2" : "bg-accent-3")
                          }
                        >
                          {b.storage.isFull ? "PENUH - UPGRADE" : `AKTIF · ${b.storage.percent}%`}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex h-6 items-center border-2 border-ink/40 bg-muted px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        TIDAK AKTIF
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                            : "Suspend bisnis ini? Semua kiosk langsung diblokir dari checkout & sesi baru."
                        }
                      />
                      <AdminActionButton
                        action={deleteBusinessAction}
                        hidden={{ businessId: b.id }}
                        submitLabel="Hapus"
                        variant="destructive"
                        confirm="Hapus bisnis ini permanen? Seluruh data tenant (outlet, photobox, sesi, transaksi, storage) ikut terhapus dan tidak bisa dikembalikan."
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
