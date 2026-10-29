import { ChevronDown, ScrollText, Search } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { RecordCollection } from "@/components/admin/RecordCollection";
import { Button } from "@/components/ui/button";
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
  { value: "admin.audit_log", label: "AUDIT LOG" },
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
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN - AUDIT LOG"
        title="Log Audit"
        icon={ScrollText}
        meta={`${total} ENTRY · SEMUA AKSI ADMIN & FINANSIAL TERCATAT`}
      />

      <section className="border-2 border-ink bg-muted p-4 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"HAPUS RIWAYAT (RETENSI)"}
        </p>
        <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
          Hapus log audit lebih lama dari tanggal batas. Tindakan permanen - pastikan tidak ada
          investigasi/audit yang sedang berjalan.
        </p>
        <AdminActionForm
          action={deleteAuditLogsAction}
          submitLabel="Hapus Log Sebelum Tanggal"
          variant="destructive"
          confirm="Hapus seluruh log audit sebelum tanggal ini? Tindakan permanen dan tidak bisa dibatalkan."
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="audit-before"
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Hapus sebelum tanggal
            </label>
            <Input
              id="audit-before"
              name="before"
              type="date"
              required
              className="w-full sm:w-44"
            />
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
          <label
            htmlFor="audit-search"
            className="font-mono text-[11px] uppercase tracking-[0.12em]"
          >
            Cari aksi / target
          </label>
          <Input
            id="audit-search"
            name="search"
            defaultValue={q.search ?? ""}
            placeholder="admin.user.update"
            className="w-full sm:w-56"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          aria-label="Filter log"
          title="Filter log"
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>
      </form>

      {items.length === 0 ? (
        <AdminEmptyState heading="TIDAK ADA LOG" icon={ScrollText}>
          Tidak ada entry audit yang cocok dengan filter.
        </AdminEmptyState>
      ) : (
        <RecordCollection
          storageKey="snapyos.view.admin.audit"
          label="Log audit"
          list={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Aktor</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead className="hidden md:table-cell">Target</TableHead>
                  <TableHead className="hidden lg:table-cell">Bisnis</TableHead>
                  <TableHead className="hidden xl:table-cell">Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateTimeFmt.format(new Date(log.created_at))}
                    </TableCell>
                    <TableCell>
                      <span className="font-bold">{log.actor_email ?? "system"}</span>
                      {log.actor_name ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {log.actor_name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="break-all font-bold">{log.action}</TableCell>
                    <TableCell className="hidden break-all text-muted-foreground md:table-cell">
                      {log.target ?? "-"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {log.business_name ?? "-"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <details>
                        <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                          Lihat meta
                          <ChevronDown className="summary-chevron size-3.5" aria-hidden="true" />
                        </summary>
                        <pre className="mt-1 max-w-[40ch] whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                          {JSON.stringify(log.meta)}
                        </pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          grid={
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((log) => (
                <AdminRecordCard
                  key={log.id}
                  title={log.action}
                  subtitle={`${log.actor_email ?? "system"} · ${dateTimeFmt.format(new Date(log.created_at))}`}
                  meta={[
                    { label: "Target", value: log.target ?? "-" },
                    { label: "Bisnis", value: log.business_name ?? "-" },
                  ]}
                  footer={
                    <details className="border-t-2 border-ink/10 pt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Meta
                        <ChevronDown className="summary-chevron size-3.5" aria-hidden="true" />
                      </summary>
                      <pre className="mt-1 max-w-full whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                        {JSON.stringify(log.meta)}
                      </pre>
                    </details>
                  }
                />
              ))}
            </div>
          }
        />
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
