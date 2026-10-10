import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAuditLogsAction } from "@/server/admin-actions";
import { listAuditLogs } from "@/server/admin";

/**
 * Admin Audit Log - docs/10 §10.5. Semua aksi admin/finansial tercatat
 * audit_logs. Di sini admin bisa melihat + menghapus riwayat (retensi).
 */

const COMMON_ACTIONS = [
  { value: "admin.user", label: "USER" },
  { value: "admin.business", label: "BUSINESS" },
  { value: "admin.plan", label: "PLAN" },
  { value: "admin.subscription", label: "SUBSCRIPTION" },
  { value: "admin.settings", label: "SETTINGS" },
  { value: "admin.gateway", label: "GATEWAY" },
  { value: "admin.template", label: "TEMPLATE" },
  { value: "admin.withdrawal", label: "WITHDRAWAL" },
] as const;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; search?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const { items, total } = await listAuditLogs({
    action: q.action,
    search: q.search,
    page,
    limit: 50,
  });

  const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - AUDIT LOG"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Log Audit
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {total} ENTRY · SEMUA AKSI ADMIN & FINANSIAL TERCATAT
        </p>
      </header>

      <section className="border-2 border-ink bg-muted p-4 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"/// HAPUS RIWAYAT (RETENSI)"}
        </p>
        <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
          Hapus log audit lebih lama dari tanggal batas. Tindakan permanen -
          pastikan tidak ada investigasi/audit yang sedang berjalan.
        </p>
        <AdminActionForm
          action={deleteAuditLogsAction}
          submitLabel="Hapus Log Sebelum Tanggal"
          variant="destructive"
          confirm="Hapus seluruh log audit sebelum tanggal ini? Tindakan permanen dan tidak bisa dibatalkan."
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-before" className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Hapus sebelum tanggal
            </label>
            <Input id="audit-before" name="before" type="date" required className="w-44" />
          </div>
        </AdminActionForm>
      </section>

      <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
        <BrutalistSelect
          name="action"
          label="Prefix aksi"
          defaultValue={q.action ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...COMMON_ACTIONS.map((a) => ({ value: a.value, label: a.label })),
          ]}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-search" className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Cari aksi / target
          </label>
          <Input id="audit-search" name="search" defaultValue={q.search ?? ""} placeholder="admin.user.update" className="w-56" />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Filter log
        </Button>
      </form>

      {items.length === 0 ? (
        <AdminEmptyState heading="/// TIDAK ADA LOG">
          Tidak ada entry audit yang cocok dengan filter.
        </AdminEmptyState>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[960px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Waktu</th>
                <th className="px-4 py-3 font-bold">Aktor</th>
                <th className="px-4 py-3 font-bold">Aksi</th>
                <th className="px-4 py-3 font-bold">Target</th>
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id} className="border-t-2 border-ink/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {dateTimeFmt.format(new Date(log.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold">{log.actor_email ?? "system"}</span>
                    {log.actor_name ? (
                      <span className="block font-mono text-[10px] text-muted-foreground">{log.actor_name}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold break-all">{log.action}</td>
                  <td className="px-4 py-3 font-mono text-xs break-all text-muted-foreground">
                    {log.target ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {log.business_name ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.meta)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPaginator
        basePath="/admin/audit"
        page={page}
        totalPages={totalPages}
        searchParams={{ action: q.action, search: q.search }}
      />
    </div>
  );
}
