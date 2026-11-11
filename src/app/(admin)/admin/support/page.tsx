import Link from "next/link";
import { CircleHelp, Filter } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { RecordCard } from "@/components/ui/record-card";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { RecordCollection } from "@/components/admin/RecordCollection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateSupportTicketStatusAction } from "@/server/admin-actions";
import { listSupportTicketsAdmin } from "@/server/admin";
import { STATUS_LABEL } from "@/lib/support-ticket-constants";

/**
 * Admin support tickets - docs/10 §10.6: tiket lintas tenant + ubah status
 * (open / needs_action / resolved). Semua aksi ter-audit + guarded requireAdmin.
 */

const STATUS_OPTIONS = [
  { value: "open", label: "TERBUKA" },
  { value: "needs_action", label: "BUTUH TINDAKAN" },
  { value: "resolved", label: "SELESAI" },
] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const { items, total } = await listSupportTicketsAdmin({ status: q.status, page, limit: 20 });

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN - SUPPORT TICKETS"
        title="Tiket Bantuan"
        icon={CircleHelp}
        meta={`SEMUA TENANT · ${total} TIKET COCOK FILTER`}
        right={
          <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
            <BrutalistSelect
              name="status"
              label="Status"
              defaultValue={q.status ?? ""}
              options={[
                { value: "", label: "SEMUA" },
                ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              aria-label="Filter tiket"
              title="Filter tiket"
            >
              <Filter className="size-4" aria-hidden="true" />
            </Button>
          </form>
        }
      />

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA TIKET"
          icon={CircleHelp}
          action={
            q.status ? (
              <Link
                href="/admin/support"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Hapus filter
              </Link>
            ) : null
          }
        >
          {q.status
            ? "Belum ada tiket dengan status ini. Hapus filter untuk melihat seluruh antrian."
            : "Belum ada tiket masuk. Tiket muncul di sini setelah owner mengirim laporan dari dashboard."}
        </AdminEmptyState>
      ) : (
        <RecordCollection
          storageKey="snapyos.view.admin.support"
          label="Daftar tiket bantuan"
          list={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subjek</TableHead>
                  <TableHead className="hidden md:table-cell">Bisnis</TableHead>
                  <TableHead className="hidden lg:table-cell">Kategori · Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Waktu</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[280px] text-sm font-semibold">
                      {t.subject}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{t.business_name}</TableCell>
                    <TableCell className="hidden text-[11px] uppercase text-muted-foreground lg:table-cell">
                      {t.category} · {t.area}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {dateFmt.format(new Date(t.created_at))}
                    </TableCell>
                    <TableCell>
                      <AdminActionForm
                        action={updateSupportTicketStatusAction}
                        hidden={{ ticketId: t.id }}
                        submitLabel="Simpan"
                        className="flex flex-wrap items-center gap-2"
                      >
                        <BrutalistSelect
                          name="status"
                          defaultValue={t.status}
                          aria-label={`Status tiket: ${t.subject}`}
                          options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                        />
                      </AdminActionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          grid={
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <RecordCard
                  key={t.id}
                  title={t.subject}
                  subtitle={`${t.category} · ${t.area}`}
                  badge={<StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />}
                  meta={[
                    { label: "Bisnis", value: t.business_name },
                    { label: "Waktu", value: dateFmt.format(new Date(t.created_at)) },
                  ]}
                  actions={
                    <AdminActionForm
                      action={updateSupportTicketStatusAction}
                      hidden={{ ticketId: t.id }}
                      submitLabel="Simpan status tiket"
                      icon="check"
                      iconOnly
                      className="flex w-full items-end gap-2"
                    >
                      <BrutalistSelect
                        id={`status-grid-${t.id}`}
                        name="status"
                        defaultValue={t.status}
                        aria-label={`Status tiket: ${t.subject}`}
                        options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                        wrapperClassName="min-w-0 flex-1"
                      />
                    </AdminActionForm>
                  }
                />
              ))}
            </div>
          }
        />
      )}

      <AdminPaginator
        basePath="/admin/support"
        page={page}
        totalPages={totalPages}
        searchParams={{ status: q.status }}
      />
    </div>
  );
}
