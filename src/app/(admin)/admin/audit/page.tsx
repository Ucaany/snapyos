import Link from "next/link";
import { Activity, Building2, ScrollText, Search, UserRound } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDisclosure } from "@/components/admin/AdminDisclosureCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
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
  const uniqueActors = new Set(items.map((log) => log.actor_email ?? "system")).size;
  const uniqueActions = new Set(items.map((log) => log.action)).size;
  const businessEntries = items.filter((log) => log.business_name).length;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Log Audit"
        icon={ScrollText}
        meta={`${total} entry · semua aksi admin & finansial tercatat`}
      />

      <section aria-labelledby="admin-audit-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-audit-metrics"
          title="Ikhtisar"
          description="Aktivitas admin dan finansial yang tercatat pada periode filter."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={ScrollText}
            label="Total entry"
            value={String(total)}
            sub="Cocok filter saat ini"
          />
          <AdminMetricCard
            tone="sky"
            icon={UserRound}
            label="Aktor di halaman"
            value={String(uniqueActors)}
            sub="Unik pada 50 entry ini"
          />
          <AdminMetricCard
            tone="sky"
            icon={Activity}
            label="Aksi di halaman"
            value={String(uniqueActions)}
            sub="Unik pada 50 entry ini"
          />
          <AdminMetricCard
            tone="neutral"
            icon={Building2}
            label="Entri bisnis"
            value={String(businessEntries)}
            sub="Pada 50 entry ini"
          />
        </div>
      </section>

      <section aria-labelledby="admin-audit-retention" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-audit-retention"
          title="Retensi data"
          description="Hapus log lama secara permanen sesuai kebijakan retensi."
        />

        <Card>
          <CardHeader>
            <CardTitle>Hapus riwayat (retensi)</CardTitle>
            <CardDescription className="max-w-[60ch] text-xs leading-relaxed">
              Hapus log audit lebih lama dari tanggal batas. Tindakan permanen. Pastikan tidak ada
              investigasi/audit yang sedang berjalan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminActionForm
              action={deleteAuditLogsAction}
              submitLabel="Hapus Log Sebelum Tanggal"
              variant="destructive"
              confirm="Hapus seluruh log audit sebelum tanggal ini? Tindakan permanen dan tidak bisa dibatalkan."
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="audit-before" className="text-xs font-medium text-muted-foreground">
                  Hapus sebelum tanggal
                </Label>
                <Input
                  id="audit-before"
                  name="before"
                  type="date"
                  required
                  className="w-full sm:w-44"
                />
              </div>
            </AdminActionForm>
          </CardContent>
        </Card>
      </section>

      <AdminRecordCollection
        storageKey="snapyos.view.admin.audit"
        label="Log audit"
        title="Daftar log audit"
        description={`${total} entry cocok filter${q.action || q.search ? " saat ini" : ""}.`}
        toolbar={
          <AdminFilterForm action="/admin/audit" className="flex flex-wrap items-end gap-3">
            <AdminSelect
              name="action"
              label="Prefix aksi"
              defaultValue={q.action ?? ""}
              options={[
                { value: "", label: "SEMUA" },
                ...COMMON_ACTIONS.map((a) => ({ value: a.value, label: a.label })),
              ]}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="audit-search" className="text-xs font-medium text-muted-foreground">
                Cari aksi / target
              </Label>
              <Input
                id="audit-search"
                name="search"
                defaultValue={q.search ?? ""}
                placeholder="admin.user.update"
                className="w-full sm:w-56"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              <Search className="size-4" aria-hidden="true" />
              Terapkan
            </Button>
            {q.action || q.search ? (
              <Link
                href="/admin/audit"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Hapus filter
              </Link>
            ) : null}
          </AdminFilterForm>
        }
        empty={
          items.length === 0 ? (
            <AdminEmptyState heading="Tidak ada log" icon={ScrollText}>
              Tidak ada entry audit yang cocok dengan filter.
            </AdminEmptyState>
          ) : undefined
        }
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
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateTimeFmt.format(new Date(log.created_at))}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{log.actor_email ?? "system"}</span>
                    {log.actor_name ? (
                      <span className="block text-xs text-muted-foreground">{log.actor_name}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="break-all font-medium">{log.action}</TableCell>
                  <TableCell className="hidden break-all text-muted-foreground md:table-cell">
                    {log.target ?? "-"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {log.business_name ?? "-"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <AdminDisclosure
                      triggerClassName="min-h-11 justify-start gap-1 text-xs text-muted-foreground hover:text-foreground"
                      trigger={<span>Lihat meta</span>}
                    >
                      <pre className="max-w-[40ch] whitespace-pre-wrap break-all text-xs text-muted-foreground">
                        {JSON.stringify(log.meta)}
                      </pre>
                    </AdminDisclosure>
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
                  <AdminDisclosure
                    className="border-t pt-2"
                    triggerClassName="min-h-11 justify-start gap-1 text-xs text-muted-foreground hover:text-foreground"
                    trigger={<span>Meta</span>}
                  >
                    <pre className="max-w-full whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {JSON.stringify(log.meta)}
                    </pre>
                  </AdminDisclosure>
                }
              />
            ))}
          </div>
        }
      />

      <AdminPaginator
        basePath="/admin/audit"
        page={page}
        totalPages={totalPages}
        searchParams={{ action: q.action, search: q.search }}
      />
    </div>
  );
}
